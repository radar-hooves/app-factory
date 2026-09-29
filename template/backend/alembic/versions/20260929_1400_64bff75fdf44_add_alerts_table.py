"""add alerts table

Revision ID: 64bff75fdf44
Revises: 6278d62d47c2
Create Date: 2026-09-29 14:00:00.000000+00:00

Adds the factory's alerts slice (`docs/design/alerts.md`): what a machine told
this deployment's operator, one row per producer-chosen key. The UNIQUE on
`key` is load-bearing — `service.raise_alert`'s INSERT … ON CONFLICT (key) is
what turns a repeat raise into an update rather than a second alert.

Not workspace-scoped (`db/registry.py`): a producer names no workspace, and the
reader is whoever holds the reserved `admin` entitlement.

An app taking this by `copier update` must repoint ``down_revision`` at its own
current head, exactly as the previous revision's docstring says.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "64bff75fdf44"
down_revision: str | None = "6278d62d47c2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "alerts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("key", sa.String(length=255), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("link", sa.String(length=2048), nullable=True),
        sa.Column("raised_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("key"),
    )


def downgrade() -> None:
    op.drop_table("alerts")
