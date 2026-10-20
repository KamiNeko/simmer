"""recipe translations, the source language and site settings; imports are English only

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-20 19:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "recipe_translations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("recipe_id", sa.Integer(), nullable=False),
        sa.Column("language", sa.String(length=16), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("source_hash", sa.String(length=64), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["recipe_id"], ["recipes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("recipe_id", "language"),
    )
    op.create_index(op.f("ix_recipe_translations_recipe_id"), "recipe_translations", ["recipe_id"])
    op.create_table(
        "app_settings",
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("key"),
    )
    with op.batch_alter_table("recipes") as batch:
        batch.add_column(
            sa.Column("source_language", sa.String(length=16), nullable=False, server_default="")
        )
    with op.batch_alter_table("users") as batch:
        batch.drop_column("import_language")


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(
            sa.Column("import_language", sa.String(length=16), nullable=False, server_default="")
        )
    with op.batch_alter_table("recipes") as batch:
        batch.drop_column("source_language")
    op.drop_table("app_settings")
    op.drop_index(op.f("ix_recipe_translations_recipe_id"), table_name="recipe_translations")
    op.drop_table("recipe_translations")
