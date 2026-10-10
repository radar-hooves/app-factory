"""agent_jobs.stream

Revision ID: b7e4a2c9d1f3
Revises: d63b309b1239
Create Date: 2026-10-10 15:00:00.000000+00:00

Whether a job's watchers follow it token by token (`jobs.start(stream=True)`,
`docs/design/agent-jobs.md` §Streaming).

An app taking this by `copier update` must repoint ``down_revision`` at its own
current head, exactly as the previous revision's docstring says.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b7e4a2c9d1f3"
down_revision: str | None = "d63b309b1239"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("agent_jobs", sa.Column("stream", sa.Boolean(), server_default=sa.false(), nullable=False))


def downgrade() -> None:
    op.drop_column("agent_jobs", "stream")
