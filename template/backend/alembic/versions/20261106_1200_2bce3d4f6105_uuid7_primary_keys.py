"""every key is a UUID v7

Revision ID: 2bce3d4f6105
Revises: e1f7a3b4c5d6
Create Date: 2026-11-06 12:00:00.000000+00:00

Every integer or v4 surrogate key, and every foreign key that reaches one, becomes a UUID v7 the
app mints, in the rows' old order (app-factory `docs/product/P09-decisions.md`); `app_slices.rekey`
proves each table's rows, checksum, order and references before it commits, or raises and nothing
changes. A conversation keeps its id, now typed uuid: its address and a shared answer's link carry it.

On the app's own chain, not the factory branch: a key's type divides every revision that references
the key into before and after. An app with revisions of its own points ``down_revision`` at its own
head, names what the catalogue cannot know in the call (`keep`, `include`, `soft_refs`, `mapped`), and
upgrades in an offline window after a dump (app-factory `docs/development/uuid7-rekey.md`).
"""

import logging
from collections.abc import Sequence

import sqlalchemy as sa
from app_slices.rekey import rekey_to_uuid7

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "2bce3d4f6105"
down_revision: str | None = "e1f7a3b4c5d6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


#: A child of `alembic`, so the proof prints beside Alembic's own lines (`alembic.ini`).
log = logging.getLogger("alembic.rekey")


def upgrade() -> None:
    bind = op.get_bind()
    report = rekey_to_uuid7(bind)
    for table, (rows, checksum) in report.proof.items():
        log.info("%s: %d rows, checksum %s, the same before and after", table, rows, checksum)
    if sa.inspect(bind).has_table("agent_conversations"):
        op.alter_column("agent_conversations", "id", type_=sa.Uuid(), postgresql_using="id::uuid")


def downgrade() -> None:
    raise NotImplementedError("The old keys are gone: restore the dump taken before the upgrade")
