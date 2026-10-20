"""Full-text search over recipes using an SQLite FTS5 table kept in sync on every save."""

import re

from pydantic import ValidationError
from sqlalchemy import select, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from .models import Recipe, RecipeTranslation
from .schemas import TranslationContent


def _translations(db: Session, recipe: Recipe) -> list[TranslationContent]:
    rows = db.scalars(select(RecipeTranslation).where(RecipeTranslation.recipe_id == recipe.id))
    contents = []
    for row in rows:
        try:
            contents.append(TranslationContent.model_validate_json(row.content))
        except ValidationError:
            continue
    return contents


def index_recipe(db: Session, recipe: Recipe) -> None:
    """Write the recipe's current text, and its translations, into the search index."""
    # Translations go in too, so "Hähnchen" finds a recipe stored as "chicken".
    texts = [TranslationContent(title=recipe.title, description=recipe.description)]
    texts += _translations(db, recipe)
    names = [(i.name, i.note) for g in recipe.groups for i in g.ingredients]
    names += [(i.name, i.note) for t in texts for g in t.groups for i in g.ingredients]
    ingredients = " ".join(f"{name} {note}".strip() for name, note in names)
    db.execute(text("DELETE FROM recipe_search WHERE rowid = :id"), {"id": recipe.id})
    db.execute(
        text(
            "INSERT INTO recipe_search (rowid, title, description, ingredients, tags) "
            "VALUES (:id, :title, :description, :ingredients, :tags)"
        ),
        {
            "id": recipe.id,
            "title": " ".join(t.title for t in texts),
            "description": " ".join(t.description for t in texts if t.description),
            "ingredients": ingredients,
            "tags": " ".join(t.name for t in recipe.tags),
        },
    )


def remove_recipe(db: Session, recipe_id: int) -> None:
    """Remove a recipe from the search index."""
    db.execute(text("DELETE FROM recipe_search WHERE rowid = :id"), {"id": recipe_id})


def to_match_query(query: str) -> str | None:
    """Turn user input into an FTS5 query: every word must match as a prefix."""
    words = re.findall(r"\w+", query, flags=re.UNICODE)
    return " ".join(f'"{w}"*' for w in words) or None


def _substring_ids(db: Session, words: list[str]) -> list[int]:
    """Recipes containing every word anywhere, e.g. "salat" in "Kartoffelsalat"."""
    haystack = "(title || ' ' || description || ' ' || ingredients || ' ' || tags)"
    conditions = " AND ".join(f"{haystack} LIKE :w{i} ESCAPE '\\'" for i in range(len(words)))
    # "_" and "%" are wildcards in LIKE, so escape them to match them literally.
    escaped = (re.sub(r"([\\_%])", r"\\\1", w) for w in words)
    params = {f"w{i}": f"%{w}%" for i, w in enumerate(escaped)}
    rows = db.execute(text(f"SELECT rowid FROM recipe_search WHERE {conditions}"), params)
    return [row[0] for row in rows]


def search_ids(db: Session, query: str) -> list[int] | None:
    """Recipe ids ranked by relevance, best first. None means the query had no words.

    Word-prefix matches from the full-text index come first, ranked with title matches
    weighted highest; recipes that only contain the words inside longer words follow.
    """
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
        ranked = [row[0] for row in rows]
    except OperationalError:
        ranked = []
    words = re.findall(r"\w+", query, flags=re.UNICODE)
    seen = set(ranked)
    ranked += [rid for rid in _substring_ids(db, words) if rid not in seen]
    return ranked
