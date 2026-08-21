"""add users, workspaces and workspace scoping

Revision ID: a1c4f7e29b03
Revises: d29753436024
Create Date: 2026-08-20 13:00:00.000000+00:00

Adds the three factory tables every stamped app now carries — ``users``,
``workspaces``, ``workspace_memberships`` — and puts the scoped columns on the
example slice so a fresh stamp shows the right shape from its first migration.

An app taking this by `copier update` must repoint ``down_revision`` at its own
current head, exactly as the previous revision's docstring says.

The ``example_items`` columns are added NOT NULL. That is correct on a fresh
stamp, where the table is empty by construction — nothing seeds it. An app that
kept the scaffold slice as a real domain and has rows in it will get Postgres's
own "column contains null values" error here: add the columns nullable in your
own revision, backfill them to the workspace those rows belong to, then tighten.
The template cannot guess whose data it is, and defaulting would be the wrong
answer to that question rather than a convenient one.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1c4f7e29b03"
down_revision: str | None = "d29753436024"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("authentik_uid", sa.String(length=255), nullable=False),
        sa.Column("username", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=True),
        sa.Column("is_admin", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("authentik_uid"),
    )
    op.create_index(op.f("ix_users_authentik_uid"), "users", ["authentik_uid"])

    op.create_table(
        "workspaces",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("slug", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )
    op.create_index(op.f("ix_workspaces_slug"), "workspaces", ["slug"])

    op.create_table(
        "workspace_memberships",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        # VARCHAR + CHECK rather than a native Postgres ENUM: adding a value to a
        # native enum is an ALTER TYPE that cannot run inside a transactional
        # migration on older servers, for no gain here.
        sa.Column(
            "role",
            sa.Enum("owner", "member", name="workspacerole", native_enum=False, length=16),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        # CASCADE is correct on the GRANT: deleting a workspace or a user retracts
        # the membership. It is deliberately NOT what the domain rows below use.
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("workspace_id", "user_id", name="uq_workspace_memberships_workspace_user"),
    )
    op.create_index(op.f("ix_workspace_memberships_workspace_id"), "workspace_memberships", ["workspace_id"])
    op.create_index(op.f("ix_workspace_memberships_user_id"), "workspace_memberships", ["user_id"])

    # The scaffold slice takes the scoped shape. RESTRICT, not CASCADE: deleting a
    # workspace must never silently take a ledger with it. created_by_id is
    # attribution only and SET NULL, so a departed member's rows stay the
    # workspace's.
    op.add_column("example_items", sa.Column("workspace_id", sa.Integer(), nullable=False))
    op.add_column("example_items", sa.Column("created_by_id", sa.Uuid(), nullable=True))
    op.create_index(op.f("ix_example_items_workspace_id"), "example_items", ["workspace_id"])
    op.create_foreign_key(
        "fk_example_items_workspace_id_workspaces",
        "example_items",
        "workspaces",
        ["workspace_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_example_items_created_by_id_users",
        "example_items",
        "users",
        ["created_by_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_example_items_created_by_id_users", "example_items", type_="foreignkey")
    op.drop_constraint("fk_example_items_workspace_id_workspaces", "example_items", type_="foreignkey")
    op.drop_index(op.f("ix_example_items_workspace_id"), table_name="example_items")
    op.drop_column("example_items", "created_by_id")
    op.drop_column("example_items", "workspace_id")

    op.drop_index(op.f("ix_workspace_memberships_user_id"), table_name="workspace_memberships")
    op.drop_index(op.f("ix_workspace_memberships_workspace_id"), table_name="workspace_memberships")
    op.drop_table("workspace_memberships")

    op.drop_index(op.f("ix_workspaces_slug"), table_name="workspaces")
    op.drop_table("workspaces")

    op.drop_index(op.f("ix_users_authentik_uid"), table_name="users")
    op.drop_table("users")
