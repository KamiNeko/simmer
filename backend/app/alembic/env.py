from alembic import context

from app import models  # noqa: F401  (registers tables on Base.metadata)
from app.db import Base, get_engine

target_metadata = Base.metadata


def run_migrations() -> None:
    engine = context.config.attributes.get("engine") or get_engine()
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,
        )
        with context.begin_transaction():
            context.run_migrations()
        connection.commit()


run_migrations()
