"""The settings slice, driven through HTTP, plus the declare-time refusals it cannot skip.

Each test declares its own settings into a fresh registry (`conftest.py`), so
the slice is proved whatever an app declares. `model_alias`'s reachability and
`narrow` are proved against the service with a fake gateway, since no live one
exists here.
"""

import importlib
import threading
import uuid
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from app_slices.settings import RefusedValue, SettingType, UndeclaredSetting, declare_setting, get_value, service
from app_slices.settings.declare import discover, get_declared
from app_slices.settings.models import SettingChange, SettingOverride
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

TOGGLE = "selftest.toggle"
LIMIT = "selftest.limit"


def _as(user: str, grade: str | None = None) -> dict[str, str]:
    return {"x-user": user} | ({"x-grade": grade} if grade else {})


@pytest.fixture(autouse=True)
def _two_settings() -> None:
    declare_setting(TOGGLE, type=SettingType.boolean, default=True, title="A toggle", description="")
    declare_setting(
        LIMIT, type=SettingType.integer, default=20, minimum=1, maximum=100, title="A limit", description=""
    )


# ── The gates the app mounts it with ──────────────────────────────────────────


async def test_every_route_takes_the_read_gate(client: AsyncClient) -> None:
    assert (await client.get("/api/settings/", headers=_as("somebody"))).status_code == 403
    assert (await client.get("/api/settings/history", headers=_as("somebody"))).status_code == 403


async def test_a_reader_can_look_but_not_write_or_reset(client: AsyncClient) -> None:
    assert (await client.get("/api/settings/", headers=_as("the-viewer", "read"))).status_code == 200
    written = await client.patch(f"/api/settings/{TOGGLE}", json={"value": False}, headers=_as("the-viewer", "read"))
    assert written.status_code == 403
    assert (await client.post(f"/api/settings/{TOGGLE}/reset", headers=_as("the-viewer", "read"))).status_code == 403


# ── The document ─────────────────────────────────────────────────────────────


async def test_the_document_carries_the_schema_and_the_defaults(client: AsyncClient) -> None:
    body = (await client.get("/api/settings/", headers=_as("an-admin", "read"))).json()

    assert body["schema"]["properties"][TOGGLE]["type"] == "boolean"
    bounded = body["schema"]["properties"][LIMIT]
    assert (bounded["type"], bounded["minimum"], bounded["maximum"]) == ("integer", 1, 100)
    assert body["value"] == {TOGGLE: True, LIMIT: 20}
    assert body["defaults"] == {TOGGLE: True, LIMIT: 20}
    # No `overridden` on the wire: the page derives it from `value` and `defaults`.
    assert "overridden" not in body


# ── Writing, resetting, and the trail they leave ─────────────────────────────


async def test_a_write_then_a_reset_round_trips_and_names_who(client: AsyncClient) -> None:
    writer = _as("the-writer", "write")

    written = await client.patch(f"/api/settings/{LIMIT}", json={"value": 50}, headers=writer)
    assert written.status_code == 200
    assert written.json() == {"key": LIMIT, "value": 50, "default": 20, "overridden": True}
    assert (await client.get("/api/settings/", headers=writer)).json()["value"][LIMIT] == 50

    reset = await client.post(f"/api/settings/{LIMIT}/reset", headers=writer)
    assert reset.json() == {"key": LIMIT, "value": 20, "default": 20, "overridden": False}

    history = (await client.get("/api/settings/history", headers=writer)).json()
    assert [(c["key"], c["old_value"], c["new_value"], c["changed_by"]) for c in history["changes"]] == [
        (LIMIT, 50, 20, "the-writer"),
        (LIMIT, 20, 50, "the-writer"),
    ]
    assert history["total"] == 2


async def test_a_refused_value_answers_422_in_the_household_error_body(client: AsyncClient) -> None:
    refused = await client.patch(f"/api/settings/{LIMIT}", json={"value": 500}, headers=_as("the-writer", "write"))
    assert refused.status_code == 422
    assert refused.json() == {"error": "validation_error", "message": f"{LIMIT!r} must be at most 100"}


async def test_an_undeclared_key_answers_404_to_a_write_and_a_reset(client: AsyncClient) -> None:
    writer = _as("the-writer", "write")
    missing = await client.patch("/api/settings/no.such.setting", json={"value": 1}, headers=writer)
    assert missing.status_code == 404
    assert missing.json()["error"] == "not_found"
    assert (await client.post("/api/settings/no.such.setting/reset", headers=writer)).status_code == 404


FAN_OUT = 5


