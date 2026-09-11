"""add feedback_reports table

Revision ID: 1c3b08a0ec2e
Revises: c3f8a52d7b16
Create Date: 2026-09-11 10:00:00.000000+00:00

Adds the factory's feedback slice: one table for a report the browser widget
POSTs, CASCADE on the reporting user rather than RESTRICT/SET NULL — a report
is personal data about its reporter with no other row referencing it, so it
goes with them rather than surviving ownerless (`db/registry.py`'s
personal-subject exemption).

An app taking this by `copier update` must repoint ``down_revision`` at its own
current head, exactly as the previous revision's docstring says.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "1c3b08a0ec2e"
down_revision: str | None = "c3f8a52d7b16"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "feedback_reports",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("route", sa.String(length=2048), nullable=False),
        sa.Column("user_agent", sa.String(length=512), nullable=False),
        sa.Column("viewport_width", sa.Integer(), nullable=False),
        sa.Column("viewport_height", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.String(length=255), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("screenshot", sa.LargeBinary(), nullable=True),
        sa.Column(
            "status",
            sa.Enum("received", "filed", name="feedbackstatus", native_enum=False, length=16),
            nullable=False,
        ),
        sa.Column("issue_url", sa.String(length=512), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        # CASCADE, unlike the RESTRICT/SET NULL a WorkspaceScoped table uses: a
        # report is personal-subject data about the reporter alone, and nothing
        # else references it, so a deleted user's reports go with them.
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index(op.f("ix_feedback_reports_user_id"), "feedback_reports", ["user_id"])
    op.create_index(op.f("ix_feedback_reports_session_id"), "feedback_reports", ["session_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_feedback_reports_session_id"), table_name="feedback_reports")
    op.drop_index(op.f("ix_feedback_reports_user_id"), table_name="feedback_reports")
    op.drop_table("feedback_reports")
