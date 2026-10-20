from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, UploadFile, status
from sqlalchemy import func, select

from .. import importer, photos, search
from ..deps import DB, CurrentUser, OptionalUser
from ..ingredient_parser import parse_ingredient
from ..models import Recipe, ShoppingRecipe, Tag, User, recipe_tags
from ..recipe_service import (
    RECIPE_LOAD,
    apply_recipe,
    can_edit,
    delete_orphan_tags,
    get_recipe_by_slug,
    recipe_detail,
    recipe_summary,
    unique_slug,
)
from ..schemas import ParseIn, PhotoFromUrl, RecipeIn, RecipeOut, RecipeSummary, TagOut
from ..stats import RecipeStats, stats_for
from .shopping import forget_stale_checks

router = APIRouter(prefix="/api", tags=["recipes"])

_EPOCH = datetime.min.replace(tzinfo=UTC)


def _sort_key(sort: str, recipe: Recipe, stats: RecipeStats):
    """Sort keys for the orderings that depend on ratings and the cooking log."""
    if sort == "rating":
        return (-(stats.avg_rating or 0), -stats.rating_count, recipe.title.lower())
    if sort == "cooked":
        return (-stats.cooked_count, recipe.title.lower())
    if sort == "last_cooked":
        last = stats.my_last_cooked_at
        if last is not None and last.tzinfo is None:
            last = last.replace(tzinfo=UTC)
        return (-(last or _EPOCH).timestamp(), recipe.title.lower())
    return None


@router.get("/recipes", response_model=list[RecipeSummary])
def list_recipes(
    user: OptionalUser,
    db: DB,
    q: str | None = None,
    tag: Annotated[list[str] | None, Query()] = None,
    author: int | None = None,
    sort: str | None = None,
) -> list[RecipeSummary]:
    """List recipes having every given tag. Without a sort, searches rank by relevance."""
    query = select(Recipe).options(*RECIPE_LOAD)
    ranked: list[int] | None = None
    if q and q.strip():
        ranked = search.search_ids(db, q)
        if ranked is not None:
            query = query.where(Recipe.id.in_(ranked))
    for name in tag or []:
        query = query.where(Recipe.tags.any(func.lower(Tag.name) == name.lower()))
    if author is not None:
        query = query.where(Recipe.author_id == author)
    order = {
        "title": func.lower(Recipe.title).asc(),
        "created": Recipe.created_at.desc(),
    }.get(sort, Recipe.updated_at.desc())
    recipes = list(db.scalars(query.order_by(order)))
    stats = stats_for(db, [r.id for r in recipes], user)

    if sort in ("rating", "cooked", "last_cooked"):
        recipes.sort(key=lambda r: _sort_key(sort, r, stats[r.id]))
    elif ranked is not None and sort in (None, "relevance"):
        position = {rid: i for i, rid in enumerate(ranked)}
        recipes.sort(key=lambda r: position[r.id])
    return [recipe_summary(r, user, stats[r.id]) for r in recipes]


@router.get("/recipes/{slug}", response_model=RecipeOut)
def get_recipe(slug: str, user: OptionalUser, db: DB) -> RecipeOut:
    """One recipe with its stats; visitors can read it too."""
    return recipe_detail(db, get_recipe_by_slug(db, slug), user)


@router.post("/recipes", response_model=RecipeOut, status_code=status.HTTP_201_CREATED)
def create_recipe(data: RecipeIn, user: CurrentUser, db: DB) -> RecipeOut:
    """Save a new recipe by the signed-in user."""
    recipe = Recipe(slug=unique_slug(db, data.title), author_id=user.id)
    apply_recipe(db, recipe, data)
    db.add(recipe)
    db.flush()
    search.index_recipe(db, recipe)
    db.commit()
    return recipe_detail(db, get_recipe_by_slug(db, recipe.slug), user)


