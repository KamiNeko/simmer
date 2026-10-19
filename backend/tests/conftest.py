import pytest
from fastapi.testclient import TestClient

from app import db as db_module
from app.config import get_settings


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("SIMMER_DATA_DIR", str(tmp_path))
    monkeypatch.delenv("SIMMER_ADMIN_USERNAME", raising=False)
    monkeypatch.delenv("SIMMER_ADMIN_PASSWORD", raising=False)
    get_settings.cache_clear()
    db_module.init_engine()
    from app.main import app
    from app.routers.auth import throttle

    throttle.failures.clear()

    with TestClient(app) as test_client:
        yield test_client
    get_settings.cache_clear()


@pytest.fixture
def admin(client):
    response = client.post(
        "/api/auth/setup",
        json={"username": "alex", "display_name": "Alex", "password": "secret-pass"},
    )
    assert response.status_code == 201
    return client


@pytest.fixture
def member(admin):
    """A second browser, logged in as the member "sam" whom the admin created."""
    from app.main import app

    response = admin.post(
        "/api/users",
        json={"username": "sam", "display_name": "Sam", "password": "member-pass"},
    )
    assert response.status_code == 201
    sam = TestClient(app)
    login(sam, "sam", "member-pass")
    yield sam
    sam.close()


def login(client, username, password):
    client.cookies.clear()
    response = client.post("/api/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200, response.text
    return response.json()


SAMPLE_RECIPE = {
    "title": "Gochujang Chicken Meal Prep",
    "description": "Spicy-sweet chicken with rice.",
    "servings": 4,
    "total_minutes": 40,
    "tags": ["Korean", "Meal prep"],
    "groups": [
        {
            "name": "",
            "ingredients": [
                {"quantity": 2, "unit": "lb", "name": "chicken thigh", "note": "boneless"},
                {"quantity": 2, "unit": "cup", "name": "rice", "grams_per_ml": 0.85},
            ],
        },
        {
            "name": "Marinade",
            "ingredients": [{"quantity": 1, "unit": "tbsp", "name": "soy sauce"}],
        },
        {
            "name": "Sauce",
            "ingredients": [
                {"quantity": 3, "unit": "tbsp", "name": "gochujang"},
                {"name": "salt", "note": "to taste"},
            ],
        },
    ],
    "steps": [
        {"text": "Marinate the chicken for 30 minutes."},
        {"section": "Make the sauce", "text": "Mix all sauce ingredients."},
    ],
}
