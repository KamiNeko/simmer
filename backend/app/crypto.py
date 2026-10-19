"""Encrypt secrets (AI provider API keys) at rest with a key from the settings."""

import base64
import hashlib
import secrets

from cryptography.fernet import Fernet, InvalidToken

from .config import get_settings

KEY_FILE = "secret.key"


class DecryptionError(ValueError):
    pass


def _secret() -> str:
    settings = get_settings()
    if settings.secret_key:
        return settings.secret_key
    path = settings.data_dir / KEY_FILE
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(secrets.token_urlsafe(48))
        path.chmod(0o600)
    return path.read_text().strip()


def _fernet() -> Fernet:
    digest = hashlib.sha256(_secret().encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken as exc:
        raise DecryptionError(
            "The stored API key can't be decrypted; the secret key may have changed"
        ) from exc
