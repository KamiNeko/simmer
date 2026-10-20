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


def _field(item: object, name: str) -> object:
    return item.get(name) if isinstance(item, dict) else getattr(item, name, None)


def _blank(value: object) -> bool:
    return isinstance(value, str) and not value.strip()


class IngredientIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

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
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(default="", max_length=120)
    ingredients: list[IngredientIn] = Field(default=[], max_length=200)

    @field_validator("ingredients", mode="before")
    @classmethod
    def _drop_empty_ingredients(cls, items: object) -> object:
        """Leave out rows with neither a name nor an amount, such as a blank last row."""
        if not isinstance(items, list):
            return items
        return [
            i for i in items if not (_blank(_field(i, "name")) and _field(i, "quantity") is None)
        ]


class GroupOut(ORMModel):
    id: int
    name: str
    ingredients: list[IngredientOut]


class StepIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    section: str = Field(default="", max_length=120)
    text: str = Field(min_length=1, max_length=10_000)


class StepOut(StepIn, ORMModel):
    id: int
    # No length check on the way out, so a blank step saved by an older version still loads.
    text: str


class AuthorOut(ORMModel):
    id: int
    display_name: str


class RecipeIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=20_000)
    source_url: HttpUrl | None = None
    servings: float | None = Field(default=None, gt=0)
    prep_minutes: int | None = Field(default=None, ge=0)
    cook_minutes: int | None = Field(default=None, ge=0)
    total_minutes: int | None = Field(default=None, ge=0)
    tags: list[str] = Field(default=[], max_length=50)
    groups: list[GroupIn] = Field(default=[], max_length=50)
    steps: list[StepIn] = Field(default=[], max_length=200)

    @field_validator("tags")
    @classmethod
    def _clean_tags(cls, tags: list[str]) -> list[str]:
        seen: dict[str, str] = {}
        for tag in tags:
            cleaned = " ".join(tag.split())[:64]
            if cleaned and cleaned.lower() not in seen:
                seen[cleaned.lower()] = cleaned
        return list(seen.values())

    @field_validator("steps", mode="before")
    @classmethod
    def _drop_empty_steps(cls, steps: object) -> object:
        if not isinstance(steps, list):
            return steps
        return [s for s in steps if not _blank(_field(s, "text"))]


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


# AI providers and import

ProviderKind = Literal["anthropic", "openai", "google"]


class ProviderOut(BaseModel):
    kind: ProviderKind
    label: str
    model: str
    is_default: bool
    configured: bool
    key_hint: str = ""
    default_model: str


class ProviderUpdate(BaseModel):
    api_key: str | None = Field(default=None, min_length=8, max_length=400)
    model: str = Field(min_length=1, max_length=128)
    is_default: bool = False


class ImportIn(BaseModel):
    # With html, the address the page came from; without, the page to download.
    url: HttpUrl | None = None
    text: str | None = Field(default=None, max_length=60_000)
    # A page the browser already loaded, for sites that block Simmer's own download.
    html: str | None = Field(default=None, max_length=1_500_000)
    # A provider kind, "none" to skip AI, or empty for the default provider.
    provider: str | None = None


class ImportOut(BaseModel):
    recipe: RecipeIn
    image_url: str | None = None
    provider: str | None = None
    model: str | None = None
    warning: str | None = None


class TidyIn(BaseModel):
    recipe: RecipeIn
    provider: str | None = None


class PhotoFromUrl(BaseModel):
    url: HttpUrl


# Shopping list


class ShoppingRecipeIn(BaseModel):
    servings: float = Field(gt=0, le=1000)


class ShoppingRecipeOut(BaseModel):
    servings: float
    recipe: RecipeOut


class ShoppingExtraIn(BaseModel):
    text: str = Field(min_length=1, max_length=200)


class ShoppingExtraUpdate(BaseModel):
    text: str | None = Field(default=None, min_length=1, max_length=200)
    checked: bool | None = None


class ShoppingExtraOut(ORMModel):
    id: int
    text: str
    checked: bool


class ShoppingCheckIn(BaseModel):
    key: str = Field(min_length=1, max_length=300)
    checked: bool


class ShoppingList(BaseModel):
    recipes: list[ShoppingRecipeOut]
    extras: list[ShoppingExtraOut]
    checked: list[str]


# Export and import


class ImportedRecipe(BaseModel):
    slug: str
    title: str


class ImportFileResult(BaseModel):
    imported: list[ImportedRecipe] = []
    skipped: list[str] = Field(default=[], description="Titles that already exist")
    failed: list[str] = []
