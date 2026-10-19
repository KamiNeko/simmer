from alembic import context

from app import models  # noqa: F401  (registers tables on Base.metadata)
from app.db import Base, get_engine

target_metadata = Base.metadata


def include_object(obj, name, type_, reflected, compare_to):
    # The full-text index is managed by hand (see app/search.py), not by models.
    return not (type_ == "table" and name and name.startswith("recipe_search"))


def run_migrations() -> None:
    engine = context.config.attributes.get("engine") or get_engine()
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,
            include_object=include_object,
        )
        with context.begin_transaction():
            context.run_migrations()
        connection.commit()


run_migrations()
