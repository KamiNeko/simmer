import re
import unicodedata
from dataclasses import asdict
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from .. import importer, photos, search
from ..deps import DB, CurrentUser, OptionalUser
from ..ingredient_parser import parse_ingredient
from ..models import Ingredient, IngredientGroup, Recipe, Step, Tag, User, recipe_tags
from ..schemas import ParseIn, PhotoFromUrl, RecipeIn, RecipeOut, RecipeSummary, TagOut
from ..stats import RecipeStats, stats_for

router = APIRouter(prefix="/api", tags=["recipes"])

_LOAD = (
    selectinload(Recipe.groups).selectinload(IngredientGroup.ingredients),
    selectinload(Recipe.steps),
    selectinload(Recipe.tags),
    selectinload(Recipe.author),
)


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return text[:120] or "recipe"


def _unique_slug(db: DB, title: str, exclude_id: int | None = None) -> str:
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


def _summary(recipe: Recipe, user: User | None, stats: RecipeStats) -> RecipeSummary:
    base = {k: getattr(recipe, k) for k in RecipeSummary.model_fields if hasattr(recipe, k)}
    return RecipeSummary.model_validate({**base, **_fields(recipe, user, stats)})


def _detail(db: DB, recipe: Recipe, user: User | None) -> RecipeOut:
    stats = stats_for(db, [recipe.id], user)[recipe.id]
    base = {k: getattr(recipe, k) for k in RecipeOut.model_fields if hasattr(recipe, k)}
    return RecipeOut.model_validate({**base, **_fields(recipe, user, stats)})


def _get_by_slug(db: DB, slug: str) -> Recipe:
    recipe = db.scalar(select(Recipe).where(Recipe.slug == slug).options(*_LOAD))
    if recipe is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Recipe not found")
    return recipe


def _resolve_tags(db: DB, names: list[str]) -> list[Tag]:
    tags = []
    for name in names:
        tag = db.scalar(select(Tag).where(func.lower(Tag.name) == name.lower()))
        if tag is None:
            tag = Tag(name=name)
            db.add(tag)
        tags.append(tag)
    return tags


def _apply(db: DB, recipe: Recipe, data: RecipeIn) -> None:
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
            ingredients=[
                Ingredient(position=ii, **i.model_dump()) for ii, i in enumerate(g.ingredients)
            ],
        )
        for gi, g in enumerate(data.groups)
        if g.ingredients or g.name.strip()
    ]
    recipe.steps = [
        Step(position=si, section=s.section.strip(), text=s.text.strip())
        for si, s in enumerate(data.steps)
    ]


def _delete_orphan_tags(db: DB) -> None:
    used = select(recipe_tags.c.tag_id)
    for tag in db.scalars(select(Tag).where(Tag.id.not_in(used))):
        db.delete(tag)


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
    tag: str | None = None,
    author: int | None = None,
    sort: str | None = None,
) -> list[RecipeSummary]:
    """List recipes. Without an explicit sort, searches rank by relevance, else by update."""
    query = select(Recipe).options(*_LOAD)
    ranked: list[int] | None = None
    if q and q.strip():
        ranked = search.search_ids(db, q)
        if ranked is not None:
            query = query.where(Recipe.id.in_(ranked))
    if tag:
        query = query.where(Recipe.tags.any(func.lower(Tag.name) == tag.lower()))
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
    return [_summary(r, user, stats[r.id]) for r in recipes]


@router.get("/recipes/{slug}", response_model=RecipeOut)
def get_recipe(slug: str, user: OptionalUser, db: DB) -> RecipeOut:
    return _detail(db, _get_by_slug(db, slug), user)


@router.post("/recipes", response_model=RecipeOut, status_code=status.HTTP_201_CREATED)
def create_recipe(data: RecipeIn, user: CurrentUser, db: DB) -> RecipeOut:
    recipe = Recipe(slug=_unique_slug(db, data.title), author_id=user.id)
    _apply(db, recipe, data)
    db.add(recipe)
    db.flush()
    search.index_recipe(db, recipe)
    db.commit()
    return _detail(db, _get_by_slug(db, recipe.slug), user)


@router.put("/recipes/{slug}", response_model=RecipeOut)
def update_recipe(slug: str, data: RecipeIn, user: CurrentUser, db: DB) -> RecipeOut:
    recipe = _get_by_slug(db, slug)
    if not can_edit(user, recipe):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only edit your own recipes")
    if data.title.strip() != recipe.title:
        recipe.slug = _unique_slug(db, data.title, exclude_id=recipe.id)
    _apply(db, recipe, data)
    db.flush()
    _delete_orphan_tags(db)
    search.index_recipe(db, recipe)
    db.commit()
    return _detail(db, _get_by_slug(db, recipe.slug), user)


@router.delete("/recipes/{slug}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recipe(slug: str, user: CurrentUser, db: DB) -> None:
    recipe = _get_by_slug(db, slug)
    if not can_edit(user, recipe):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only delete your own recipes")
    photo = recipe.photo
    search.remove_recipe(db, recipe.id)
    db.delete(recipe)
    db.flush()
    _delete_orphan_tags(db)
    db.commit()
    photos.delete_photo(photo)


def _editable(db: DB, slug: str, user: User) -> Recipe:
    recipe = _get_by_slug(db, slug)
    if not can_edit(user, recipe):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only edit your own recipes")
    return recipe


@router.put("/recipes/{slug}/photo", response_model=RecipeOut)
async def upload_photo(slug: str, file: UploadFile, user: CurrentUser, db: DB) -> RecipeOut:
    recipe = _editable(db, slug, user)
    data = await file.read(photos.MAX_UPLOAD_BYTES + 1)
    try:
        name = photos.save_photo(data, recipe.id)
    except photos.InvalidImage as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    old, recipe.photo = recipe.photo, name
    db.commit()
    photos.delete_photo(old)
    return _detail(db, recipe, user)


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
    return _detail(db, recipe, user)


@router.delete("/recipes/{slug}/photo", response_model=RecipeOut)
def delete_recipe_photo(slug: str, user: CurrentUser, db: DB) -> RecipeOut:
    recipe = _editable(db, slug, user)
    old, recipe.photo = recipe.photo, None
    db.commit()
    photos.delete_photo(old)
    return _detail(db, recipe, user)


@router.get("/tags", response_model=list[TagOut])
def list_tags(db: DB) -> list[TagOut]:
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
