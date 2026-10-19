import hashlib
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    """An Argon2 hash of the password."""
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    """True if the password matches the hash."""
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


def new_session_token() -> str:
    """A random token for the session cookie."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """The SHA-256 hash of a session token, which is what the database stores."""
    return hashlib.sha256(token.encode()).hexdigest()