def test_fanned_out_first_writes_to_a_setting_all_succeed(
    sessions: sessionmaker[Session], make_user: Callable[[], uuid.UUID], monkeypatch: pytest.MonkeyPatch
) -> None:
    """Several writers save the same never-overridden setting at once.

    Each writer's read of the current value is held until every writer has
    read, the interleaving where all of them find no override row and insert the
    first one. With a read then a conditional INSERT all but one would raise
    `IntegrityError`; the INSERT … ON CONFLICT upsert lets every one succeed and
    still records one change per write.
    """
    actor = make_user()
    real_get_value = service.get_value
    everyone_has_read = threading.Barrier(FAN_OUT, timeout=10)

    def read_then_wait_for_the_rest(session: Session, key: str) -> bool | int | float | str:
        value = real_get_value(session, key)
        everyone_has_read.wait()
        return value

    monkeypatch.setattr(service, "get_value", read_then_wait_for_the_rest)

    def write(n: int) -> None:
        with sessions.begin() as db:
            service.set_value(db, LIMIT, n + 1, actor_user_id=actor)

    with ThreadPoolExecutor(FAN_OUT) as pool:
        list(pool.map(write, range(FAN_OUT)))

    with sessions() as db:
        assert db.get(SettingOverride, LIMIT) is not None
        assert len(db.scalars(select(SettingChange).where(SettingChange.key == LIMIT)).all()) == FAN_OUT


# ── Declaring a setting ───────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("key", "title", "description"),
    [
        ("gateway.api_key", "A gateway key", ""),
        # A `string` holding a person's identifier under a permitted type: the
        # substring check, not the closed SettingType enum, has to catch it.
        ("alerts.notification_email", "Notification email", "Where to send an alert."),
    ],
)
def test_a_secret_or_identifier_shaped_setting_is_refused_at_declaration(
    key: str, title: str, description: str
) -> None:
    with pytest.raises(ValueError, match="secret or a person's identifier"):
        declare_setting(key, type=SettingType.string, default="", title=title, description=description)


def test_declaring_the_same_key_twice_is_refused() -> None:
    with pytest.raises(ValueError, match="already declared"):
        declare_setting(TOGGLE, type=SettingType.boolean, default=True, title="Twice", description="")


def test_discover_imports_each_domains_settings_module(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """An app's `api/<domain>/settings.py` is found by name, never listed."""
    package = f"domains_{uuid.uuid4().hex}"
    lights = tmp_path / package / "lights"
    lights.mkdir(parents=True)
    (lights / "settings.py").write_text(
        "from app_slices.settings import SettingType, declare_setting\n"
        "declare_setting('lights.dim_after_minutes', type=SettingType.integer, default=10,"
        " title='Dim after', description='')\n"
    )
    monkeypatch.syspath_prepend(str(tmp_path))
    discover(importlib.import_module(package))
    assert get_declared("lights.dim_after_minutes") is not None


# ── model_alias: reachability, narrowing, and degrading when the gateway is down ──


def test_model_alias_offers_and_accepts_only_what_narrow_admits(
    sessions: sessionmaker[Session], make_user: Callable[[], uuid.UUID]
) -> None:
    key = "reading.model"
    declare_setting(
        key,
        type=SettingType.model_alias,
        default="mimir/deep",
        title="A model",
        description="",
        list_models=lambda: ["mimir/deep", "goku/fast"],
        narrow=lambda alias: None if alias.startswith("mimir/") else f"{alias} is not a Tier-3 alias",
    )
    assert service.build_schema()["properties"][key]["enum"] == ["mimir/deep"]

    actor = make_user()
    with sessions.begin() as db:
        with pytest.raises(RefusedValue, match="not a Tier-3 alias"):
            service.set_value(db, key, "goku/fast", actor_user_id=actor)
        service.set_value(db, key, "mimir/deep", actor_user_id=actor)
        assert get_value(db, key) == "mimir/deep"


def test_model_alias_degrades_rather_than_refuses_when_the_gateway_is_unreachable(
    sessions: sessionmaker[Session], make_user: Callable[[], uuid.UUID]
) -> None:
    key = "reading.model"

    def unreachable() -> list[str]:
        raise ConnectionError("gateway is down")

    declare_setting(
        key, type=SettingType.model_alias, default="any/thing", title="A model", description="", list_models=unreachable
    )
    prop = service.build_schema()["properties"][key]
    assert "enum" not in prop
    assert "could not confirm" in prop["description"]

    actor = make_user()
    with sessions.begin() as db:
        service.set_value(db, key, "whatever/works", actor_user_id=actor)


def test_get_value_raises_for_an_undeclared_key(sessions: sessionmaker[Session]) -> None:
    with sessions() as db, pytest.raises(UndeclaredSetting):
        get_value(db, "no.such.setting")
