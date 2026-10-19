"""shopping list

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-19 09:10:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "shopping_recipes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("recipe_id", sa.Integer(), nullable=False),
        sa.Column("servings", sa.Float(), nullable=False),
        sa.Column("added_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["recipe_id"], ["recipes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "recipe_id"),
    )
    with op.batch_alter_table("shopping_recipes", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_shopping_recipes_user_id"), ["user_id"], unique=False)

    op.create_table(
        "shopping_extras",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("text", sa.String(length=200), nullable=False),
        sa.Column("checked", sa.Boolean(), nullable=False),
        sa.Column("added_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("shopping_extras", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_shopping_extras_user_id"), ["user_id"], unique=False)

    op.create_table(
        "shopping_checks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("key", sa.String(length=300), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "key"),
    )
    with op.batch_alter_table("shopping_checks", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_shopping_checks_user_id"), ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_table("shopping_checks")
    op.drop_table("shopping_extras")
    op.drop_table("shopping_recipes")
