from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.db import get_engine
from app.models import UserSession

from .conftest import login


def test_setup_only_once(client):
    state = client.get("/api/auth/me").json()
    assert state == {"user": None, "needs_setup": True}
    first = client.post(
        "/api/auth/setup", json={"username": "alex", "display_name": "Alex", "password": "12345678"}
    )
    assert first.status_code == 201
    assert first.json()["role"] == "admin"
    second = client.post(
        "/api/auth/setup", json={"username": "eve", "display_name": "Eve", "password": "12345678"}
    )
    assert second.status_code == 409


def test_login_logout(admin):
    assert admin.get("/api/auth/me").json()["user"]["username"] == "alex"
    admin.post("/api/auth/logout")
    assert admin.get("/api/auth/me").json()["user"] is None
    bad = admin.post("/api/auth/login", json={"username": "alex", "password": "wrong"})
    assert bad.status_code == 401
    login(admin, "ALEX", "secret-pass")
    assert admin.get("/api/auth/me").json()["user"]["username"] == "alex"


def test_admin_manages_users(admin):
    created = admin.post(
        "/api/users",
        json={"username": "sam", "display_name": "Sam", "password": "sam-password"},
    )
    assert created.status_code == 201
    sam_id = created.json()["id"]
    assert (
        admin.post(
            "/api/users", json={"username": "Sam", "display_name": "x", "password": "12345678"}
        ).status_code
        == 409
    )

    login(admin, "sam", "sam-password")
    assert admin.get("/api/users").status_code == 403

    login(admin, "alex", "secret-pass")
    reset = admin.patch(f"/api/users/{sam_id}", json={"password": "new-password"})
    assert reset.status_code == 200
    me_id = admin.get("/api/auth/me").json()["user"]["id"]
    assert admin.patch(f"/api/users/{me_id}", json={"role": "member"}).status_code == 400
    assert admin.delete(f"/api/users/{me_id}").status_code == 400
    assert admin.delete(f"/api/users/{sam_id}").status_code == 204


def test_change_password_and_preferences(admin):
    wrong = admin.post(
        "/api/auth/password", json={"current_password": "nope", "new_password": "another-pass"}
    )
    assert wrong.status_code == 400
    ok = admin.post(
        "/api/auth/password",
        json={"current_password": "secret-pass", "new_password": "another-pass"},
    )
    assert ok.status_code == 204
    login(admin, "alex", "another-pass")
    updated = admin.patch("/api/auth/me", json={"unit_system": "us"})
    assert updated.json()["unit_system"] == "us"
    assert updated.json()["import_language"] == ""
    updated = admin.patch("/api/auth/me", json={"import_language": "de"})
    assert updated.json()["import_language"] == "de"
    assert admin.get("/api/auth/me").json()["user"]["import_language"] == "de"
    assert admin.patch("/api/auth/me", json={"import_language": "Klingon"}).status_code == 422


def test_timestamps_are_utc(admin):
    created_at = admin.get("/api/auth/me").json()["user"]["created_at"]
    assert created_at.endswith(("Z", "+00:00"))


def test_admin_edits_users(admin, member):
    users = admin.get("/api/users").json()
    assert [(u["username"], u["role"]) for u in users] == [("alex", "admin"), ("sam", "member")]
    alex_id, sam_id = (u["id"] for u in users)
    renamed = admin.patch(f"/api/users/{sam_id}", json={"display_name": "Samantha"})
    assert renamed.json()["display_name"] == "Samantha"
    assert admin.patch("/api/users/9999", json={"display_name": "x"}).status_code == 404

    # A promotion takes effect on the member's next request.
    assert admin.patch(f"/api/users/{sam_id}", json={"role": "admin"}).json()["role"] == "admin"
    assert member.get("/api/users").status_code == 200
    # With two admins one can step down, but the last one can't.
    assert member.patch(f"/api/users/{alex_id}", json={"role": "member"}).status_code == 200
    last = member.patch(f"/api/users/{sam_id}", json={"role": "member"})
    assert last.status_code == 400
    assert last.json()["detail"] == "Keep at least one admin"
    assert admin.get("/api/users").status_code == 403


# Sessions


def _session_count() -> int:
    with Session(get_engine()) as db:
        return db.scalar(select(func.count(UserSession.id)))


def test_expired_session_is_removed(admin):
    assert _session_count() == 1
    with Session(get_engine()) as db:
        db.execute(update(UserSession).values(expires_at=datetime.now(UTC) - timedelta(minutes=1)))
        db.commit()
    assert admin.get("/api/auth/me").json() == {"user": None, "needs_setup": False}
    assert _session_count() == 0


def test_password_reset_signs_the_user_out(admin, member):
    assert member.get("/api/auth/me").json()["user"]["username"] == "sam"
    sam_id = member.get("/api/auth/me").json()["user"]["id"]
    assert admin.patch(f"/api/users/{sam_id}", json={"password": "reset-pass"}).status_code == 200
    assert member.get("/api/auth/me").json()["user"] is None
    assert member.get("/api/shopping").status_code == 401
    # The admin's own session is untouched.
    assert admin.get("/api/auth/me").json()["user"]["username"] == "alex"
    login(member, "sam", "reset-pass")
