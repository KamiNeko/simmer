"""Store recipe photos as resized WebP files in the data directory."""

import io
import secrets
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

from .config import get_settings

FULL_SIZE = 1600
THUMB_SIZE = 480
MAX_UPLOAD_BYTES = 20 * 1024 * 1024


class InvalidImage(ValueError):
    pass


def photos_dir() -> Path:
    path = get_settings().data_dir / "photos"
    path.mkdir(parents=True, exist_ok=True)
    return path


def photo_urls(name: str | None) -> tuple[str | None, str | None]:
    if not name:
        return None, None
    return f"/media/photos/{name}.webp", f"/media/photos/{name}-thumb.webp"


def save_photo(data: bytes, recipe_id: int) -> str:
    """Write the full-size and thumbnail versions and return the base name."""
    if len(data) > MAX_UPLOAD_BYTES:
        raise InvalidImage("The photo is larger than 20 MB")
    try:
        image = Image.open(io.BytesIO(data))
        image = ImageOps.exif_transpose(image)
        image.load()
    except (UnidentifiedImageError, OSError) as exc:
        raise InvalidImage("The file is not an image Simmer can read") from exc
    if image.mode not in ("RGB", "RGBA"):
        image = image.convert("RGB")

    name = f"{recipe_id}-{secrets.token_hex(6)}"
    folder = photos_dir()
    full = image.copy()
    full.thumbnail((FULL_SIZE, FULL_SIZE))
    full.save(folder / f"{name}.webp", "WEBP", quality=82)
    thumb = image.copy()
    thumb.thumbnail((THUMB_SIZE, THUMB_SIZE))
    thumb.save(folder / f"{name}-thumb.webp", "WEBP", quality=78)
    return name


def delete_photo(name: str | None) -> None:
    if not name:
        return
    folder = photos_dir()
    for suffix in (".webp", "-thumb.webp"):
        (folder / f"{name}{suffix}").unlink(missing_ok=True)


AI_IMAGE_SIZE = 2000


def prepare_for_ai(data: bytes) -> bytes:
    """A JPEG of a recipe photo small enough for the AI providers, readable text kept."""
    if len(data) > MAX_UPLOAD_BYTES:
        raise InvalidImage("A photo is larger than 20 MB")
    try:
        image = Image.open(io.BytesIO(data))
        image = ImageOps.exif_transpose(image)
        image.load()
    except (UnidentifiedImageError, OSError) as exc:
        raise InvalidImage("A file is not an image Simmer can read") from exc
    image = image.convert("RGB")
    image.thumbnail((AI_IMAGE_SIZE, AI_IMAGE_SIZE))
    buffer = io.BytesIO()
    image.save(buffer, "JPEG", quality=85)
    return buffer.getvalue()
