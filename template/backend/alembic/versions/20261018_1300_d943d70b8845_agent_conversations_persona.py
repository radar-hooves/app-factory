"""a conversation is with a persona

Revision ID: d943d70b8845
Revises:
Create Date: 2026-10-18 13:00:00.000000+00:00

`agent_conversations.room` becomes `persona`: a person chats with the app's persona over the
collections they may read, and the persona, not a room, is what a conversation is with. The values
are kept. A row whose value names no persona in `config/chat.yaml` is listed nowhere and refused as
a conversation that is not the person's; an app maps its own values in a migration of its own
(`docs/design/agent-console.md` §What each app does with its data).

The first migration on the factory branch (`docs/development/migrations.md`).
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d943d70b8845"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = ("factory",)
depends_on: str | Sequence[str] | None = "e1f7a3b4c5d6"


def upgrade() -> None:
    op.alter_column("agent_conversations", "room", new_column_name="persona")


def downgrade() -> None:
    op.alter_column("agent_conversations", "persona", new_column_name="room")
