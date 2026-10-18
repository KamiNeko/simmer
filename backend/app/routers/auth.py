from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import func, select

from ..config import get_settings
from ..deps import DB, SESSION_COOKIE, CurrentUser, OptionalUser
from ..models import Role, User, UserSession
from ..schemas import AuthState, LoginIn, MeUpdate, PasswordChange, SetupIn, UserOut
from ..security import hash_password, hash_token, new_session_token, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _start_session(db: DB, response: Response, user: User) -> None:
    settings = get_settings()
    token = new_session_token()
    db.add(
        UserSession(
            token_hash=hash_token(token),
            user_id=user.id,
            expires_at=datetime.now(UTC) + timedelta(days=settings.session_days),
        )
    )
    db.commit()
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=settings.session_days * 86400,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )


def _needs_setup(db: DB) -> bool:
    return db.scalar(select(func.count(User.id))) == 0


@router.get("/me", response_model=AuthState)
def me(user: OptionalUser, db: DB) -> AuthState:
    return AuthState(
        user=UserOut.model_validate(user) if user else None,
        needs_setup=_needs_setup(db),
    )


@router.post("/setup", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def setup(data: SetupIn, db: DB, response: Response) -> User:
    """Create the first admin account. Only allowed while there are no users."""
    if not _needs_setup(db):
        raise HTTPException(status.HTTP_409_CONFLICT, "Setup is already complete")
    user = User(
        username=data.username,
        display_name=data.display_name,
        password_hash=hash_password(data.password),
        role=Role.admin,
    )
    db.add(user)
    db.commit()
    _start_session(db, response, user)
    return user


@router.post("/login", response_model=UserOut)
def login(data: LoginIn, db: DB, response: Response) -> User:
    user = db.scalar(select(User).where(func.lower(User.username) == data.username.lower()))
    if user is None or not verify_password(user.password_hash, data.password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong username or password")
    _start_session(db, response, user)
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, db: DB, response: Response) -> None:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        session = db.scalar(select(UserSession).where(UserSession.token_hash == hash_token(token)))
        if session:
            db.delete(session)
            db.commit()
    response.delete_cookie(SESSION_COOKIE)


@router.patch("/me", response_model=UserOut)
def update_me(data: MeUpdate, user: CurrentUser, db: DB) -> User:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    db.commit()
    return user


@router.post("/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(data: PasswordChange, user: CurrentUser, db: DB) -> None:
    if not verify_password(user.password_hash, data.current_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is wrong")
    user.password_hash = hash_password(data.new_password)
    db.commit()
