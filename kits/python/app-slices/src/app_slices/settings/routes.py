"""HTTP routes for runtime settings: the operator's page (`docs/design/settings.md`).

An app mounts them with its own session, actor and gates, the same dependencies
its own routes use, so this slice holds no second gate and no identity of its
own. In the factory's `api/main.py`:

    api_router.include_router(
        settings.router(
            domains=api,  # imports every api/<domain>/settings.py
            session=get_session,
            actor=get_current_user,
            read=module_dependency("admin"),
            write=module_dependency("admin", write=True),
        ),
        prefix="/settings",
        tags=["settings"],
    )
"""

import uuid
from collections.abc import Callable, Iterator
from types import ModuleType
from typing import Annotated, Protocol

from fastapi import APIRouter, Depends, Query, params
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app_slices.settings import service
from app_slices.settings.declare import all_settings, discover
from app_slices.settings.schemas import SettingHistoryList, SettingRead, SettingsDocument, SettingUpdate

MAX_HISTORY_PAGE_SIZE = 200


class Actor(Protocol):
    """Whoever the `actor` dependency resolves: the app's user row, or anything with its id."""

    @property
    def id(self) -> uuid.UUID: ...


def _refused(exc: service.SettingsError) -> JSONResponse:
    """The household error body (`{"error", "message"}`), as an app's own handlers write it."""
    return JSONResponse(status_code=exc.status_code, content={"error": exc.error_code, "message": str(exc)})


def router(
    *,
    domains: ModuleType,
    session: Callable[..., Iterator[Session]],
    actor: Callable[..., Actor],
    read: params.Depends,
    write: params.Depends,
) -> APIRouter:
    """The settings routes, bound to this app.

    Args:
        domains: the package whose `<domain>/settings.py` modules declare
            settings (`declare.discover`); imported here, once.
        session: the app's session generator. Taken with `scope="function"`,
            as the app's own routes take it, so the session commits before the
            response is sent and `actor` resolves on the same one.
        actor: a dependency resolving the caller, recorded on every change.
        read: the gate on every route.
        write: the further gate on a write or a reset.
    """
    discover(domains)
    routes = APIRouter(dependencies=[read])

    @routes.get("/", response_model=SettingsDocument, operation_id="getSettings")
    def get_settings_document(db: Annotated[Session, Depends(session, scope="function")]) -> SettingsDocument:
        """The JSON Schema, the effective values, and their declared defaults.

        Everything `<SchemaForm>` needs to render the page, and everything the
        "overridden from default" panel needs beside it — which keys are
        overridden is left for the frontend to derive from `value`/`defaults`.
        """
        values = service.get_effective_values(db)
        defaults = {setting.key: setting.default for setting in all_settings()}
        return SettingsDocument(schema_=service.build_schema(), value=values, defaults=defaults)

    @routes.patch("/{key}", response_model=SettingRead, dependencies=[write], operation_id="updateSetting")
    def update_setting(
        key: str,
        data: SettingUpdate,
        db: Annotated[Session, Depends(session, scope="function")],
        caller: Annotated[Actor, Depends(actor)],
    ) -> SettingRead | JSONResponse:
        """Set `key`'s override to `data.value`: 404 if nothing declared it, 422 if the value is refused."""
        try:
            value, default = service.set_value(db, key, data.value, actor_user_id=caller.id)
        except service.SettingsError as exc:
            return _refused(exc)
        return SettingRead(key=key, value=value, default=default, overridden=value != default)

    @routes.post("/{key}/reset", response_model=SettingRead, dependencies=[write], operation_id="resetSetting")
    def reset_setting(
        key: str,
        db: Annotated[Session, Depends(session, scope="function")],
        caller: Annotated[Actor, Depends(actor)],
    ) -> SettingRead | JSONResponse:
        """Delete `key`'s override, reverting it to its declared default: 404 if nothing declared it."""
        try:
            default = service.reset_value(db, key, actor_user_id=caller.id)
        except service.SettingsError as exc:
            return _refused(exc)
        return SettingRead(key=key, value=default, default=default, overridden=False)

    @routes.get("/history", response_model=SettingHistoryList, operation_id="listSettingHistory")
    def get_history(
        db: Annotated[Session, Depends(session, scope="function")],
        limit: int = Query(default=50, ge=1, le=MAX_HISTORY_PAGE_SIZE, description="Page size"),
        offset: int = Query(default=0, ge=0, description="Page offset"),
    ) -> SettingHistoryList:
        """The append-only change log, newest first — who changed what, when."""
        changes, total = service.list_history(db, limit=limit, offset=offset)
        return SettingHistoryList(changes=changes, total=total, limit=limit, offset=offset)

    return routes
