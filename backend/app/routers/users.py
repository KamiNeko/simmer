from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from ..deps import DB, AdminUser
from ..models import Role, User, UserSession
from ..schemas import UserCreate, UserOut, UserUpdate
from ..security import hash_password

router = APIRouter(prefix="/api/users", tags=["users"])


def _get(db: DB, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return user


def _admin_count(db: DB) -> int:
    return db.scalar(select(func.count(User.id)).where(User.role == Role.admin)) or 0


@router.get("", response_model=list[UserOut])
def list_users(_: AdminUser, db: DB) -> list[User]:
    return list(db.scalars(select(User).order_by(User.username)))


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(data: UserCreate, _: AdminUser, db: DB) -> User:
    exists = db.scalar(select(User).where(func.lower(User.username) == data.username.lower()))
    if exists:
        raise HTTPException(status.HTTP_409_CONFLICT, "Username is taken")
    user = User(
        username=data.username,
        display_name=data.display_name,
        password_hash=hash_password(data.password),
        role=data.role,
    )
    db.add(user)
    db.commit()
    return user


@router.patch("/{user_id}", response_model=UserOut)
def update_user(user_id: int, data: UserUpdate, admin: AdminUser, db: DB) -> User:
    user = _get(db, user_id)
    if data.role == Role.member and user.is_admin and _admin_count(db) == 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Keep at least one admin")
    if data.display_name is not None:
        user.display_name = data.display_name
    if data.role is not None:
        user.role = data.role
    if data.password is not None:
        user.password_hash = hash_password(data.password)
        # A reset signs the user out everywhere, except the admin resetting themselves.
        if user.id != admin.id:
            for session in db.scalars(select(UserSession).where(UserSession.user_id == user.id)):
                db.delete(session)
    db.commit()
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, admin: AdminUser, db: DB) -> None:
    user = _get(db, user_id)
    if user.id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot delete yourself")
    db.delete(user)
    db.commit()
