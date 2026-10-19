"""Recipe export and import as a portable zip, and a full backup of the data directory."""

import contextlib
import io
import json
import sqlite3
import tempfile
import zipfile
import zlib
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import ValidationError
from sqlalchemy import func, select
from starlette.background import BackgroundTask

from .. import photos, search
from ..config import get_settings
from ..crypto import KEY_FILE
from ..deps import DB, AdminUser, CurrentUser
from ..models import Recipe
from ..recipe_service import RECIPE_LOAD, apply_recipe, unique_slug
from ..schemas import ImportedRecipe, ImportFileResult, RecipeIn

router = APIRouter(prefix="/api", tags=["backup"])

FORMAT = "simmer-recipes"
VERSION = 1
MAX_IMPORT_BYTES = 500 * 1024 * 1024
MAX_JSON_BYTES = 50 * 1024 * 1024
MAX_IMPORT_RECIPES = 5000
# Exported photos are already scaled to FULL_SIZE, so anything much bigger didn't come from
# Simmer; capping it keeps a small zip from costing minutes of decoding per recipe.
MAX_IMPORT_PIXELS = 2 * photos.FULL_SIZE * photos.FULL_SIZE
COMMIT_EVERY = 50


def _zip_response(build, prefix: str) -> FileResponse:
    """Write a zip to a temporary file and stream it, deleting the file afterwards."""
    tmp = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)  # noqa: SIM115
    try:
        with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as archive:
            build(archive)
    finally:
        tmp.close()
    stamp = datetime.now(UTC).strftime("%Y-%m-%d")
    return FileResponse(
        tmp.name,
        media_type="application/zip",
        filename=f"{prefix}-{stamp}.zip",
        background=BackgroundTask(Path(tmp.name).unlink, missing_ok=True),
    )


def _recipe_json(recipe: Recipe) -> dict:
    data = RecipeIn(
        title=recipe.title,
        description=recipe.description,
        source_url=recipe.source_url or None,
        servings=recipe.servings,
        prep_minutes=recipe.prep_minutes,
        cook_minutes=recipe.cook_minutes,
        total_minutes=recipe.total_minutes,
        tags=[t.name for t in recipe.tags],
        groups=[
            {
                "name": g.name,
                "ingredients": [
                    {
                        "quantity": i.quantity,
                        "quantity_max": i.quantity_max,
                        "unit": i.unit,
                        "name": i.name,
                        "note": i.note,
                        "original_text": i.original_text,
                        "grams_per_ml": i.grams_per_ml,
                    }
                    for i in g.ingredients
                ],
            }
            for g in recipe.groups
        ],
        steps=[{"section": s.section, "text": s.text} for s in recipe.steps],
    ).model_dump(mode="json")
    data["author"] = recipe.author.display_name if recipe.author else None
    data["created_at"] = recipe.created_at.isoformat()
    data["photo"] = f"photos/{recipe.slug}.webp" if recipe.photo else None
    return data


@router.get("/export")
def export_recipes(user: CurrentUser, db: DB) -> FileResponse:
    """All recipes as recipes.json plus their photos, ready to import into another Simmer."""
    recipes = list(db.scalars(select(Recipe).order_by(Recipe.title).options(*RECIPE_LOAD)))

    def build(archive: zipfile.ZipFile) -> None:
        folder = photos.photos_dir()
        for recipe in recipes:
            source = folder / f"{recipe.photo}.webp" if recipe.photo else None
            if source and source.exists():
                archive.write(source, f"photos/{recipe.slug}.webp")
        document = {
            "format": FORMAT,
            "version": VERSION,
            "exported_at": datetime.now(UTC).isoformat(),
            "recipes": [_recipe_json(r) for r in recipes],
        }
        archive.writestr("recipes.json", json.dumps(document, ensure_ascii=False, indent=2))

    return _zip_response(build, "simmer-recipes")


def _read_export(data: bytes) -> tuple[dict, zipfile.ZipFile | None]:
    if data[:2] == b"PK":
        try:
            archive = zipfile.ZipFile(io.BytesIO(data))
            info = archive.getinfo("recipes.json")
        except (zipfile.BadZipFile, KeyError) as exc:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, "The zip has no recipes.json"
            ) from exc
        if info.file_size > MAX_JSON_BYTES:
            raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "recipes.json is too large")
        try:
            raw, source = archive.read(info), archive
        except (zipfile.BadZipFile, zlib.error) as exc:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, "The zip file is damaged"
            ) from exc
    else:
        raw, source = data, None
    try:
        document = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError, RecursionError) as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "The file is not a Simmer export"
        ) from exc
    if not isinstance(document, dict) or document.get("format") != FORMAT:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "The file is not a Simmer export"
        )
    if document.get("version", 0) > VERSION:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "The export is from a newer Simmer; update this one first",
        )
    return document, source


