from datetime import UTC, date, datetime
from enum import StrEnum

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    """The current time in UTC."""
    return datetime.now(UTC)


class Role(StrEnum):
    admin = "admin"
    member = "member"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(128))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(16), default=Role.member)
    unit_system: Mapped[str] = mapped_column(String(16), default="metric")
    # A language code imports are translated into, or empty to keep the recipe's language.
    import_language: Mapped[str] = mapped_column(String(16), default="", server_default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    @property
    def is_admin(self) -> bool:
        """True for admins."""
        return self.role == Role.admin


class UserSession(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped[User] = relationship()


recipe_tags = Table(
    "recipe_tags",
    Base.metadata,
    Column("recipe_id", ForeignKey("recipes.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True, index=True),
)


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(64), unique=True, index=True)


class Recipe(Base):
    __tablename__ = "recipes"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    source_url: Mapped[str | None] = mapped_column(String(1000))
    servings: Mapped[float | None] = mapped_column(Float)
    prep_minutes: Mapped[int | None] = mapped_column(Integer)
    cook_minutes: Mapped[int | None] = mapped_column(Integer)
    total_minutes: Mapped[int | None] = mapped_column(Integer)
    author_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    photo: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    author: Mapped[User | None] = relationship()
    groups: Mapped[list["IngredientGroup"]] = relationship(
        back_populates="recipe",
        order_by="IngredientGroup.position",
        cascade="all, delete-orphan",
    )
    steps: Mapped[list["Step"]] = relationship(
        back_populates="recipe", order_by="Step.position", cascade="all, delete-orphan"
    )
    tags: Mapped[list[Tag]] = relationship(secondary=recipe_tags, order_by=Tag.name)


class IngredientGroup(Base):
    __tablename__ = "ingredient_groups"

    id: Mapped[int] = mapped_column(primary_key=True)
    recipe_id: Mapped[int] = mapped_column(ForeignKey("recipes.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120), default="")
    position: Mapped[int] = mapped_column(Integer, default=0)

    recipe: Mapped[Recipe] = relationship(back_populates="groups")
    ingredients: Mapped[list["Ingredient"]] = relationship(
        back_populates="group", order_by="Ingredient.position", cascade="all, delete-orphan"
    )


class Ingredient(Base):
    __tablename__ = "ingredients"

    id: Mapped[int] = mapped_column(primary_key=True)
    group_id: Mapped[int] = mapped_column(
        ForeignKey("ingredient_groups.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0)
    quantity: Mapped[float | None] = mapped_column(Float)
    quantity_max: Mapped[float | None] = mapped_column(Float)
    unit: Mapped[str | None] = mapped_column(String(32))
    name: Mapped[str] = mapped_column(String(200))
    note: Mapped[str] = mapped_column(String(300), default="")
    original_text: Mapped[str] = mapped_column(String(500), default="")
    grams_per_ml: Mapped[float | None] = mapped_column(Float)

    group: Mapped[IngredientGroup] = relationship(back_populates="ingredients")


class Step(Base):
    __tablename__ = "steps"

    id: Mapped[int] = mapped_column(primary_key=True)
    recipe_id: Mapped[int] = mapped_column(ForeignKey("recipes.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    section: Mapped[str] = mapped_column(String(120), default="")
    text: Mapped[str] = mapped_column(Text)

    recipe: Mapped[Recipe] = relationship(back_populates="steps")


class Rating(Base):
    __tablename__ = "ratings"
    __table_args__ = (UniqueConstraint("user_id", "recipe_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    recipe_id: Mapped[int] = mapped_column(ForeignKey("recipes.id", ondelete="CASCADE"), index=True)
    stars: Mapped[int] = mapped_column(Integer)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class CookLog(Base):
    __tablename__ = "cook_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    recipe_id: Mapped[int] = mapped_column(ForeignKey("recipes.id", ondelete="CASCADE"), index=True)
    cooked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Comment(Base):
    """A private note by one user on a recipe, optionally written right after cooking it."""

    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    recipe_id: Mapped[int] = mapped_column(ForeignKey("recipes.id", ondelete="CASCADE"), index=True)
    cook_log_id: Mapped[int | None] = mapped_column(ForeignKey("cook_log.id", ondelete="SET NULL"))
    text: Mapped[str] = mapped_column(Text)
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    cook_log: Mapped[CookLog | None] = relationship()


class LLMProvider(Base):
    """An AI provider the admin configured for import and tidy up."""

    __tablename__ = "llm_providers"

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(16), unique=True)
    model: Mapped[str] = mapped_column(String(128))
    api_key_encrypted: Mapped[str] = mapped_column(Text)
    key_hint: Mapped[str] = mapped_column(String(8), default="")
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class ShoppingRecipe(Base):
    """A recipe on a user's shopping list, at the servings they plan to cook."""

    __tablename__ = "shopping_recipes"
    __table_args__ = (UniqueConstraint("user_id", "recipe_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    recipe_id: Mapped[int] = mapped_column(ForeignKey("recipes.id", ondelete="CASCADE"), index=True)
    servings: Mapped[float] = mapped_column(Float)
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    recipe: Mapped[Recipe] = relationship()


class ShoppingExtra(Base):
    """An item typed onto the shopping list by hand."""

    __tablename__ = "shopping_extras"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    text: Mapped[str] = mapped_column(String(200))
    checked: Mapped[bool] = mapped_column(Boolean, default=False)
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ShoppingCheck(Base):
    """A ticked-off combined ingredient line, keyed by the name and unit the browser groups by."""

    __tablename__ = "shopping_checks"
    __table_args__ = (UniqueConstraint("user_id", "key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    key: Mapped[str] = mapped_column(String(300))


class PlanEntry(Base):
    """A day's entry of the retired meal plan.

    The feature is gone, but the table stays so the data of existing installs survives.
    """

    __tablename__ = "plan_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    day: Mapped[date] = mapped_column(Date, index=True)
    recipe_id: Mapped[int | None] = mapped_column(
        ForeignKey("recipes.id", ondelete="CASCADE"), index=True
    )
    servings: Mapped[float | None] = mapped_column(Float)
    note: Mapped[str] = mapped_column(String(200), default="")
    added_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    recipe: Mapped[Recipe | None] = relationship()
    added_by: Mapped[User | None] = relationship()
