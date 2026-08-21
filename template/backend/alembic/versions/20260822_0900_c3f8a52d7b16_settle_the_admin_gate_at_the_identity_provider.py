"""settle the admin gate at the identity provider

Revision ID: c3f8a52d7b16
Revises: a1c4f7e29b03
Create Date: 2026-08-22 09:00:00.000000+00:00

Drops ``users.is_admin``: administration is asserted per request by the
identity provider through the reserved ``admin`` module entitlement
(``entitlements.py``), never stored — a stored flag is a second authorisation
mechanism beside the entitlement gate, needs bootstrap machinery on a fresh
database, and keeps working after the operator revokes it at Authentik.

Adds ``users.display_name``: the account's full name, the third display field
the forward-auth proxy sends (``x-authentik-name``), re-synced on every
request like username and email.

An app taking this by `copier update` must repoint ``down_revision`` at its own
current head, exactly as the previous revision's docstring says.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3f8a52d7b16"
down_revision: str | None = "a1c4f7e29b03"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("display_name", sa.String(length=255), nullable=True))
    op.drop_column("users", "is_admin")


def downgrade() -> None:
    op.add_column("users", sa.Column("is_admin", sa.Boolean(), server_default="false", nullable=False))
    op.drop_column("users", "display_name")
