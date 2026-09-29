"""agent jobs run from any worker, on a model the starter names

Revision ID: 082172624b6d
Revises: 64bff75fdf44
Create Date: 2026-09-29 16:00:00.000000+00:00

Five columns on `agent_jobs` (`docs/design/agent-jobs.md` §Any worker). A
job's CLI is a child of one worker process, and a deployment runs several:
`run_id` is the run that process holds, `heartbeat_at` is how every other
worker tells it is still alive, and `stop_requested`/`pending_messages` are
how any of them asks it to stop or hands it a message — all through the row,
under its own lock, since nothing process-local reaches another worker.
`model` is the `--model` the starter chose, replayed on every resume.

An existing `running` row gets no heartbeat, which reads as stale: nothing
held it across this migration's deploy, and the first sweep settles it
`failed` as it would any other orphan.

An app taking this by `copier update` must repoint ``down_revision`` at its own
current head, exactly as the previous revision's docstring says.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "082172624b6d"
down_revision: str | None = "64bff75fdf44"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("agent_jobs", sa.Column("model", sa.String(length=255), nullable=True))
    op.add_column("agent_jobs", sa.Column("run_id", sa.String(length=36), nullable=True))
    op.add_column("agent_jobs", sa.Column("heartbeat_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("agent_jobs", sa.Column("stop_requested", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.add_column(
        "agent_jobs",
        sa.Column(
            "pending_messages",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("agent_jobs", "pending_messages")
    op.drop_column("agent_jobs", "stop_requested")
    op.drop_column("agent_jobs", "heartbeat_at")
    op.drop_column("agent_jobs", "run_id")
    op.drop_column("agent_jobs", "model")
