"""Full-text search over recipes using an SQLite FTS5 table kept in sync on every save."""

import re

from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from .models import Recipe


def index_recipe(db: Session, recipe: Recipe) -> None:
    ingredients = " ".join(
        f"{i.name} {i.note}".strip() for g in recipe.groups for i in g.ingredients
    )
    db.execute(text("DELETE FROM recipe_search WHERE rowid = :id"), {"id": recipe.id})
    db.execute(
        text(
            "INSERT INTO recipe_search (rowid, title, description, ingredients, tags) "
            "VALUES (:id, :title, :description, :ingredients, :tags)"
        ),
        {
            "id": recipe.id,
            "title": recipe.title,
            "description": recipe.description,
            "ingredients": ingredients,
            "tags": " ".join(t.name for t in recipe.tags),
        },
    )


def remove_recipe(db: Session, recipe_id: int) -> None:
    db.execute(text("DELETE FROM recipe_search WHERE rowid = :id"), {"id": recipe_id})


def to_match_query(query: str) -> str | None:
    """Turn user input into an FTS5 query: every word must match as a prefix."""
    words = re.findall(r"\w+", query, flags=re.UNICODE)
    return " ".join(f'"{w}"*' for w in words) or None


def search_ids(db: Session, query: str) -> list[int] | None:
    """Recipe ids ranked by relevance, best first. None means the query had no words."""
    match = to_match_query(query)
    if match is None:
        return None
    try:
        rows = db.execute(
            text(
                "SELECT rowid FROM recipe_search WHERE recipe_search MATCH :q "
                "ORDER BY bm25(recipe_search, 10.0, 2.0, 4.0, 6.0)"
            ),
            {"q": match},
        )
    except OperationalError:
        return []
    return [row[0] for row in rows]
