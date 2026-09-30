"""agent_conversations replaces agent_sessions; agent_question_counts

Revision ID: d63b309b1239
Revises: f3a9c1d8e2b4
Create Date: 2026-09-30 14:00:00.000000+00:00

Rooms (`docs/design/agent-console.md`): a person's conversation in a room,
its title, whether an answer is being written, and the slice's record of
every question asked (`api/agent/conversations.py`); and one person's daily
question count across every room (`api/agent/quota.py`). Both CASCADE on the
user, personal-subject like the table they replace.

Every `agent_sessions` row moves across with its own id, owned as before.
That slice never recorded which persona a session was with, so a carried
conversation is in no room (`room` empty) and no page lists it; an app that
knows sets `room` in a data migration of its own.

An app taking this by `copier update` must repoint ``down_revision`` at its own
current head, exactly as the previous revision's docstring says.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d63b309b1239"
down_revision: str | None = "f3a9c1d8e2b4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _timestamps() -> list[sa.Column[sa.DateTime]]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "agent_conversations",
        sa.Column("id", sa.String(length=128), nullable=False),
        sa.Column("session_id", sa.String(length=128), nullable=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("room", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("last_activity_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("turns", sa.JSON(), server_default=sa.text("'[]'"), nullable=False),
        sa.Column("answering_since", sa.DateTime(timezone=True), nullable=True),
        sa.Column("stop_requested", sa.Boolean(), server_default=sa.false(), nullable=False),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_agent_conversations_owner", "agent_conversations", ["user_id", "room", "last_activity_at"])
    op.create_table(
        "agent_question_counts",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("user_id", "day"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.execute(
        "INSERT INTO agent_conversations"
        " (id, session_id, user_id, room, title, last_activity_at, created_at, updated_at)"
        " SELECT session_id, session_id, user_id, '', 'Earlier conversation', updated_at, created_at, updated_at"
        " FROM agent_sessions"
    )
    op.drop_index(op.f("ix_agent_sessions_user_id"), table_name="agent_sessions")
    op.drop_table("agent_sessions")


def downgrade() -> None:
    op.create_table(
        "agent_sessions",
        sa.Column("session_id", sa.String(length=128), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        *_timestamps(),
        sa.PrimaryKeyConstraint("session_id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index(op.f("ix_agent_sessions_user_id"), "agent_sessions", ["user_id"])
    op.execute(
        "INSERT INTO agent_sessions (session_id, user_id, created_at, updated_at)"
        " SELECT session_id, user_id, created_at, updated_at FROM agent_conversations WHERE session_id IS NOT NULL"
    )
    op.drop_table("agent_question_counts")
    op.drop_index("ix_agent_conversations_owner", table_name="agent_conversations")
    op.drop_table("agent_conversations")
