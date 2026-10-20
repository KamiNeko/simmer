"""language imported recipes are translated into

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-20 18:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(
            sa.Column("import_language", sa.String(length=16), nullable=False, server_default="")
        )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_column("import_language")
