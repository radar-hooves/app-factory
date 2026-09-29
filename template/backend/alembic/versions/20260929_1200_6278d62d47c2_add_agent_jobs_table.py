"""add agent_jobs table

Revision ID: 6278d62d47c2
Revises: c272c6ce5f31
Create Date: 2026-09-29 12:00:00.000000+00:00

Adds the factory's agent JOB slice (`docs/design/agent-jobs.md`): a persona
session the app itself starts, with no asker, that keeps running once the
request that started it has returned. `agent_jobs` is one row per job,
keyed on Claude Code's own session id (minted by this slice before the CLI
first runs, unlike `agent_sessions`' claim-on-init); `agent_job_events`
holds every event that session emitted, verbatim, in landing order, so a
caller who opens the job after it started sees the same stream a caller
watching live would have seen.

Neither table carries a `user_id`: a job is started by the APP, not an
asker, and any caller entitled to the persona may watch, message or stop
it — `api/agent/ownership.py`'s per-asker ownership is a different slice's
concern, for a different kind of session.

An app taking this by `copier update` must repoint ``down_revision`` at its own
current head, exactly as the previous revision's docstring says.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "6278d62d47c2"
down_revision: str | None = "c272c6ce5f31"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "agent_jobs",
        sa.Column("job_id", sa.String(length=128), nullable=False),
        sa.Column("persona", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("json_schema", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("append_system_prompt", sa.Text(), nullable=True),
        sa.Column("structured_output", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("job_id"),
    )
    op.create_index(op.f("ix_agent_jobs_persona"), "agent_jobs", ["persona"])
    op.create_table(
        "agent_job_events",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("job_id", sa.String(length=128), nullable=False),
        sa.Column("event", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["job_id"], ["agent_jobs.job_id"], ondelete="CASCADE"),
    )
    op.create_index(op.f("ix_agent_job_events_job_id"), "agent_job_events", ["job_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_agent_job_events_job_id"), table_name="agent_job_events")
    op.drop_table("agent_job_events")
    op.drop_index(op.f("ix_agent_jobs_persona"), table_name="agent_jobs")
    op.drop_table("agent_jobs")
