"""Per-user ratings, the "I cooked this" log and private notes on recipes."""

from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from ..deps import DB, CurrentUser
from ..models import Comment, CookLog, Rating, Recipe, User
from ..schemas import (
    CommentIn,
    CommentOut,
    CommentUpdate,
    CookIn,
    CookOut,
    Journal,
    RatingIn,
)

router = APIRouter(prefix="/api", tags=["journal"])


def _recipe(db: DB, slug: str) -> Recipe:
    recipe = db.scalar(select(Recipe).where(Recipe.slug == slug))
    if recipe is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Recipe not found")
    return recipe


def _comment_out(comment: Comment) -> CommentOut:
    out = CommentOut.model_validate(comment)
    if comment.cook_log is not None:
        out.cooked_at = comment.cook_log.cooked_at
    return out


def _journal(db: DB, recipe: Recipe, user: User) -> Journal:
    rating = db.scalar(
        select(Rating.stars).where(Rating.user_id == user.id, Rating.recipe_id == recipe.id)
    )
    cooks = db.scalars(
        select(CookLog)
        .where(CookLog.user_id == user.id, CookLog.recipe_id == recipe.id)
        .order_by(CookLog.cooked_at.desc(), CookLog.id.desc())
    )
    comments = db.scalars(
        select(Comment)
        .where(Comment.user_id == user.id, Comment.recipe_id == recipe.id)
        .order_by(Comment.created_at.desc(), Comment.id.desc())
    )
    return Journal(
        rating=rating,
        cooks=[CookOut.model_validate(c) for c in cooks],
        comments=[_comment_out(c) for c in comments],
    )


@router.get("/recipes/{slug}/journal", response_model=Journal)
def get_journal(slug: str, user: CurrentUser, db: DB) -> Journal:
    return _journal(db, _recipe(db, slug), user)


@router.put("/recipes/{slug}/rating", response_model=Journal)
def rate(slug: str, data: RatingIn, user: CurrentUser, db: DB) -> Journal:
    recipe = _recipe(db, slug)
    rating = db.scalar(
        select(Rating).where(Rating.user_id == user.id, Rating.recipe_id == recipe.id)
    )
    if rating is None:
        db.add(Rating(user_id=user.id, recipe_id=recipe.id, stars=data.stars))
    else:
        rating.stars = data.stars
    db.commit()
    return _journal(db, recipe, user)


@router.delete("/recipes/{slug}/rating", response_model=Journal)
def unrate(slug: str, user: CurrentUser, db: DB) -> Journal:
    recipe = _recipe(db, slug)
    rating = db.scalar(
        select(Rating).where(Rating.user_id == user.id, Rating.recipe_id == recipe.id)
    )
    if rating is not None:
        db.delete(rating)
        db.commit()
    return _journal(db, recipe, user)


@router.post("/recipes/{slug}/cooked", response_model=Journal, status_code=201)
def cooked(slug: str, data: CookIn, user: CurrentUser, db: DB) -> Journal:
    """Record that the user cooked the recipe now, with an optional note about how it went."""
    recipe = _recipe(db, slug)
    cook = CookLog(user_id=user.id, recipe_id=recipe.id, cooked_at=datetime.now(UTC))
    db.add(cook)
    db.flush()
    if data.note.strip():
        db.add(
            Comment(
                user_id=user.id, recipe_id=recipe.id, cook_log_id=cook.id, text=data.note.strip()
            )
        )
    db.commit()
    return _journal(db, recipe, user)


@router.delete("/cooked/{cook_id}", status_code=status.HTTP_204_NO_CONTENT)
def undo_cooked(cook_id: int, user: CurrentUser, db: DB) -> None:
    cook = db.get(CookLog, cook_id)
    if cook is None or cook.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found")
    db.delete(cook)
    db.commit()


@router.post("/recipes/{slug}/comments", response_model=CommentOut, status_code=201)
def add_comment(slug: str, data: CommentIn, user: CurrentUser, db: DB) -> CommentOut:
    recipe = _recipe(db, slug)
    comment = Comment(user_id=user.id, recipe_id=recipe.id, text=data.text.strip())
    db.add(comment)
    db.commit()
    return _comment_out(comment)


def _own_comment(db: DB, comment_id: int, user: User) -> Comment:
    comment = db.get(Comment, comment_id)
    if comment is None or comment.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Note not found")
    return comment


@router.patch("/comments/{comment_id}", response_model=CommentOut)
def update_comment(comment_id: int, data: CommentUpdate, user: CurrentUser, db: DB) -> CommentOut:
    comment = _own_comment(db, comment_id, user)
    if data.text is not None:
        comment.text = data.text.strip()
    if data.done is not None:
        comment.done = data.done
    db.commit()
    return _comment_out(comment)


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(comment_id: int, user: CurrentUser, db: DB) -> None:
    db.delete(_own_comment(db, comment_id, user))
    db.commit()
