"""Recipe translations: the text to translate, stored translations and showing them.

Recipes are stored in English. A translation holds only text, matched to the recipe's
groups, ingredients and steps by position; amounts, units and everything else come from
the English recipe. Each translation remembers a hash of the English text it was made
from, so an edited recipe shows its translation as outdated until it is made again.
"""

import hashlib
import json

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from .languages import BASE, NAMES
from .llm.recipes import same_shape
from .models import AppSetting, Recipe, RecipeTranslation
from .schemas import RecipeOut, RecipeSummary, TranslationContent

LANGUAGES_KEY = "translation_languages"


def source_content(recipe: Recipe) -> TranslationContent:
    """The English text of a recipe, in the shape a translation mirrors."""
    return TranslationContent(
        title=recipe.title,
        description=recipe.description,
        groups=[
            {
                "name": g.name,
                "ingredients": [{"name": i.name, "note": i.note} for i in g.ingredients],
            }
            for g in recipe.groups
        ],
        steps=[{"section": s.section, "text": s.text} for s in recipe.steps],
    )


def source_hash(recipe: Recipe) -> str:
    """A fingerprint of the recipe's English text; it changes whenever that text does."""
    data = source_content(recipe).model_dump_json()
    return hashlib.sha256(data.encode()).hexdigest()


def content_of(row: RecipeTranslation) -> TranslationContent | None:
    """A stored translation's text, or None if it can't be read."""
    try:
        return TranslationContent.model_validate_json(row.content)
    except ValidationError:
        return None


def translation_languages(db: Session) -> list[str]:
    """The languages the admin wants recipes translated into for sharing."""
    value = db.get(AppSetting, LANGUAGES_KEY)
    codes = json.loads(value.value) if value and value.value else []
    return [c for c in codes if c in NAMES and c != BASE]


def set_translation_languages(db: Session, languages: list[str]) -> list[str]:
    """Save the translation languages, without duplicates or the base language."""
    codes = list(dict.fromkeys(c for c in languages if c in NAMES and c != BASE))
    setting = db.get(AppSetting, LANGUAGES_KEY)
    if setting is None:
        setting = AppSetting(key=LANGUAGES_KEY)
        db.add(setting)
    setting.value = json.dumps(codes)
    return codes


def translations_for(
    db: Session, recipe_ids: list[int], language: str
) -> dict[int, RecipeTranslation]:
    """The stored translations into a language, by recipe id."""
    if not recipe_ids:
        return {}
    rows = db.scalars(
        select(RecipeTranslation).where(
            RecipeTranslation.recipe_id.in_(recipe_ids), RecipeTranslation.language == language
        )
    )
    return {row.recipe_id: row for row in rows}


def save_translation(
    db: Session, recipe: Recipe, language: str, content: TranslationContent, made_from: str
) -> RecipeTranslation:
    """Store a translation made from the English text with the hash made_from."""
    row = db.scalar(
        select(RecipeTranslation).where(
            RecipeTranslation.recipe_id == recipe.id, RecipeTranslation.language == language
        )
    )
    if row is None:
        row = RecipeTranslation(recipe_id=recipe.id, language=language)
        db.add(row)
    row.content = content.model_dump_json()
    row.source_hash = made_from
    return row


def is_current(recipe: Recipe, row: RecipeTranslation | None) -> bool:
    """True if the translation was made from the recipe's current English text."""
    return row is not None and row.source_hash == source_hash(recipe)


def _usable(recipe: Recipe, row: RecipeTranslation | None) -> TranslationContent | None:
    """The translation's text if it still lines up with the recipe's groups and steps."""
    content = content_of(row) if row else None
    if content is None or not same_shape(content, source_content(recipe)):
        return None
    return content


def localize_detail(
    recipe: Recipe, out: RecipeOut, row: RecipeTranslation | None, language: str
) -> RecipeOut:
    """The recipe in the language when a translation lines up, else in English.

    An outdated translation that still lines up is shown, marked as outdated, so readers
    see the language they asked for while the author decides whether to translate again.
    """
    content = _usable(recipe, row)
    outdated = not is_current(recipe, row)
    if content is None:
        return out.model_copy(update={"translation_outdated": True})
    groups = [
        group.model_copy(
            update={
                "name": tg.name,
                "ingredients": [
                    ing.model_copy(update={"name": ti.name or ing.name, "note": ti.note})
                    for ing, ti in zip(group.ingredients, tg.ingredients, strict=True)
                ],
            }
        )
        for group, tg in zip(out.groups, content.groups, strict=True)
    ]
    steps = [
        step.model_copy(update={"section": ts.section, "text": ts.text or step.text})
        for step, ts in zip(out.steps, content.steps, strict=True)
    ]
    return out.model_copy(
        update={
            "title": content.title or out.title,
            "description": content.description,
            "groups": groups,
            "steps": steps,
            "ingredient_preview": _preview(content),
            "language": language,
            "translation_outdated": outdated,
        }
    )


def localize_summary(
    recipe: Recipe, out: RecipeSummary, row: RecipeTranslation | None, language: str
) -> RecipeSummary:
    """A list entry in the language when a translation lines up, else in English."""
    content = _usable(recipe, row)
    if content is None:
        return out.model_copy(update={"translation_outdated": True})
    return out.model_copy(
        update={
            "title": content.title or out.title,
            "description": content.description,
            "ingredient_preview": _preview(content),
            "language": language,
            "translation_outdated": not is_current(recipe, row),
        }
    )


def _preview(content: TranslationContent, limit: int = 8) -> str:
    names = [i.name for g in content.groups for i in g.ingredients]
    text = ", ".join(names[:limit])
    return text + ("…" if len(names) > limit else "")
