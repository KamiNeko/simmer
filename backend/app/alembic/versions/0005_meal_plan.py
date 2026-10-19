"""meal plan

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-19 09:30:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "plan_entries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("recipe_id", sa.Integer(), nullable=True),
        sa.Column("servings", sa.Float(), nullable=True),
        sa.Column("note", sa.String(length=200), nullable=False),
        sa.Column("added_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["recipe_id"], ["recipes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["added_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_plan_entries_day", "plan_entries", ["day"])


def downgrade() -> None:
    op.drop_index("ix_plan_entries_day", table_name="plan_entries")
    op.drop_table("plan_entries")
