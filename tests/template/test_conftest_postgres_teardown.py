"""A failed stop of the ephemeral test Postgres keeps its metadata and names the container."""

import logging
import re
from pathlib import Path
from types import SimpleNamespace

import pytest

CONFTEST = Path(__file__).resolve().parents[2] / "template/backend/tests/conftest.py.jinja"


class _Lock:
    def __init__(self, *_a): ...
    def __enter__(self):
        return self

    def __exit__(self, *_a):
        return False


@pytest.fixture
def conftest(tmp_path: Path):
    """The teardown functions alone, exec'd from the template source with the module globals stubbed."""
    text = CONFTEST.read_text()
    source = text[text.index("def _stop_ephemeral_postgres") : text.index("def _resolve_test_server")]
    assert not re.search(r"{[{%]", source)
    metadata = tmp_path / "pg.json"
    metadata.write_text("{}")
    namespace = {
        "logging": logging,
        "Path": Path,
        "FileLock": _Lock,
        "_SHARED_SERVER_FILE": metadata,
        "_PUBLISHED_SHARED_SERVER": True,
        "_EPHEMERAL_POSTGRES": None,
    }
    exec(compile(source, str(CONFTEST), "exec"), namespace)
    return SimpleNamespace(ns=namespace, metadata=metadata)


def _container(stop):
    wrapped = SimpleNamespace(id="abc123", labels={"org.testcontainers.session-id": "sess-9"})
    return SimpleNamespace(stop=stop, get_wrapped_container=lambda: wrapped)


def _boom():
    raise TimeoutError("Read timed out. (read timeout=60)")


def test_failed_stop_keeps_metadata_and_names_the_container(conftest, caplog) -> None:
    conftest.ns["_EPHEMERAL_POSTGRES"] = _container(_boom)
    conftest.ns["_stop_ephemeral_postgres"]()
    assert Path(f"{conftest.metadata}.stopping").exists()
    assert "abc123" in caplog.text and "sess-9" in caplog.text


def test_successful_stop_removes_metadata(conftest) -> None:
    conftest.ns["_EPHEMERAL_POSTGRES"] = _container(lambda: None)
    conftest.ns["_stop_ephemeral_postgres"]()
    assert not conftest.metadata.exists()


def test_settings_unreadable_at_usual_path_during_stop(conftest) -> None:
    seen = []

    def stop() -> None:
        seen.append(conftest.metadata.exists())

    conftest.ns["_EPHEMERAL_POSTGRES"] = _container(stop)
    conftest.ns["_stop_ephemeral_postgres"]()
    assert seen == [False]


def test_failed_stop_keeps_the_renamed_file(conftest, caplog) -> None:
    conftest.ns["_EPHEMERAL_POSTGRES"] = _container(_boom)
    conftest.ns["_stop_ephemeral_postgres"]()
    stopping = Path(f"{conftest.metadata}.stopping")
    assert stopping.exists() and not conftest.metadata.exists()
    assert str(stopping) in caplog.text
