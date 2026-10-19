"""indexes on foreign keys

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-19 11:00:00.000000
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Loading a recipe's groups, ingredients and steps, and cascading deletes, look these up.
INDEXES = [
    ("sessions", "user_id"),
    ("recipe_tags", "tag_id"),
    ("recipes", "author_id"),
    ("ingredient_groups", "recipe_id"),
    ("ingredients", "group_id"),
    ("steps", "recipe_id"),
    ("shopping_recipes", "recipe_id"),
    ("plan_entries", "recipe_id"),
]


def upgrade() -> None:
    for table, column in INDEXES:
        op.create_index(f"ix_{table}_{column}", table, [column])


def downgrade() -> None:
    for table, column in INDEXES:
        op.drop_index(f"ix_{table}_{column}", table_name=table)
