"""agent jobs carry core-memory's lesson loop

Revision ID: c8d5e1f2a3b4
Revises: b7e4a2c9d1f3
Create Date: 2026-10-13 01:00:00.000000+00:00

A job declares its lessons (`agent_jobs.lessons`) and the report becomes core-memory's
`lesson report` (`app-factory docs/design/agent-lessons.md`): the report row holds the situation, the
accepted flag, what was loaded and cited, and the person's corrections instead of a
decision/outcome pair. A report still unsettled is converted, not dropped: its context key
becomes a one-key situation and its result the accepted flag. A job row from before has no
`lessons`, so nothing new is filed for it.

An app taking this by `copier update` must repoint ``down_revision`` at its own
current head, exactly as the previous revision's docstring says.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c8d5e1f2a3b4"
down_revision: str | None = "b7e4a2c9d1f3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_REPORTS = "agent_job_lesson_reports"
_JSONB = postgresql.JSONB(astext_type=sa.Text())


def upgrade() -> None:
    op.add_column("agent_jobs", sa.Column("lessons", _JSONB, nullable=True))
    op.add_column(_REPORTS, sa.Column("situation", _JSONB, nullable=True))
    op.add_column(_REPORTS, sa.Column("accepted", sa.Boolean(), nullable=True))
    op.add_column(_REPORTS, sa.Column("loaded", _JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")))
    op.add_column(_REPORTS, sa.Column("attempts", sa.Integer(), nullable=False, server_default="1"))
    op.add_column(_REPORTS, sa.Column("seconds", sa.Float(), nullable=True))
    op.add_column(_REPORTS, sa.Column("model", sa.String(length=255), nullable=False, server_default=""))
    op.add_column(_REPORTS, sa.Column("corrections", _JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")))
    op.execute(f"UPDATE {_REPORTS} SET situation = jsonb_build_array(context_key), accepted = (result = 'confirm')")
    op.alter_column(_REPORTS, "situation", nullable=False)
    op.alter_column(_REPORTS, "accepted", nullable=False)
    for column in ("loaded", "attempts", "model", "corrections"):
        op.alter_column(_REPORTS, column, server_default=None)
    op.drop_column(_REPORTS, "context_key")
    op.drop_column(_REPORTS, "result")
    op.drop_column(_REPORTS, "decision_id")


def downgrade() -> None:
    op.add_column(_REPORTS, sa.Column("decision_id", sa.String(length=64), nullable=True))
    op.add_column(_REPORTS, sa.Column("result", sa.String(length=16), nullable=True))
    op.add_column(_REPORTS, sa.Column("context_key", sa.String(length=255), nullable=True))
    op.execute(
        f"UPDATE {_REPORTS} SET context_key = situation->>(jsonb_array_length(situation) - 1), "
        "result = CASE WHEN accepted THEN 'confirm' ELSE 'contradict' END"
    )
    op.alter_column(_REPORTS, "result", nullable=False)
    op.alter_column(_REPORTS, "context_key", nullable=False)
    for column in ("corrections", "model", "seconds", "attempts", "loaded", "accepted", "situation"):
        op.drop_column(_REPORTS, column)
    op.drop_column("agent_jobs", "lessons")
