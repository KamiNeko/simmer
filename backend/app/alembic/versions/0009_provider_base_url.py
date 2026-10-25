"""a server address for AI providers that run on the admin's own server

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-25 20:30:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("llm_providers") as batch:
        batch.add_column(
            sa.Column("base_url", sa.String(length=400), nullable=False, server_default="")
        )


def downgrade() -> None:
    with op.batch_alter_table("llm_providers") as batch:
        batch.drop_column("base_url")
