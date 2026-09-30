"""A real Postgres and a minimal app mounting the settings slice as the factory's does.

The app is the least an app gives the slice: a `users` table on the shared
MetaData, a session generator that commits after the route, an actor that signs
the caller in on that same session, and a read and a write gate read off one
header. Anything a real app adds beyond those is the app's own suite's to prove.
"""

import secrets
import types
import uuid
from collections.abc import AsyncIterator, Callable, Iterator
from typing import Annotated

import pytest
from app_slices import settings
from app_slices.db import metadata
from app_slices.settings import declare
from app_slices.settings.models import SettingChange, SettingOverride
from fastapi import Depends, FastAPI, Header, HTTPException, params
from httpx import ASGITransport, AsyncClient
from sqlalchemy import Engine, String, create_engine, delete, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker
from testcontainers.community.postgres import PostgresContainer


class _AppBase(DeclarativeBase):
    """The app's own Base, adopting the kit's MetaData as `db/base.py` does."""

    metadata = metadata


class User(_AppBase):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String(255), unique=True)


@pytest.fixture(scope="session")
def engine() -> Iterator[Engine]:
    with PostgresContainer(
        image="postgres:17-alpine", username="postgres", password=secrets.token_urlsafe(16), driver=None
    ) as postgres:
        url = postgres.get_connection_url().replace("postgresql://", "postgresql+psycopg://", 1)
        engine = create_engine(url)
        metadata.create_all(engine)
        yield engine
        engine.dispose()


@pytest.fixture
def sessions(engine: Engine) -> Iterator[sessionmaker[Session]]:
    """A session factory; every row a test wrote is gone after it."""
    factory = sessionmaker(engine, autoflush=False, expire_on_commit=False)
    yield factory
    with factory.begin() as db:
        for model in (SettingChange, SettingOverride, User):
            db.execute(delete(model))


@pytest.fixture
def make_user(sessions: sessionmaker[Session]) -> Callable[[], uuid.UUID]:
    """Make a real `users` row, for a service call's actor, and return its id."""

    def make() -> uuid.UUID:
        with sessions.begin() as db:
            user = User(username=f"user-{uuid.uuid4().hex[:8]}")
            db.add(user)
            db.flush()
            return user.id

    return make


@pytest.fixture(autouse=True)
def _own_registry(monkeypatch: pytest.MonkeyPatch) -> None:
    """A fresh registry per test, so a test's declarations end with it."""
    monkeypatch.setattr(declare, "_REGISTRY", {})


def _gate(*grades: str) -> params.Depends:
    def check(x_grade: Annotated[str | None, Header()] = None) -> None:
        if x_grade not in grades:
            raise HTTPException(status_code=403)

    return params.Depends(check)


@pytest.fixture
async def client(sessions: sessionmaker[Session]) -> AsyncIterator[AsyncClient]:
    def get_session() -> Iterator[Session]:
        with sessions() as db:
            yield db
            db.commit()

    def current_user(
        x_user: Annotated[str, Header()], db: Annotated[Session, Depends(get_session, scope="function")]
    ) -> User:
        user = db.scalar(select(User).where(User.username == x_user))
        if user is None:
            user = User(username=x_user)
            db.add(user)
            db.flush()
        return user

    no_domains = types.ModuleType("no_domains")
    no_domains.__path__ = []
    app = FastAPI()
    app.include_router(
        settings.router(
            domains=no_domains,
            session=get_session,
            actor=current_user,
            read=_gate("read", "write"),
            write=_gate("write"),
        ),
        prefix="/api/settings",
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http:
        yield http
