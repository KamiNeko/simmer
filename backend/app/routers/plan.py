from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from ..deps import DB, CurrentUser
from ..models import PlanEntry, ShoppingRecipe, User
from ..schemas import (
    AuthorOut,
    PlanEntryIn,
    PlanEntryOut,
    PlanEntryUpdate,
    PlanRange,
    ShoppingList,
)
from ..stats import stats_for
from .recipes import _LOAD, _get_by_slug, _summary
from .shopping import _list as shopping_list

router = APIRouter(prefix="/api/plan", tags=["plan"])

MAX_DAYS = 62


def _entries(db: DB, user: User, start: date, end: date) -> list[PlanEntryOut]:
    entries = list(
        db.scalars(
            select(PlanEntry)
            .where(PlanEntry.day >= start, PlanEntry.day <= end)
            .order_by(PlanEntry.day, PlanEntry.id)
            .options(
                selectinload(PlanEntry.added_by),
                *(selectinload(PlanEntry.recipe).options(o) for o in _LOAD),
            )
        )
    )
    stats = stats_for(db, [e.recipe_id for e in entries if e.recipe_id], user)
    return [_out(e, user, stats) for e in entries]


def _out(entry: PlanEntry, user: User, stats: dict) -> PlanEntryOut:
    return PlanEntryOut(
        id=entry.id,
        day=entry.day,
        servings=entry.servings,
        note=entry.note,
        recipe=_summary(entry.recipe, user, stats[entry.recipe_id]) if entry.recipe else None,
        added_by=AuthorOut.model_validate(entry.added_by) if entry.added_by else None,
    )


def _one(db: DB, user: User, entry: PlanEntry) -> PlanEntryOut:
    return _out(entry, user, stats_for(db, [entry.recipe_id] if entry.recipe_id else [], user))


def _check_range(start: date, end: date) -> None:
    if end < start or end - start > timedelta(days=MAX_DAYS):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, f"Pick a range of up to {MAX_DAYS} days"
        )


@router.get("", response_model=list[PlanEntryOut])
def get_plan(start: date, end: date, user: CurrentUser, db: DB) -> list[PlanEntryOut]:
    """The household's plan from start to end, both included."""
    _check_range(start, end)
    return _entries(db, user, start, end)


@router.post("", response_model=PlanEntryOut, status_code=status.HTTP_201_CREATED)
def add_entry(data: PlanEntryIn, user: CurrentUser, db: DB) -> PlanEntryOut:
    note = data.note.strip()
    if not data.recipe and not note:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Pick a recipe or write a note")
    recipe = _get_by_slug(db, data.recipe) if data.recipe else None
    entry = PlanEntry(
        day=data.day,
        recipe=recipe,
        servings=data.servings if recipe else None,
        note=note,
        added_by_id=user.id,
    )
    db.add(entry)
    db.commit()
    return _one(db, user, entry)


def _entry(db: DB, entry_id: int) -> PlanEntry:
    entry = db.get(PlanEntry, entry_id)
    if entry is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plan entry not found")
    return entry


@router.patch("/{entry_id}", response_model=PlanEntryOut)
def update_entry(entry_id: int, data: PlanEntryUpdate, user: CurrentUser, db: DB) -> PlanEntryOut:
    entry = _entry(db, entry_id)
    if data.day is not None:
        entry.day = data.day
    if data.servings is not None and entry.recipe_id:
        entry.servings = data.servings
    if data.note is not None:
        note = data.note.strip()
        if not note and not entry.recipe_id:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "A note can't be empty")
        entry.note = note
    db.commit()
    return _one(db, user, entry)


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_entry(entry_id: int, user: CurrentUser, db: DB) -> None:
    db.delete(_entry(db, entry_id))
    db.commit()


@router.post("/to-shopping", response_model=ShoppingList)
def add_to_shopping(data: PlanRange, user: CurrentUser, db: DB) -> ShoppingList:
    """Put the planned recipes of a date range on the user's shopping list.

    A recipe planned more than once counts with all its servings. A recipe already on the
    list keeps the larger of the two amounts, so pressing the button twice changes nothing.
    """
    _check_range(data.start, data.end)
    planned: dict[int, float] = {}
    for entry in db.scalars(
        select(PlanEntry)
        .where(PlanEntry.day >= data.start, PlanEntry.day <= data.end)
        .where(PlanEntry.recipe_id.is_not(None))
        .options(selectinload(PlanEntry.recipe))
    ):
        servings = entry.servings or entry.recipe.servings or 1
        planned[entry.recipe_id] = planned.get(entry.recipe_id, 0) + servings
    listed = {
        e.recipe_id: e
        for e in db.scalars(select(ShoppingRecipe).where(ShoppingRecipe.user_id == user.id))
    }
    for recipe_id, servings in planned.items():
        if recipe_id in listed:
            listed[recipe_id].servings = max(listed[recipe_id].servings, servings)
        else:
            db.add(ShoppingRecipe(user_id=user.id, recipe_id=recipe_id, servings=servings))
    db.commit()
    return shopping_list(db, user)
