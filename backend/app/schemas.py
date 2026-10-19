from datetime import UTC, datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, HttpUrl, field_validator

# SQLite drops the timezone, so stored values come back naive; they are always UTC.
UTCDateTime = Annotated[
    datetime, AfterValidator(lambda d: d if d.tzinfo else d.replace(tzinfo=UTC))
]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# Users and auth


class UserOut(ORMModel):
    id: int
    username: str
    display_name: str
    role: Literal["admin", "member"]
    unit_system: Literal["metric", "us", "original"]
    created_at: UTCDateTime


class LoginIn(BaseModel):
    username: str
    password: str


class SetupIn(BaseModel):
    username: str = Field(min_length=2, max_length=64, pattern=r"^[A-Za-z0-9_.-]+$")
    display_name: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=8, max_length=256)


class UserCreate(SetupIn):
    role: Literal["admin", "member"] = "member"


class UserUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=128)
    role: Literal["admin", "member"] | None = None
    password: str | None = Field(default=None, min_length=8, max_length=256)


class MeUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=128)
    unit_system: Literal["metric", "us", "original"] | None = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=256)


class AuthState(BaseModel):
    user: UserOut | None
    needs_setup: bool


# Recipes


class IngredientIn(BaseModel):
    quantity: float | None = Field(default=None, ge=0)
    quantity_max: float | None = Field(default=None, ge=0)
    unit: str | None = Field(default=None, max_length=32)
    name: str = Field(min_length=1, max_length=200)
    note: str = Field(default="", max_length=300)
    original_text: str = Field(default="", max_length=500)
    grams_per_ml: float | None = Field(default=None, gt=0)


class IngredientOut(IngredientIn, ORMModel):
    id: int


class GroupIn(BaseModel):
    name: str = Field(default="", max_length=120)
    ingredients: list[IngredientIn] = []


class GroupOut(ORMModel):
    id: int
    name: str
    ingredients: list[IngredientOut]


class StepIn(BaseModel):
    section: str = Field(default="", max_length=120)
    text: str = Field(min_length=1)


class StepOut(StepIn, ORMModel):
    id: int


class AuthorOut(ORMModel):
    id: int
    display_name: str


class RecipeIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    source_url: HttpUrl | None = None
    servings: float | None = Field(default=None, gt=0)
    prep_minutes: int | None = Field(default=None, ge=0)
    cook_minutes: int | None = Field(default=None, ge=0)
    total_minutes: int | None = Field(default=None, ge=0)
    tags: list[str] = []
    groups: list[GroupIn] = []
    steps: list[StepIn] = []

    @field_validator("tags")
    @classmethod
    def _clean_tags(cls, tags: list[str]) -> list[str]:
        seen: dict[str, str] = {}
        for tag in tags:
            cleaned = " ".join(tag.split())[:64]
            if cleaned and cleaned.lower() not in seen:
                seen[cleaned.lower()] = cleaned
        return list(seen.values())


class RecipeSummary(ORMModel):
    id: int
    slug: str
    title: str
    description: str
    servings: float | None
    total_minutes: int | None
    tags: list[str]
    author: AuthorOut | None
    ingredient_preview: str
    photo_url: str | None = None
    thumb_url: str | None = None
    created_at: UTCDateTime
    updated_at: UTCDateTime
    can_edit: bool = False
    # Public totals across all users.
    avg_rating: float | None = None
    rating_count: int = 0
    cooked_count: int = 0
    # The logged-in user's own values; empty for visitors.
    my_rating: int | None = None
    my_cooked_count: int = 0
    my_last_cooked_at: UTCDateTime | None = None


class RecipeOut(RecipeSummary):
    source_url: str | None
    prep_minutes: int | None
    cook_minutes: int | None
    groups: list[GroupOut]
    steps: list[StepOut]


class TagOut(BaseModel):
    name: str
    count: int


class ParseIn(BaseModel):
    lines: list[str] = Field(max_length=200)


# Ratings, cooking log and private notes


class RatingIn(BaseModel):
    stars: int = Field(ge=1, le=5)


class CookIn(BaseModel):
    note: str = Field(default="", max_length=5000)


class CommentIn(BaseModel):
    text: str = Field(min_length=1, max_length=5000)


class CommentUpdate(BaseModel):
    text: str | None = Field(default=None, min_length=1, max_length=5000)
    done: bool | None = None


class CommentOut(ORMModel):
    id: int
    text: str
    done: bool
    created_at: UTCDateTime
    cook_log_id: int | None
    cooked_at: UTCDateTime | None = None


class CookOut(ORMModel):
    id: int
    cooked_at: UTCDateTime


class Journal(BaseModel):
    """Everything private the logged-in user has recorded for one recipe."""

    rating: int | None
    cooks: list[CookOut]
    comments: list[CommentOut]
