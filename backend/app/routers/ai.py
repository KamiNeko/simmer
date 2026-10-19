from typing import Annotated

from fastapi import APIRouter, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import crypto, importer, photos
from ..deps import DB, AdminUser, CurrentUser
from ..llm import KINDS, LLMError, Provider, build_provider
from ..llm.base import Image, ProviderConfig
from ..llm.recipes import check_connection, import_photos, import_recipe, tidy_recipe
from ..models import LLMProvider
from ..schemas import ImportIn, ImportOut, ProviderOut, ProviderUpdate, RecipeIn, TidyIn

router = APIRouter(prefix="/api", tags=["ai"])

NO_AI = "none"
MAX_PHOTOS = 6


def _configured(db: Session) -> dict[str, LLMProvider]:
    return {row.kind: row for row in db.scalars(select(LLMProvider))}


def _out(kind: str, row: LLMProvider | None) -> ProviderOut:
    info = KINDS[kind]
    return ProviderOut(
        kind=kind,
        label=info["label"],
        model=row.model if row else info["default_model"],
        is_default=bool(row and row.is_default),
        configured=row is not None,
        key_hint=row.key_hint if row else "",
        default_model=info["default_model"],
    )


def _ensure_one_default(db: Session) -> None:
    rows = list(db.scalars(select(LLMProvider).order_by(LLMProvider.id)))
    if rows and not any(row.is_default for row in rows):
        rows[0].is_default = True


def _provider(row: LLMProvider) -> Provider:
    try:
        api_key = crypto.decrypt(row.api_key_encrypted)
    except crypto.DecryptionError as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc)) from exc
    return build_provider(ProviderConfig(kind=row.kind, model=row.model, api_key=api_key))


def resolve_provider(db: Session, requested: str | None) -> Provider | None:
    """The provider to use: the requested one, the default, or None for no AI."""
    if requested == NO_AI:
        return None
    rows = _configured(db)
    if requested:
        if requested not in rows:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{requested} isn't set up")
        return _provider(rows[requested])
    default = next((row for row in rows.values() if row.is_default), None)
    return _provider(default) if default else None


# Settings


@router.get("/ai/providers", response_model=list[ProviderOut])
def list_ready_providers(_: CurrentUser, db: DB) -> list[ProviderOut]:
    """Providers that are set up, for the provider switch on the import screen."""
    rows = _configured(db)
    return [_out(kind, rows[kind]) for kind in KINDS if kind in rows]


@router.get("/admin/ai/providers", response_model=list[ProviderOut])
def list_providers(_: AdminUser, db: DB) -> list[ProviderOut]:
    """Every supported provider and whether it is set up, for the admin page."""
    rows = _configured(db)
    return [_out(kind, rows.get(kind)) for kind in KINDS]


def _kind(kind: str) -> str:
    if kind not in KINDS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown provider")
    return kind


@router.put("/admin/ai/providers/{kind}", response_model=ProviderOut)
def save_provider(kind: str, data: ProviderUpdate, _: AdminUser, db: DB) -> ProviderOut:
    """Set up or change a provider's key, model and default flag."""
    kind = _kind(kind)
    row = _configured(db).get(kind)
    if row is None:
        if not data.api_key:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Enter an API key")
        row = LLMProvider(kind=kind, model=data.model, api_key_encrypted="")
        db.add(row)
    if data.api_key:
        key = data.api_key.strip()
        row.api_key_encrypted = crypto.encrypt(key)
        row.key_hint = key[-4:]
    row.model = data.model.strip()
    if data.is_default:
        for other in _configured(db).values():
            other.is_default = False
        row.is_default = True
    db.flush()
    _ensure_one_default(db)
    db.commit()
    return _out(kind, row)


@router.delete("/admin/ai/providers/{kind}", status_code=status.HTTP_204_NO_CONTENT)
def delete_provider(kind: str, _: AdminUser, db: DB) -> None:
    """Remove a provider and its stored key."""
    row = _configured(db).get(_kind(kind))
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Provider isn't set up")
    db.delete(row)
    db.flush()
    _ensure_one_default(db)
    db.commit()


@router.post("/admin/ai/providers/{kind}/test")
def test_provider(kind: str, _: AdminUser, db: DB) -> dict[str, str]:
    """Check that a provider's key and model work."""
    row = _configured(db).get(_kind(kind))
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Provider isn't set up")
    try:
        check_connection(_provider(row))
    except LLMError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
    return {"status": "ok"}


# Import and tidy up


def _import_url(url: str, provider: Provider | None) -> ImportOut:
    try:
        body, final_url, _ = importer.fetch(url)
    except importer.FetchError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    page = importer.parse_page(body, final_url)
    plain = importer.draft_from_page(page)
    warning = None
    recipe: RecipeIn | None = None
    if provider is not None:
        try:
            recipe = import_recipe(provider, importer.llm_source(page))
        except LLMError as exc:
            if plain is None:
                raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
            warning = f"{exc}. This is the recipe as the page lists it, without AI cleanup."
    if recipe is None:
        if plain is None:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                "This page has no recipe data Simmer can read without AI. "
                "An admin can add an AI provider under AI providers.",
            )
        recipe = plain
        provider = None
    recipe = RecipeIn.model_validate({**recipe.model_dump(), "source_url": url})
    return ImportOut(
        recipe=recipe,
        image_url=page.image_url,
        provider=provider.kind if provider else None,
        model=provider.model if provider else None,
        warning=warning,
    )


@router.post("/import", response_model=ImportOut)
def import_recipe_draft(data: ImportIn, _: CurrentUser, db: DB) -> ImportOut:
    """Turn a link or pasted text into a recipe draft for review. Nothing is saved."""
    provider = resolve_provider(db, data.provider)
    if data.url:
        return _import_url(str(data.url), provider)
    text = (data.text or "").strip()
    if not text:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Paste a link or the recipe text")
    if provider is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Importing pasted text needs an AI provider. An admin can add one under AI providers.",
        )
    try:
        recipe = import_recipe(provider, text)
    except LLMError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
    return ImportOut(recipe=recipe, provider=provider.kind, model=provider.model)


@router.post("/import/photos", response_model=ImportOut)
def import_photo_draft(
    files: list[UploadFile],
    _: CurrentUser,
    db: DB,
    provider: Annotated[str | None, Form()] = None,
) -> ImportOut:
    """Read a recipe from photos, such as cookbook pages, into a draft for review."""
    if not files:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Add at least one photo")
    if len(files) > MAX_PHOTOS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Add at most {MAX_PHOTOS} photos")
    chosen = resolve_provider(db, provider or None)
    if chosen is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Importing photos needs an AI provider. An admin can add one under AI providers.",
        )
    images = []
    for file in files:
        try:
            data = photos.prepare_for_ai(file.file.read(photos.MAX_UPLOAD_BYTES + 1))
        except photos.InvalidImage as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
        images.append(Image(data=data, media_type="image/jpeg"))
    try:
        recipe = import_photos(chosen, images)
    except LLMError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
    return ImportOut(recipe=recipe, provider=chosen.kind, model=chosen.model)


@router.post("/ai/tidy", response_model=RecipeIn)
def tidy(data: TidyIn, _: CurrentUser, db: DB) -> RecipeIn:
    """Split typed ingredient lines into fields and suggest groups."""
    provider = resolve_provider(db, data.provider)
    if provider is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Tidy up needs an AI provider. An admin can add one under AI providers.",
        )
    try:
        return tidy_recipe(provider, data.recipe)
    except LLMError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
