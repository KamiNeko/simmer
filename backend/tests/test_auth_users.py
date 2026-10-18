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


def test_timestamps_are_utc(admin):
    created_at = admin.get("/api/auth/me").json()["user"]["created_at"]
    assert created_at.endswith(("Z", "+00:00"))
