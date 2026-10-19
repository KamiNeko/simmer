"""Store recipe photos as resized WebP files in the data directory."""

import io
import secrets
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

from .config import get_settings

FULL_SIZE = 1600
THUMB_SIZE = 480
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
# A tiny file can claim a huge canvas; 40 megapixels covers any phone or camera photo.
MAX_PIXELS = 40_000_000


class InvalidImage(ValueError):
    pass


def photos_dir() -> Path:
    """The photo folder in the data directory, created if missing."""
    path = get_settings().data_dir / "photos"
    path.mkdir(parents=True, exist_ok=True)
    return path


def photo_urls(name: str | None) -> tuple[str | None, str | None]:
    """The full-size and thumbnail URLs for a stored photo name."""
    if not name:
        return None, None
    return f"/media/photos/{name}.webp", f"/media/photos/{name}-thumb.webp"


def _open(data: bytes, size: int, unreadable: str, max_pixels: int = MAX_PIXELS) -> Image.Image:
    """Decode an upload safely: refuse oversized canvases before decoding any pixels."""
    try:
        image = Image.open(io.BytesIO(data))
        if image.width * image.height > max_pixels:
            raise InvalidImage("The image has too many pixels")
        # JPEGs can decode at a fraction of their size, which saves memory for big photos.
        image.draft("RGB", (size, size))
        image = ImageOps.exif_transpose(image)
        image.load()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise InvalidImage(unreadable) from exc
    return image


def save_photo(data: bytes, recipe_id: int, max_pixels: int = MAX_PIXELS) -> str:
    """Write the full-size and thumbnail versions and return the base name."""
    if len(data) > MAX_UPLOAD_BYTES:
        raise InvalidImage("The photo is larger than 20 MB")
    image = _open(data, FULL_SIZE, "The file is not an image Simmer can read", max_pixels)
    if image.mode not in ("RGB", "RGBA"):
        image = image.convert("RGB")

    name = f"{recipe_id}-{secrets.token_hex(6)}"
    folder = photos_dir()
    image.thumbnail((FULL_SIZE, FULL_SIZE))
    image.save(folder / f"{name}.webp", "WEBP", quality=82)
    thumb = image.copy()
    thumb.thumbnail((THUMB_SIZE, THUMB_SIZE))
    thumb.save(folder / f"{name}-thumb.webp", "WEBP", quality=78)
    return name


def delete_photo(name: str | None) -> None:
    """Remove a photo and its thumbnail, if there is one."""
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
    image = _open(data, AI_IMAGE_SIZE, "A file is not an image Simmer can read").convert("RGB")
    image.thumbnail((AI_IMAGE_SIZE, AI_IMAGE_SIZE))
    buffer = io.BytesIO()
    image.save(buffer, "JPEG", quality=85)
    return buffer.getvalue()
