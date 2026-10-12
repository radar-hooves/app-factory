"""agent lesson reports carry the cited lessons a correction showed wrong

Revision ID: d9e6f2a3b4c5
Revises: c8d5e1f2a3b4
Create Date: 2026-10-13 12:00:00.000000+00:00

`contradicts` is core-memory's `lesson report` field of the same name: the ids among `cites`
the correction showed wrong. A report still unsettled keeps the empty default, which moves no
posterior.

An app taking this by `copier update` must repoint ``down_revision`` at its own current head.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d9e6f2a3b4c5"
down_revision: str | None = "c8d5e1f2a3b4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "agent_job_lesson_reports",
        sa.Column(
            "contradicts",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.alter_column("agent_job_lesson_reports", "contradicts", server_default=None)


def downgrade() -> None:
    op.drop_column("agent_job_lesson_reports", "contradicts")
