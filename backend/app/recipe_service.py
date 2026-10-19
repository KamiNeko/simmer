"""Loading, serialising and saving recipes, shared by the routers that deal with them."""

import re
import unicodedata
from dataclasses import asdict

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from . import photos
from .models import Ingredient, IngredientGroup, Recipe, Step, Tag, User, recipe_tags
from .schemas import IngredientIn, RecipeIn, RecipeOut, RecipeSummary
from .stats import RecipeStats, stats_for
from .units import normalize_unit

RECIPE_LOAD = (
    selectinload(Recipe.groups).selectinload(IngredientGroup.ingredients),
    selectinload(Recipe.steps),
    selectinload(Recipe.tags),
    selectinload(Recipe.author),
)


def slugify(text: str) -> str:
    """A URL-friendly version of a title."""
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return text[:120] or "recipe"


def unique_slug(db: Session, title: str, exclude_id: int | None = None) -> str:
    """A slug for the title that no other recipe uses."""
    base = slugify(title)
    slug, n = base, 2
    while True:
        query = select(Recipe.id).where(Recipe.slug == slug)
        if exclude_id is not None:
            query = query.where(Recipe.id != exclude_id)
        if db.scalar(query) is None:
            return slug
        slug, n = f"{base}-{n}", n + 1


def can_edit(user: User | None, recipe: Recipe) -> bool:
    """True if the user is an admin or wrote the recipe."""
    return user is not None and (user.is_admin or recipe.author_id == user.id)


def _preview(recipe: Recipe, limit: int = 8) -> str:
    names = [i.name for g in recipe.groups for i in g.ingredients]
    text = ", ".join(names[:limit])
    return text + ("…" if len(names) > limit else "")


def _fields(recipe: Recipe, user: User | None, stats: RecipeStats) -> dict:
    photo_url, thumb_url = photos.photo_urls(recipe.photo)
    return {
        "tags": [t.name for t in recipe.tags],
        "ingredient_preview": _preview(recipe),
        "can_edit": can_edit(user, recipe),
        "photo_url": photo_url,
        "thumb_url": thumb_url,
        **asdict(stats),
    }


def recipe_summary(recipe: Recipe, user: User | None, stats: RecipeStats) -> RecipeSummary:
    """A recipe as a list entry, with its stats."""
    base = {k: getattr(recipe, k) for k in RecipeSummary.model_fields if hasattr(recipe, k)}
    return RecipeSummary.model_validate({**base, **_fields(recipe, user, stats)})


def _detail(recipe: Recipe, user: User | None, stats: RecipeStats) -> RecipeOut:
    base = {k: getattr(recipe, k) for k in RecipeOut.model_fields if hasattr(recipe, k)}
    return RecipeOut.model_validate({**base, **_fields(recipe, user, stats)})


def recipe_detail(db: Session, recipe: Recipe, user: User | None) -> RecipeOut:
    """A recipe with everything the detail page shows."""
    return _detail(recipe, user, stats_for(db, [recipe.id], user)[recipe.id])


def recipe_details(db: Session, recipes: list[Recipe], user: User | None) -> list[RecipeOut]:
    """Several recipes with their stats, fetched in one go rather than per recipe."""
    stats = stats_for(db, [r.id for r in recipes], user)
    return [_detail(r, user, stats[r.id]) for r in recipes]


def get_recipe_by_slug(db: Session, slug: str) -> Recipe:
    """The recipe with this slug, or a 404 error."""
    recipe = db.scalar(select(Recipe).where(Recipe.slug == slug).options(*RECIPE_LOAD))
    if recipe is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Recipe not found")
    return recipe


def _resolve_tags(db: Session, names: list[str]) -> list[Tag]:
    tags = []
    for name in names:
        tag = db.scalar(select(Tag).where(func.lower(Tag.name) == name.lower()))
        if tag is None:
            tag = Tag(name=name)
            db.add(tag)
        tags.append(tag)
    return tags


def _ingredient(position: int, data: IngredientIn) -> Ingredient:
    fields = data.model_dump()
    # Store "cups" or "Tbsp" as the unit code so conversion and the shopping list know it.
    if data.unit:
        fields["unit"] = normalize_unit(data.unit) or data.unit
    return Ingredient(position=position, **fields)


def apply_recipe(db: Session, recipe: Recipe, data: RecipeIn) -> None:
    """Copy the form onto the recipe, replacing its groups, steps and tags wholesale."""
    recipe.title = data.title.strip()
    recipe.description = data.description.strip()
    recipe.source_url = str(data.source_url) if data.source_url else None
    recipe.servings = data.servings
    recipe.prep_minutes = data.prep_minutes
    recipe.cook_minutes = data.cook_minutes
    recipe.total_minutes = data.total_minutes
    recipe.tags = _resolve_tags(db, data.tags)
    recipe.groups = [
        IngredientGroup(
            name=g.name.strip(),
            position=gi,
            ingredients=[_ingredient(ii, i) for ii, i in enumerate(g.ingredients)],
        )
        for gi, g in enumerate(data.groups)
        if g.ingredients or g.name.strip()
    ]
    recipe.steps = [
        Step(position=si, section=s.section.strip(), text=s.text.strip())
        for si, s in enumerate(data.steps)
    ]


def delete_orphan_tags(db: Session) -> None:
    """Remove tags no recipe uses any more."""
    used = select(recipe_tags.c.tag_id)
    for tag in db.scalars(select(Tag).where(Tag.id.not_in(used))):
        db.delete(tag)
