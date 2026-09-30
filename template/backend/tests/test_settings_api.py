"""The settings slice as `api/main.py` mounts it: this app's gate, caller and domains.

The slice itself is proved in its kit (`kits/python/app-slices`); what only an
app can prove is the mount: the admin entitlement gates it, the signed-in user
is who a change records, and every `api/<domain>/settings.py` is found.
"""

from httpx import AsyncClient


def _headers(uid: str, entitlements: str | None = None) -> dict[str, str]:
    headers = {"x-authentik-uid": uid, "x-authentik-username": uid}
    if entitlements is not None:
        headers["x-authentik-entitlements"] = entitlements
    return headers


async def test_the_admin_entitlement_gates_reading_and_writing(client: AsyncClient) -> None:
    refused = await client.get("/api/settings/", headers=_headers("somebody"))
    assert refused.status_code == 403
    assert refused.json()["details"] == {"module": "admin", "grade": "read"}

    assert (await client.get("/api/settings/", headers=_headers("the-viewer", "admin"))).status_code == 200
    written = await client.post("/api/settings/some.key/reset", headers=_headers("the-viewer", "admin"))
    assert written.status_code == 403
    assert written.json()["details"] == {"module": "admin", "grade": "write"}


async def test_a_change_records_the_signed_in_user(client: AsyncClient) -> None:
    admin = _headers("the-writer", "admin:write")
    key = "example.max_items_per_page"

    written = await client.patch(f"/api/settings/{key}", json={"value": 50}, headers=admin)
    assert written.status_code == 200

    history = (await client.get("/api/settings/history", headers=admin)).json()
    assert (key, 50, "the-writer") in [(c["key"], c["new_value"], c["changed_by"]) for c in history["changes"]]


async def test_each_domains_declared_settings_are_on_the_page(client: AsyncClient) -> None:
    document = (await client.get("/api/settings/", headers=_headers("an-admin", "admin"))).json()
    assert {"example.new_item_button_enabled", "example.max_items_per_page"} <= document["schema"]["properties"].keys()
