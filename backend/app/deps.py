from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import get_db
from .models import User, UserSession
from .security import hash_token

SESSION_COOKIE = "simmer_session"

DB = Annotated[Session, Depends(get_db)]


def _session(db: Session, token: str) -> UserSession | None:
    """The unexpired session for a cookie token; expired ones are removed on sight."""
    session = db.scalar(select(UserSession).where(UserSession.token_hash == hash_token(token)))
    if session is None:
        return None
    expires = session.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    if expires < datetime.now(UTC):
        db.delete(session)
        db.commit()
        return None
    return session


def session_is_valid(db: Session, token: str) -> bool:
    """True if the cookie token belongs to an unexpired session."""
    return _session(db, token) is not None


def current_user_optional(request: Request, db: DB) -> User | None:
    """The signed-in user, or None for visitors."""
    token = request.cookies.get(SESSION_COOKIE)
    session = _session(db, token) if token else None
    return session.user if session else None


def current_user(user: Annotated[User | None, Depends(current_user_optional)]) -> User:
    """The signed-in user, or a 401 error."""
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Login required")
    return user


def admin_user(user: Annotated[User, Depends(current_user)]) -> User:
    """The signed-in admin, or a 403 error for members."""
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin only")
    return user


OptionalUser = Annotated[User | None, Depends(current_user_optional)]
CurrentUser = Annotated[User, Depends(current_user)]
AdminUser = Annotated[User, Depends(admin_user)]
