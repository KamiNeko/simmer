import html
import re
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from . import photos
from .config import get_settings
from .db import get_db, get_engine
from .migrations import upgrade_database
from .models import IngredientGroup, Recipe, Role, User
from .routers import ai, auth, journal, recipes, users
from .security import hash_password


def bootstrap_admin(db: Session) -> None:
    """Create the admin from environment variables on first start."""
    settings = get_settings()
    if not (settings.admin_username and settings.admin_password):
        return
    if db.scalar(select(func.count(User.id))):
        return
    db.add(
        User(
            username=settings.admin_username,
            display_name=settings.admin_username,
            password_hash=hash_password(settings.admin_password),
            role=Role.admin,
        )
    )
    db.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    upgrade_database(get_engine())
    db = next(get_db())
    try:
        bootstrap_admin(db)
    finally:
        db.close()
    yield


app = FastAPI(
    title="Simmer", lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json"
)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(recipes.router)
app.include_router(journal.router)
app.include_router(ai.router)


@app.get("/media/photos/{name}", include_in_schema=False)
def photo(name: str) -> FileResponse:
    if not re.fullmatch(r"\d+-[0-9a-f]+(-thumb)?\.webp", name):
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    path = photos.photos_dir() / name
    if not path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    # File names change with every upload, so they can be cached for good.
    return FileResponse(path, headers={"Cache-Control": "public, max-age=31536000, immutable"})


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def _recipe_meta(slug: str) -> str:
    """Open Graph tags so shared recipe links preview with title and description."""
    db = next(get_db())
    try:
        recipe = db.scalar(
            select(Recipe)
            .where(Recipe.slug == slug)
            .options(selectinload(Recipe.groups).selectinload(IngredientGroup.ingredients))
        )
        if recipe is None:
            return ""
        settings = get_settings()
        description = recipe.description or ", ".join(
            i.name for g in recipe.groups for i in g.ingredients
        )
        tags = {
            "og:title": recipe.title,
            "og:description": description[:300],
            "og:type": "article",
            "og:url": f"{settings.base_url.rstrip('/')}/recipes/{recipe.slug}",
        }
        photo_url, _ = photos.photo_urls(recipe.photo)
        if photo_url:
            tags["og:image"] = settings.base_url.rstrip("/") + photo_url
        meta = "".join(
            f'<meta property="{k}" content="{html.escape(v, quote=True)}">' for k, v in tags.items()
        )
        title = f"<title>{html.escape(recipe.title)} · Simmer</title>"
        return (
            title
            + meta
            + f'<meta name="description" content="{html.escape(description[:300], quote=True)}">'
        )
    finally:
        db.close()


def mount_frontend(static_dir: Path) -> None:
    index_file = static_dir / "index.html"
    assets = static_dir / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str, request: Request):
        if path.startswith("api/"):
            return JSONResponse({"detail": "Not Found"}, status_code=404)
        candidate = (static_dir / path).resolve()
        if path and candidate.is_file() and static_dir.resolve() in candidate.parents:
            return FileResponse(candidate)
        page = index_file.read_text()
        if path.startswith("recipes/"):
            slug = path.removeprefix("recipes/").split("/")[0]
            meta = _recipe_meta(slug)
            if meta:
                page = page.replace("<title>Simmer</title>", meta, 1)
        return HTMLResponse(page)


_settings = get_settings()
if _settings.static_dir and (_settings.static_dir / "index.html").is_file():
    mount_frontend(_settings.static_dir)
