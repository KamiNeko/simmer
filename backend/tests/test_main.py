import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import main
from app.config import get_settings
from app.db import get_engine
from app.models import User

from .conftest import SAMPLE_RECIPE, login

INDEX = "<html><head><title>Simmer</title></head><body>app</body></html>"


@pytest.fixture
def spa(admin, tmp_path, monkeypatch):
    """The built frontend served from SIMMER_STATIC_DIR, on a fresh app so the catch-all
    route doesn't leak into the shared one."""
    static = tmp_path / "static"
    (static / "assets").mkdir(parents=True)
    (static / "index.html").write_text(INDEX)
    (static / "favicon.svg").write_text("<svg/>")
    (static / "assets" / "app.js").write_text("console.log('simmer')")
    (tmp_path / "secret.txt").write_text("top secret")
    monkeypatch.setenv("SIMMER_STATIC_DIR", str(static))
    get_settings.cache_clear()
    monkeypatch.setattr(main, "app", FastAPI())
    main.mount_frontend(get_settings().static_dir)
    with TestClient(main.app) as client:
        yield client


def test_spa_serves_files_and_falls_back_to_index(spa):
    assert spa.get("/assets/app.js").text == "console.log('simmer')"
    assert spa.get("/favicon.svg").text == "<svg/>"
    assert spa.get("/").text == INDEX
    assert spa.get("/plan/week").text == INDEX
    assert spa.get("/recipes/no-such-recipe").text == INDEX


def test_spa_leaves_unknown_api_paths_alone(spa):
    response = spa.get("/api/nope")
    assert response.status_code == 404
    assert response.json() == {"detail": "Not Found"}


def test_spa_paths_cannot_escape_the_static_dir(spa):
    for path in ("/..%2fsecret.txt", "/..%2f..%2f..%2f..%2fetc%2fpasswd"):
        assert spa.get(path).text == INDEX, path
    # The assets mount refuses on its own.
    assert spa.get("/assets/..%2f..%2fsecret.txt").status_code == 404


def test_recipe_pages_get_escaped_open_graph_tags(admin, spa):
    recipe = admin.post(
        "/api/recipes", json={**SAMPLE_RECIPE, "title": 'Soup "><script>x</script>'}
    ).json()
    page = spa.get(f"/recipes/{recipe['slug']}").text
    escaped = "Soup &quot;&gt;&lt;script&gt;x&lt;/script&gt;"
    assert f'<meta property="og:title" content="{escaped}">' in page
    assert "<title>Soup &quot;&gt;&lt;script&gt;x&lt;/script&gt; · Simmer</title>" in page
    assert '<meta property="og:description" content="Spicy-sweet chicken with rice.">' in page
    assert "<script>" not in page
    assert "<title>Simmer</title>" not in page


def _user_count() -> int:
    with Session(get_engine()) as db:
        return db.scalar(select(func.count(User.id)))


def test_bootstrap_admin_only_without_users(client, monkeypatch):
    # The client fixture started the app without the variables: nobody was created.
    assert _user_count() == 0
    monkeypatch.setenv("SIMMER_ADMIN_USERNAME", "chef")
    monkeypatch.setenv("SIMMER_ADMIN_PASSWORD", "chef-password")
    get_settings.cache_clear()
    with TestClient(main.app):
        pass
    assert login(client, "chef", "chef-password")["role"] == "admin"

    # Later starts with other credentials change nothing.
    monkeypatch.setenv("SIMMER_ADMIN_USERNAME", "other")
    get_settings.cache_clear()
    with TestClient(main.app):
        pass
    assert _user_count() == 1
