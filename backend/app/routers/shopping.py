from fastapi import APIRouter, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload

from ..deps import DB, CurrentUser
from ..models import Recipe, ShoppingCheck, ShoppingExtra, ShoppingRecipe, User
from ..recipe_service import RECIPE_LOAD, get_recipe_by_slug, recipe_details
from ..schemas import (
    ShoppingCheckIn,
    ShoppingExtraIn,
    ShoppingExtraOut,
    ShoppingExtraUpdate,
    ShoppingList,
    ShoppingRecipeIn,
    ShoppingRecipeOut,
)

router = APIRouter(prefix="/api/shopping", tags=["shopping"])


def build_list(db: DB, user: User) -> ShoppingList:
    """The user's whole list; every shopping endpoint returns it."""
    entries = db.scalars(
        select(ShoppingRecipe)
        .where(ShoppingRecipe.user_id == user.id)
        .order_by(ShoppingRecipe.added_at)
        .options(*(selectinload(ShoppingRecipe.recipe).options(o) for o in RECIPE_LOAD))
    )
    extras = db.scalars(
        select(ShoppingExtra).where(ShoppingExtra.user_id == user.id).order_by(ShoppingExtra.id)
    )
    checked = db.scalars(select(ShoppingCheck.key).where(ShoppingCheck.user_id == user.id))
    entries = list(entries)
    details = recipe_details(db, [e.recipe for e in entries], user)
    return ShoppingList(
        recipes=[
            ShoppingRecipeOut(servings=e.servings, recipe=detail)
            for e, detail in zip(entries, details, strict=True)
        ],
        extras=[ShoppingExtraOut.model_validate(x) for x in extras],
        checked=list(checked),
    )


@router.get("", response_model=ShoppingList)
def get_list(user: CurrentUser, db: DB) -> ShoppingList:
    """The user's shopping list."""
    return build_list(db, user)


@router.put("/recipes/{slug}", response_model=ShoppingList)
def put_recipe(slug: str, data: ShoppingRecipeIn, user: CurrentUser, db: DB) -> ShoppingList:
    """Add a recipe to the list, or change its servings."""
    recipe: Recipe = get_recipe_by_slug(db, slug)
    entry = db.scalar(
        select(ShoppingRecipe).where(
            ShoppingRecipe.user_id == user.id, ShoppingRecipe.recipe_id == recipe.id
        )
    )
    if entry is None:
        db.add(ShoppingRecipe(user_id=user.id, recipe_id=recipe.id, servings=data.servings))
    else:
        entry.servings = data.servings
    db.commit()
    return build_list(db, user)


@router.delete("/recipes/{slug}", response_model=ShoppingList)
def remove_recipe(slug: str, user: CurrentUser, db: DB) -> ShoppingList:
    """Take a recipe off the list."""
    recipe = get_recipe_by_slug(db, slug)
    db.execute(
        delete(ShoppingRecipe).where(
            ShoppingRecipe.user_id == user.id, ShoppingRecipe.recipe_id == recipe.id
        )
    )
    db.commit()
    return build_list(db, user)


@router.post("/extras", response_model=ShoppingList, status_code=status.HTTP_201_CREATED)
def add_extra(data: ShoppingExtraIn, user: CurrentUser, db: DB) -> ShoppingList:
    """Add a free-text item to the list."""
    db.add(ShoppingExtra(user_id=user.id, text=data.text.strip()))
    db.commit()
    return build_list(db, user)


def _extra(db: DB, user: User, extra_id: int) -> ShoppingExtra:
    extra = db.get(ShoppingExtra, extra_id)
    if extra is None or extra.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Item not found")
    return extra


@router.patch("/extras/{extra_id}", response_model=ShoppingList)
def update_extra(
    extra_id: int, data: ShoppingExtraUpdate, user: CurrentUser, db: DB
) -> ShoppingList:
    """Change a free-text item or tick it off."""
    extra = _extra(db, user, extra_id)
    if data.text is not None:
        extra.text = data.text.strip()
    if data.checked is not None:
        extra.checked = data.checked
    db.commit()
    return build_list(db, user)


@router.delete("/extras/{extra_id}", response_model=ShoppingList)
def delete_extra(extra_id: int, user: CurrentUser, db: DB) -> ShoppingList:
    """Remove a free-text item."""
    db.delete(_extra(db, user, extra_id))
    db.commit()
    return build_list(db, user)


@router.put("/checked", response_model=ShoppingList)
def set_checked(data: ShoppingCheckIn, user: CurrentUser, db: DB) -> ShoppingList:
    """Tick or untick a combined ingredient line."""
    existing = db.scalar(
        select(ShoppingCheck).where(ShoppingCheck.user_id == user.id, ShoppingCheck.key == data.key)
    )
    if data.checked and existing is None:
        db.add(ShoppingCheck(user_id=user.id, key=data.key))
    elif not data.checked and existing is not None:
        db.delete(existing)
    db.commit()
    return build_list(db, user)


@router.post("/clear", response_model=ShoppingList)
def clear(user: CurrentUser, db: DB, checked_only: bool = False) -> ShoppingList:
    """Empty the whole list, or with checked_only remove just the ticked extra items."""
    extras = delete(ShoppingExtra).where(ShoppingExtra.user_id == user.id)
    if checked_only:
        db.execute(extras.where(ShoppingExtra.checked.is_(True)))
    else:
        db.execute(extras)
        db.execute(delete(ShoppingRecipe).where(ShoppingRecipe.user_id == user.id))
        db.execute(delete(ShoppingCheck).where(ShoppingCheck.user_id == user.id))
    db.commit()
    return build_list(db, user)
