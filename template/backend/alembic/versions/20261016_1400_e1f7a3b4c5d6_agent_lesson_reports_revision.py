"""agent lesson reports are one per job and revision

Revision ID: e1f7a3b4c5d6
Revises: d9e6f2a3b4c5
Create Date: 2026-10-16 14:00:00.000000+00:00

`revision` numbers the time round a job's result was taken (0 the first); the primary key becomes
`(job_id, revision)`, so an app that reopens a settled job files the later accept or correction as
its own report. Existing rows are revision 0.

An app taking this by `copier update` must repoint ``down_revision`` at its own current head.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e1f7a3b4c5d6"
down_revision: str | None = "d9e6f2a3b4c5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_PK = "agent_job_lesson_reports_pkey"


def upgrade() -> None:
    op.add_column(
        "agent_job_lesson_reports",
        sa.Column("revision", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )
    op.alter_column("agent_job_lesson_reports", "revision", server_default=None)
    op.drop_constraint(_PK, "agent_job_lesson_reports", type_="primary")
    op.create_primary_key(_PK, "agent_job_lesson_reports", ["job_id", "revision"])


def downgrade() -> None:
    op.execute("DELETE FROM agent_job_lesson_reports WHERE revision > 0")
    op.drop_constraint(_PK, "agent_job_lesson_reports", type_="primary")
    op.create_primary_key(_PK, "agent_job_lesson_reports", ["job_id"])
    op.drop_column("agent_job_lesson_reports", "revision")
