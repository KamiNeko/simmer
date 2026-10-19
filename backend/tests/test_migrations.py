from alembic import command
from sqlalchemy import text

from app.db import make_engine
from app.migrations import alembic_config


def test_search_index_is_filled_for_existing_recipes(tmp_path):
    engine = make_engine(f"sqlite:///{tmp_path / 'old.db'}")
    config = alembic_config(engine)
    command.upgrade(config, "0001")
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO recipes (id, slug, title, description, created_at, updated_at) "
                "VALUES (1, 'soup', 'Pumpkin soup', '', '2026-01-01', '2026-01-01')"
            )
        )
        conn.execute(
            text(
                "INSERT INTO ingredient_groups (id, recipe_id, name, position) VALUES (1, 1, '', 0)"
            )
        )
        conn.execute(
            text(
                "INSERT INTO ingredients (group_id, position, name, note, original_text) "
                "VALUES (1, 0, 'hokkaido pumpkin', '', '')"
            )
        )
    command.upgrade(config, "head")
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT rowid FROM recipe_search WHERE recipe_search MATCH 'hokkaido'")
        ).all()
    assert rows == [(1,)]
    command.downgrade(config, "0001")
