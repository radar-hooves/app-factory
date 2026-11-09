"""a setting change by a machine caller names who it was

Revision ID: e2a8b4c6d1f7
Revises: 5a3c9e71b2d4
Create Date: 2026-11-10 01:00:00.000000+00:00

`setting_changes.changed_by_machine` is the name of a machine caller (a Registry caller on the
embedded `/mcp`, which has no `users` row) that made the change; `changed_by_id` stays null for
it. Every existing row keeps a null.

An app taking this by `copier update` must repoint ``down_revision`` at its own current head.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e2a8b4c6d1f7"
down_revision: str | None = "5a3c9e71b2d4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("setting_changes", sa.Column("changed_by_machine", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("setting_changes", "changed_by_machine")
