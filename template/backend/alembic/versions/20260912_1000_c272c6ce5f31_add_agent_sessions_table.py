"""add agent_sessions table

Revision ID: c272c6ce5f31
Revises: 1c3b08a0ec2e
Create Date: 2026-09-12 10:00:00.000000+00:00

Adds the factory's agent slice (`docs/design/agent-console.md`): one row per
issued Claude Code session, recording which local user it was issued to, so a
`--resume` presented by a different identity is refused rather than honoured
(`api/agent/ownership.py`, lifted from radar-hooves/library#125's own fix).
CASCADE on the user, like `feedback_reports`: a conversation is
personal-subject to whoever asked (`db/registry.py`'s exemption), not
workspace-scoped data, and nothing else references it.

An app taking this by `copier update` must repoint ``down_revision`` at its own
current head, exactly as the previous revision's docstring says.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c272c6ce5f31"
down_revision: str | None = "1c3b08a0ec2e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "agent_sessions",
        sa.Column("session_id", sa.String(length=128), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("session_id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index(op.f("ix_agent_sessions_user_id"), "agent_sessions", ["user_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_agent_sessions_user_id"), table_name="agent_sessions")
    op.drop_table("agent_sessions")