@router.put("/recipes/{slug}", response_model=RecipeOut)
def update_recipe(slug: str, data: RecipeIn, user: CurrentUser, db: DB) -> RecipeOut:
    """Save changes to a recipe the user may edit."""
    recipe = get_recipe_by_slug(db, slug)
    if not can_edit(user, recipe):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only edit your own recipes")
    if data.title.strip() != recipe.title:
        recipe.slug = unique_slug(db, data.title, exclude_id=recipe.id)
    apply_recipe(db, recipe, data)
    db.flush()
    delete_orphan_tags(db)
    search.index_recipe(db, recipe)
    db.commit()
    return recipe_detail(db, get_recipe_by_slug(db, recipe.slug), user)


@router.delete("/recipes/{slug}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recipe(slug: str, user: CurrentUser, db: DB) -> None:
    """Delete a recipe the user may edit, with its photo."""
    recipe = get_recipe_by_slug(db, slug)
    if not can_edit(user, recipe):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only delete your own recipes")
    photo = recipe.photo
    shoppers = list(
        db.scalars(select(User).join(ShoppingRecipe).where(ShoppingRecipe.recipe_id == recipe.id))
    )
    search.remove_recipe(db, recipe.id)
    db.delete(recipe)
    db.flush()
    delete_orphan_tags(db)
    for shopper in shoppers:
        forget_stale_checks(db, shopper)
    db.commit()
    photos.delete_photo(photo)


def _editable(db: DB, slug: str, user: User) -> Recipe:
    recipe = get_recipe_by_slug(db, slug)
    if not can_edit(user, recipe):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only edit your own recipes")
    return recipe


@router.put("/recipes/{slug}/photo", response_model=RecipeOut)
def upload_photo(slug: str, file: UploadFile, user: CurrentUser, db: DB) -> RecipeOut:
    """Replace a recipe's photo with an uploaded image."""
    recipe = _editable(db, slug, user)
    data = file.file.read(photos.MAX_UPLOAD_BYTES + 1)
    try:
        name = photos.save_photo(data, recipe.id)
    except photos.InvalidImage as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    old, recipe.photo = recipe.photo, name
    db.commit()
    photos.delete_photo(old)
    return recipe_detail(db, recipe, user)


@router.put("/recipes/{slug}/photo/from-url", response_model=RecipeOut)
def photo_from_url(slug: str, data: PhotoFromUrl, user: CurrentUser, db: DB) -> RecipeOut:
    """Download a photo from the web, used for the image of an imported recipe."""
    recipe = _editable(db, slug, user)
    try:
        body, _, _ = importer.fetch(str(data.url), max_bytes=photos.MAX_UPLOAD_BYTES)
        name = photos.save_photo(body, recipe.id)
    except (importer.FetchError, photos.InvalidImage) as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    old, recipe.photo = recipe.photo, name
    db.commit()
    photos.delete_photo(old)
    return recipe_detail(db, recipe, user)


@router.delete("/recipes/{slug}/photo", response_model=RecipeOut)
def delete_recipe_photo(slug: str, user: CurrentUser, db: DB) -> RecipeOut:
    """Remove a recipe's photo."""
    recipe = _editable(db, slug, user)
    old, recipe.photo = recipe.photo, None
    db.commit()
    photos.delete_photo(old)
    return recipe_detail(db, recipe, user)


@router.get("/tags", response_model=list[TagOut])
def list_tags(db: DB) -> list[TagOut]:
    """Every tag in use, with how many recipes have it."""
    rows = db.execute(
        select(Tag.name, func.count(recipe_tags.c.recipe_id))
        .join(recipe_tags)
        .group_by(Tag.id)
        .order_by(func.lower(Tag.name))
    )
    return [TagOut(name=name, count=count) for name, count in rows]


@router.post("/parse-ingredients")
def parse_ingredients(data: ParseIn, _: CurrentUser) -> list[dict]:
    """Split pasted ingredient lines into structured fields for the editor."""
    return [vars(parse_ingredient(line)) for line in data.lines if line.strip()]
