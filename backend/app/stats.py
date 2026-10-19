"""Rating and cooking totals per recipe, computed in bulk for list views."""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import CookLog, Rating, User


@dataclass
class RecipeStats:
    avg_rating: float | None = None
    rating_count: int = 0
    cooked_count: int = 0
    my_rating: int | None = None
    my_cooked_count: int = 0
    my_last_cooked_at: datetime | None = None


def stats_for(db: Session, recipe_ids: list[int], user: User | None) -> dict[int, RecipeStats]:
    stats = {rid: RecipeStats() for rid in recipe_ids}
    if not recipe_ids:
        return stats

    ratings = db.execute(
        select(Rating.recipe_id, func.avg(Rating.stars), func.count(Rating.id))
        .where(Rating.recipe_id.in_(recipe_ids))
        .group_by(Rating.recipe_id)
    )
    for rid, avg, count in ratings:
        stats[rid].avg_rating = round(float(avg), 2)
        stats[rid].rating_count = count

    cooks = db.execute(
        select(CookLog.recipe_id, func.count(CookLog.id))
        .where(CookLog.recipe_id.in_(recipe_ids))
        .group_by(CookLog.recipe_id)
    )
    for rid, count in cooks:
        stats[rid].cooked_count = count

    if user is not None:
        mine = db.execute(
            select(Rating.recipe_id, Rating.stars).where(
                Rating.user_id == user.id, Rating.recipe_id.in_(recipe_ids)
            )
        )
        for rid, stars in mine:
            stats[rid].my_rating = stars
        my_cooks = db.execute(
            select(CookLog.recipe_id, func.count(CookLog.id), func.max(CookLog.cooked_at))
            .where(CookLog.user_id == user.id, CookLog.recipe_id.in_(recipe_ids))
            .group_by(CookLog.recipe_id)
        )
        for rid, count, last in my_cooks:
            stats[rid].my_cooked_count = count
            stats[rid].my_last_cooked_at = last
    return stats
