"""a workspace membership is accepted by the person it grants

Revision ID: 5a3c9e71b2d4
Revises: d943d70b8845
Create Date: 2026-11-08 15:00:00.000000+00:00

`workspace_memberships.status` is `pending` (an owner's invitation) or `accepted` (the person
took it). Every existing row migrates as `accepted`, so no standing grant lapses; only an
invitation written after this revision waits on its invitee. Nothing that resolves a workspace
reads a pending row.

Depends on the barrier, which retyped the table's keys (`docs/development/migrations.md`).
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "5a3c9e71b2d4"
down_revision: str | None = "d943d70b8845"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = "2bce3d4f6105"


def upgrade() -> None:
    op.add_column(
        "workspace_memberships",
        sa.Column("status", sa.String(length=16), nullable=False, server_default="accepted"),
    )


def downgrade() -> None:
    # Without the column a pending row would read as a standing grant.
    op.execute("DELETE FROM workspace_memberships WHERE status = 'pending'")
    op.drop_column("workspace_memberships", "status")