def _photo_bytes(archive: zipfile.ZipFile | None, name: object) -> bytes | None:
    if archive is None or not isinstance(name, str):
        return None
    try:
        info = archive.getinfo(name)
    except KeyError:
        return None
    if info.file_size > photos.MAX_UPLOAD_BYTES:
        return None
    try:
        return archive.read(info)
    except (zipfile.BadZipFile, zlib.error):
        return None


def _created_at(value: object) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        created = datetime.fromisoformat(value)
    except ValueError:
        return None
    return created if created.tzinfo else created.replace(tzinfo=UTC)


@router.post("/import/file", response_model=ImportFileResult)
def import_file(file: UploadFile, user: CurrentUser, db: DB) -> ImportFileResult:
    """Import recipes from a Simmer export. Recipes whose title is already here are skipped."""
    data = file.file.read(MAX_IMPORT_BYTES + 1)
    if len(data) > MAX_IMPORT_BYTES:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "The file is larger than 500 MB")
    document, archive = _read_export(data)
    entries = document.get("recipes")
    if not isinstance(entries, list):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "The export has no recipes")
    if len(entries) > MAX_IMPORT_RECIPES:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            f"The export has more than {MAX_IMPORT_RECIPES} recipes; split it into smaller files",
        )

    # Only titles already here are skipped: one export can hold two recipes of the same name.
    existing = {t.lower() for t in db.scalars(select(func.lower(Recipe.title)))}
    used_photos: set[str] = set()
    result = ImportFileResult()
    for index, entry in enumerate(entries, 1):
        title = entry.get("title") if isinstance(entry, dict) else None
        label = title if isinstance(title, str) and title else f"Recipe {index}"
        try:
            recipe_in = RecipeIn.model_validate(entry)
        except ValidationError as exc:
            problem = exc.errors()[0]
            where = ".".join(str(p) for p in problem["loc"])
            result.failed.append(f"{label}: {where} {problem['msg'].lower()}")
            continue
        if recipe_in.title.strip().lower() in existing:
            result.skipped.append(recipe_in.title)
            continue
        recipe = Recipe(slug=unique_slug(db, recipe_in.title), author_id=user.id)
        created = _created_at(entry.get("created_at"))
        if created:
            recipe.created_at = created
        apply_recipe(db, recipe, recipe_in)
        db.add(recipe)
        db.flush()
        name = entry.get("photo")
        # Each photo in the zip is used once: exports never share one between recipes.
        photo = None if name in used_photos else _photo_bytes(archive, name)
        if photo:
            used_photos.add(name)
            # A damaged photo shouldn't stop the recipe itself from coming in.
            with contextlib.suppress(photos.InvalidImage):
                recipe.photo = photos.save_photo(photo, recipe.id, MAX_IMPORT_PIXELS)
        search.index_recipe(db, recipe)
        result.imported.append(ImportedRecipe(slug=recipe.slug, title=recipe.title))
        if len(result.imported) % COMMIT_EVERY == 0:
            # Let other saves in between on big imports instead of holding the write lock.
            db.commit()
    db.commit()
    return result


@router.get("/admin/backup")
def full_backup(user: AdminUser) -> FileResponse:
    """A consistent copy of the database, the photos and the key file: the whole data folder."""
    settings = get_settings()

    def build(archive: zipfile.ZipFile) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            # SQLite's backup API copies a consistent snapshot while the app keeps running.
            snapshot = Path(tmp) / "simmer.db"
            source = sqlite3.connect(settings.data_dir / "simmer.db")
            target = sqlite3.connect(snapshot)
            try:
                source.backup(target)
            finally:
                target.close()
                source.close()
            archive.write(snapshot, "simmer.db")
        for path in sorted(photos.photos_dir().iterdir()):
            if path.is_file():
                archive.write(path, f"photos/{path.name}")
        key = settings.data_dir / KEY_FILE
        if key.exists():
            archive.write(key, KEY_FILE)

    return _zip_response(build, "simmer-backup")
