"""Translating recipes for sharing: the languages, on-demand and background translation."""

import logging
import threading

from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import search
from ..db import get_db
from ..deps import DB, AdminUser, CurrentUser
from ..languages import BASE, NAMES, LanguageCode
from ..llm import LLMError, LLMUnavailable, Provider
from ..llm.recipes import translate_recipe
from ..models import Recipe, RecipeTranslation
from ..recipe_service import RECIPE_LOAD, get_recipe_by_slug, recipe_detail
from ..schemas import LanguagesOut, RecipeOut, TranslationLanguagesIn, TranslationStatus
from ..translations import (
    is_current,
    localize_detail,
    save_translation,
    set_translation_languages,
    set_translation_provider_kind,
    source_content,
    source_hash,
    translation_languages,
    translation_provider_kind,
    translations_for,
)
from .ai import configured_kinds, resolve_provider

router = APIRouter(prefix="/api", tags=["translations"])
log = logging.getLogger(__name__)

# Translations being made right now, so a save and the bulk job don't do the same one twice.
_busy: set[tuple[int, str]] = set()
_lock = threading.Lock()
_progress = TranslationStatus(languages=[], missing=0, running=False)


def _load(db: Session, recipe_id: int) -> Recipe | None:
    return db.scalar(select(Recipe).where(Recipe.id == recipe_id).options(*RECIPE_LOAD))


def translate_one(db: Session, provider: Provider, recipe_id: int, language: str) -> bool:
    """Translate a recipe and store it. False if it was deleted or changed meanwhile."""
    with _lock:
        if (recipe_id, language) in _busy:
            return False
        _busy.add((recipe_id, language))
    try:
        recipe = _load(db, recipe_id)
        if recipe is None:
            return False
        source, made_from = source_content(recipe), source_hash(recipe)
        # End the read before the slow AI call so other saves aren't held up meanwhile.
        db.rollback()
        content = translate_recipe(provider, source, language)
        recipe = _load(db, recipe_id)
        if recipe is None or source_hash(recipe) != made_from:
            return False
        save_translation(db, recipe, language, content, made_from)
        db.flush()
        search.index_recipe(db, recipe)
        db.commit()
        return True
    finally:
        with _lock:
            _busy.discard((recipe_id, language))


def _needed(
    db: Session, recipe_ids: list[int] | None, languages: list[str]
) -> list[tuple[int, str]]:
    """Recipe and language pairs without an up-to-date translation."""
    query = select(Recipe).options(*RECIPE_LOAD).order_by(Recipe.id)
    if recipe_ids is not None:
        query = query.where(Recipe.id.in_(recipe_ids))
    recipes = list(db.scalars(query))
    pairs = []
    for language in languages:
        rows = translations_for(db, [r.id for r in recipes], language)
        pairs += [(r.id, language) for r in recipes if not is_current(r, rows.get(r.id))]
    return pairs


def translation_provider(db: Session) -> Provider | None:
    """The provider chosen for translations, or the default one if that isn't set up."""
    kind = translation_provider_kind(db)
    return resolve_provider(db, kind if kind in configured_kinds(db) else None)


def _background_provider(db: Session) -> Provider | None:
    try:
        return translation_provider(db)
    except HTTPException as exc:
        log.warning("Can't translate recipes: %s", exc.detail)
        return None


def translate_later(recipe_ids: list[int], languages: list[str]) -> None:
    """Bring the recipes' translations up to date, after the response has gone out."""
    if not languages:
        return
    db = next(get_db())
    try:
        provider = _background_provider(db)
        if provider is None:
            return
        for recipe_id, language in _needed(db, recipe_ids, languages):
            try:
                translate_one(db, provider, recipe_id, language)
            except LLMError as exc:
                db.rollback()
                log.warning("Translating recipe %s into %s failed: %s", recipe_id, language, exc)
                if isinstance(exc, LLMUnavailable):
                    # Try again later; "Translate now" picks up what's missing.
                    break
    finally:
        db.close()


def _fill_all(languages: list[str]) -> None:
    db = next(get_db())
    try:
        provider = _background_provider(db)
        pairs = _needed(db, None, languages) if provider else []
        _progress.total, _progress.done, _progress.failed = len(pairs), 0, 0
        for recipe_id, language in pairs:
            try:
                assert provider is not None
                translate_one(db, provider, recipe_id, language)
            except LLMUnavailable as exc:
                # Every other call would wait for the same timeout; stop and say why.
                db.rollback()
                _progress.failed += len(pairs) - _progress.done
                _progress.error = str(exc)
                break
            except LLMError as exc:
                db.rollback()
                _progress.failed += 1
                _progress.error = str(exc)
            _progress.done += 1
    finally:
        _progress.running = False
        db.close()


def _status(db: Session) -> TranslationStatus:
    languages = translation_languages(db)
    return _progress.model_copy(
        update={
            "languages": languages,
            "provider": translation_provider_kind(db),
            "missing": len(_needed(db, None, languages)),
        }
    )


@router.get("/languages", response_model=LanguagesOut)
def languages(db: DB) -> LanguagesOut:
    """The language recipes are kept in and the ones they are translated into; public."""
    return LanguagesOut(base=BASE, translations=translation_languages(db))


@router.get("/admin/translations", response_model=TranslationStatus)
def translation_status(_: AdminUser, db: DB) -> TranslationStatus:
    """The translation languages, how many translations are missing and the bulk job's progress."""
    return _status(db)


@router.put("/admin/translations", response_model=TranslationStatus)
def save_languages(data: TranslationLanguagesIn, _: AdminUser, db: DB) -> TranslationStatus:
    """Choose the languages recipes are translated into for sharing, and the provider."""
    set_translation_languages(db, data.languages)
    set_translation_provider_kind(db, data.provider)
    db.commit()
    return _status(db)


@router.post("/admin/translations/fill", response_model=TranslationStatus)
def fill_translations(_: AdminUser, db: DB, background: BackgroundTasks) -> TranslationStatus:
    """Translate every recipe that lacks an up-to-date translation, in the background."""
    languages = translation_languages(db)
    if not languages:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Choose a language to translate into")
    if translation_provider(db) is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Translating needs an AI provider. Add one under AI providers.",
        )
    with _lock:
        if _progress.running:
            raise HTTPException(status.HTTP_409_CONFLICT, "Translations are already running")
        _progress.running, _progress.error = True, None
    background.add_task(_fill_all, languages)
    return _status(db)


@router.post("/recipes/{slug}/translations/{language}", response_model=RecipeOut)
def translate_now(slug: str, language: LanguageCode, user: CurrentUser, db: DB) -> RecipeOut:
    """Translate a recipe into a language now and return it in that language."""
    if language == BASE:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Recipes are kept in {NAMES[BASE]}")
    provider = translation_provider(db)
    if provider is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Translating needs an AI provider. An admin can add one under AI providers.",
        )
    recipe = get_recipe_by_slug(db, slug)
    try:
        translate_one(db, provider, recipe.id, language)
    except LLMError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
    recipe = get_recipe_by_slug(db, slug)
    row = db.scalar(
        select(RecipeTranslation).where(
            RecipeTranslation.recipe_id == recipe.id, RecipeTranslation.language == language
        )
    )
    return localize_detail(recipe, recipe_detail(db, recipe, user), row, language)
