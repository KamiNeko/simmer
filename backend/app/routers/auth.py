import time
from collections import defaultdict, deque
from datetime import UTC, datetime, timedelta
from functools import cache

from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import delete, func, select

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
        secure=settings.secure_cookies,
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


class LoginThrottle:
    """Slows down password guessing: a few failures per account and per address, then a pause.

    Kept in memory, which is enough for Simmer's single process; a restart clears it.
    """

    WINDOW = 15 * 60
    PER_USERNAME = 10
    PER_ADDRESS = 30

    def __init__(self) -> None:
        self.failures: defaultdict[str, deque[float]] = defaultdict(deque)

    def _recent(self, key: str, now: float) -> deque[float]:
        times = self.failures[key]
        while times and times[0] <= now - self.WINDOW:
            times.popleft()
        if not times:
            del self.failures[key]
        return times

    def retry_after(self, username: str, address: str) -> int:
        """Seconds until another attempt is allowed, or 0."""
        now = time.monotonic()
        waits = []
        for key, limit in (
            (f"u:{username}", self.PER_USERNAME),
            (f"a:{address}", self.PER_ADDRESS),
        ):
            times = self._recent(key, now)
            if len(times) >= limit:
                waits.append(int(times[0] + self.WINDOW - now) + 1)
        return max(waits, default=0)

    def failed(self, username: str, address: str) -> None:
        now = time.monotonic()
        self.failures[f"u:{username}"].append(now)
        self.failures[f"a:{address}"].append(now)

    def succeeded(self, username: str) -> None:
        self.failures.pop(f"u:{username}", None)


throttle = LoginThrottle()


@cache
def _dummy_hash() -> str:
    return hash_password("simmer-timing-equalizer")


@router.post("/login", response_model=UserOut)
def login(data: LoginIn, request: Request, db: DB, response: Response) -> User:
    username = data.username.lower()
    address = request.client.host if request.client else "unknown"
    wait = throttle.retry_after(username, address)
    if wait:
        minutes = max(1, round(wait / 60))
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Too many failed attempts. Try again in {minutes} minute{'s' if minutes > 1 else ''}.",
            headers={"Retry-After": str(wait)},
        )
    user = db.scalar(select(User).where(func.lower(User.username) == username))
    # Check a password even for unknown names, so response times don't reveal which exist.
    valid = verify_password(user.password_hash if user else _dummy_hash(), data.password)
    if user is None or not valid:
        throttle.failed(username, address)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong username or password")
    throttle.succeeded(username)
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


def end_other_sessions(db: DB, request: Request, user: User) -> None:
    """Sign the user out on every other device, keeping the session making this request."""
    token = request.cookies.get(SESSION_COOKIE)
    query = delete(UserSession).where(UserSession.user_id == user.id)
    if token:
        query = query.where(UserSession.token_hash != hash_token(token))
    db.execute(query)


@router.post("/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(data: PasswordChange, request: Request, user: CurrentUser, db: DB) -> None:
    if not verify_password(user.password_hash, data.current_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is wrong")
    user.password_hash = hash_password(data.new_password)
    end_other_sessions(db, request, user)
    db.commit()
