"""add agent job lesson reports table

Revision ID: f3a9c1d8e2b4
Revises: a1f2c3d4e5b6
Create Date: 2026-09-29 22:00:00.000000+00:00

The agent-jobs slice's report of a job's cited lessons to core-memory
(`docs/design/agent-lessons.md`). `WorkspaceScoped` like its parent
`agent_jobs`, `workspace_id`/`created_by_id` denormalised down the same way
`agent_job_events`' already are.

An app taking this by `copier update` must repoint ``down_revision`` at its own
current head, exactly as the previous revision's docstring says.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f3a9c1d8e2b4"
down_revision: str | None = "a1f2c3d4e5b6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "agent_job_lesson_reports",
        sa.Column("job_id", sa.String(length=128), nullable=False),
        sa.Column("cites", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("domain_name", sa.String(length=255), nullable=False),
        sa.Column("context_key", sa.String(length=255), nullable=False),
        sa.Column("result", sa.String(length=16), nullable=False),
        sa.Column("decision_id", sa.String(length=64), nullable=True),
        sa.Column("refused", sa.Text(), nullable=True),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("claimed_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("created_by_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("job_id"),
    )
    op.create_index(op.f("ix_agent_job_lesson_reports_workspace_id"), "agent_job_lesson_reports", ["workspace_id"])
    op.create_foreign_key(
        "fk_agent_job_lesson_reports_job_id_agent_jobs",
        "agent_job_lesson_reports",
        "agent_jobs",
        ["job_id"],
        ["job_id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_agent_job_lesson_reports_workspace_id_workspaces",
        "agent_job_lesson_reports",
        "workspaces",
        ["workspace_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_agent_job_lesson_reports_created_by_id_users",
        "agent_job_lesson_reports",
        "users",
        ["created_by_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_agent_job_lesson_reports_created_by_id_users", "agent_job_lesson_reports", type_="foreignkey"
    )
    op.drop_constraint(
        "fk_agent_job_lesson_reports_workspace_id_workspaces", "agent_job_lesson_reports", type_="foreignkey"
    )
    op.drop_constraint("fk_agent_job_lesson_reports_job_id_agent_jobs", "agent_job_lesson_reports", type_="foreignkey")
    op.drop_index(op.f("ix_agent_job_lesson_reports_workspace_id"), table_name="agent_job_lesson_reports")
    op.drop_table("agent_job_lesson_reports")
