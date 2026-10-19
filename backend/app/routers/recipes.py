import re
import unicodedata

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from ..deps import DB, CurrentUser, OptionalUser
from ..ingredient_parser import parse_ingredient
from ..models import Ingredient, IngredientGroup, Recipe, Step, Tag, User, recipe_tags
from ..schemas import ParseIn, RecipeIn, RecipeOut, RecipeSummary, TagOut

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


def _summary(recipe: Recipe, user: User | None) -> RecipeSummary:
    return RecipeSummary.model_validate(
        {
            **{k: getattr(recipe, k) for k in RecipeSummary.model_fields if hasattr(recipe, k)},
            "tags": [t.name for t in recipe.tags],
            "ingredient_preview": _preview(recipe),
            "can_edit": can_edit(user, recipe),
        }
    )


def _detail(recipe: Recipe, user: User | None) -> RecipeOut:
    return RecipeOut.model_validate(
        {
            **{k: getattr(recipe, k) for k in RecipeOut.model_fields if hasattr(recipe, k)},
            "tags": [t.name for t in recipe.tags],
            "ingredient_preview": _preview(recipe),
            "can_edit": can_edit(user, recipe),
        }
    )


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


@router.get("/recipes", response_model=list[RecipeSummary])
def list_recipes(
    user: OptionalUser,
    db: DB,
    q: str | None = None,
    tag: str | None = None,
    author: int | None = None,
    sort: str = "updated",
) -> list[RecipeSummary]:
    query = select(Recipe).options(*_LOAD)
    if q:
        like = f"%{q.strip()}%"
        ingredient_match = (
            select(IngredientGroup.recipe_id).join(Ingredient).where(Ingredient.name.ilike(like))
        )
        tag_match = select(recipe_tags.c.recipe_id).join(Tag).where(Tag.name.ilike(like))
        query = query.where(
            or_(
                Recipe.title.ilike(like),
                Recipe.description.ilike(like),
                Recipe.id.in_(ingredient_match),
                Recipe.id.in_(tag_match),
            )
        )
    if tag:
        query = query.where(Recipe.tags.any(func.lower(Tag.name) == tag.lower()))
    if author is not None:
        query = query.where(Recipe.author_id == author)
    order = {
        "title": func.lower(Recipe.title).asc(),
        "created": Recipe.created_at.desc(),
    }.get(sort, Recipe.updated_at.desc())
    return [_summary(r, user) for r in db.scalars(query.order_by(order))]


@router.get("/recipes/{slug}", response_model=RecipeOut)
def get_recipe(slug: str, user: OptionalUser, db: DB) -> RecipeOut:
    return _detail(_get_by_slug(db, slug), user)


@router.post("/recipes", response_model=RecipeOut, status_code=status.HTTP_201_CREATED)
def create_recipe(data: RecipeIn, user: CurrentUser, db: DB) -> RecipeOut:
    recipe = Recipe(slug=_unique_slug(db, data.title), author_id=user.id)
    _apply(db, recipe, data)
    db.add(recipe)
    db.commit()
    return _detail(_get_by_slug(db, recipe.slug), user)


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
    db.commit()
    return _detail(_get_by_slug(db, recipe.slug), user)


@router.delete("/recipes/{slug}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recipe(slug: str, user: CurrentUser, db: DB) -> None:
    recipe = _get_by_slug(db, slug)
    if not can_edit(user, recipe):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only delete your own recipes")
    db.delete(recipe)
    db.flush()
    _delete_orphan_tags(db)
    db.commit()


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
