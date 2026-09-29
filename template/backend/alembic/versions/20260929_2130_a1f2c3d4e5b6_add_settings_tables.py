"""add settings tables

Revision ID: a1f2c3d4e5b6
Revises: 082172624b6d
Create Date: 2026-09-29 21:30:00.000000+00:00

Adds the factory's settings slice (`docs/design/settings.md`): a typed default
declared in code, an operator override held in `setting_overrides` (one row
per overridden key — a key with no row runs its code default), and an
append-only audit trail in `setting_changes`.

Neither is workspace-scoped (`db/registry.py`): a setting is app-wide,
declared once for the whole deployment and read and written under the
reserved `admin` entitlement.

An app taking this by `copier update` must repoint ``down_revision`` at its own
current head, exactly as the previous revision's docstring says.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1f2c3d4e5b6"
down_revision: str | None = "082172624b6d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "setting_overrides",
        sa.Column("key", sa.String(length=255), nullable=False),
        sa.Column("value", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("updated_by_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["updated_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("key"),
    )
    op.create_table(
        "setting_changes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("key", sa.String(length=255), nullable=False),
        sa.Column("old_value", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("new_value", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("changed_by_id", sa.Uuid(), nullable=True),
        sa.Column("changed_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["changed_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_setting_changes_key", "setting_changes", ["key"])


def downgrade() -> None:
    op.drop_index("ix_setting_changes_key", table_name="setting_changes")
    op.drop_table("setting_changes")
    op.drop_table("setting_overrides")
