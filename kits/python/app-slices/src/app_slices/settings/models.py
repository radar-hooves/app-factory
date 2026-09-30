"""ORM models for the settings slice: the override, and its audit trail.

Neither carries a declaration — that lives in `declare.py`'s in-process
registry, populated at import time. These two tables hold only what a
declaration cannot: the operator's actual choice, and who made it when.

Both reference the users slice's `users.id`, so an app mounting this slice has
that table on the shared MetaData (`app_slices.db`). Their creation migration is
the app's own, seeded by the factory (`add_settings_tables`); these models are
what that migration creates, column for column.
"""

import datetime
import uuid

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app_slices.db import KitBase


class SettingOverride(KitBase):
    """One overridden setting. A key with no row here runs its code default.

    Not workspace-scoped: app-wide, read and written under the gate the app
    mounts the router with (an app's `db/registry.py` exempts it, the same
    bucket as `Alert`). `value` is JSONB so a bool, int, float or string
    round-trips through the same column without a per-type cast.
    """

    __tablename__ = "setting_overrides"

    key: Mapped[str] = mapped_column(String(255), primary_key=True)
    value: Mapped[bool | int | float | str] = mapped_column(JSONB, nullable=False)
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class SettingChange(KitBase):
    """One row per change to a setting's effective value, append-only.

    Never updated or deleted — a reset is a new row recording `new_value` as
    the declared default, not a delete of the override (pebblestone's ISO
    9001 7.5.3 need: who, when, key, old value, new value, readable by an
    admin, with no destructive path).
    """

    __tablename__ = "setting_changes"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    old_value: Mapped[bool | int | float | str | None] = mapped_column(JSONB, nullable=True)
    new_value: Mapped[bool | int | float | str] = mapped_column(JSONB, nullable=False)
    changed_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    changed_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
