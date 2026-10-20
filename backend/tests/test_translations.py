import io
import json
import zipfile

import pytest
from fastapi.testclient import TestClient

from app.routers import ai

from .conftest import SAMPLE_RECIPE
from .test_import import FakeProvider

GERMAN = {
    "title": "Gochujang-Hähnchen zum Vorkochen",
    "description": "Scharf-süßes Hähnchen mit Reis.",
    "groups": [
        {
            "name": "",
            "ingredients": [
                {"name": "Hähnchenschenkel", "note": "ohne Knochen"},
                {"name": "Reis", "note": ""},
            ],
        },
        {"name": "Marinade", "ingredients": [{"name": "Sojasauce", "note": ""}]},
        {
            "name": "Soße",
            "ingredients": [
                {"name": "Gochujang", "note": ""},
                {"name": "Salz", "note": "nach Geschmack"},
            ],
        },
    ],
    "steps": [
        {"section": "", "text": "Das Hähnchen 30 Minuten marinieren."},
        {"section": "Soße zubereiten", "text": "Alle Zutaten für die Soße verrühren."},
    ],
}


@pytest.fixture
def fake(monkeypatch, admin):
    """Anthropic set up, German chosen for sharing, and AI calls routed to a fake."""
    response = admin.put(
        "/api/admin/ai/providers/anthropic",
        json={"api_key": "sk-ant-test-1234", "model": "claude-opus-5-5"},
    )
    assert response.status_code == 200, response.text
    provider = FakeProvider([])
    monkeypatch.setattr(ai, "build_provider", lambda config: provider)
    response = admin.put("/api/admin/translations", json={"languages": ["de"]})
    assert response.status_code == 200, response.text
    return provider


def _visitor():
    from app.main import app

    return TestClient(app)


def test_languages_are_public_and_cleaned(admin):
    visitor = _visitor()
    assert visitor.get("/api/languages").json() == {"base": "en", "translations": []}
    saved = admin.put("/api/admin/translations", json={"languages": ["de", "en", "ru", "de"]})
    assert saved.json()["languages"] == ["de", "ru"]
    assert visitor.get("/api/languages").json()["translations"] == ["de", "ru"]
    assert visitor.put("/api/admin/translations", json={"languages": []}).status_code == 401
    bad = admin.put("/api/admin/translations", json={"languages": ["Klingon"]})
    assert bad.status_code == 422


def test_new_recipes_are_translated_and_shown_in_the_language(admin, fake):
    fake.replies = [GERMAN]
    slug = admin.post("/api/recipes", json=SAMPLE_RECIPE).json()["slug"]
    assert "from English into German" in fake.systems[0]
    sent = json.loads(fake.prompts[0].removeprefix("<recipe>\n").removesuffix("\n</recipe>"))
    assert sent["groups"][0]["ingredients"][0] == {"name": "chicken thigh", "note": "boneless"}
    # Amounts and units are not sent; they come from the English recipe.
    assert "quantity" not in json.dumps(sent)

    english = admin.get(f"/api/recipes/{slug}").json()
    assert (english["title"], english["language"]) == ("Gochujang Chicken Meal Prep", "en")

    # Visitors can read the shared recipe in German.
    german = _visitor().get(f"/api/recipes/{slug}?lang=de").json()
    assert german["title"] == "Gochujang-Hähnchen zum Vorkochen"
    assert (german["language"], german["translation_outdated"]) == ("de", False)
    chicken = german["groups"][0]["ingredients"][0]
    assert (chicken["name"], chicken["note"], chicken["quantity"], chicken["unit"]) == (
        "Hähnchenschenkel",
        "ohne Knochen",
        2,
        "lb",
    )
    assert german["groups"][2]["name"] == "Soße"
    assert german["steps"][1]["section"] == "Soße zubereiten"
    assert german["tags"] == ["Korean", "Meal prep"]
    assert german["ingredient_preview"].startswith("Hähnchenschenkel, Reis")

    listed = _visitor().get("/api/recipes?lang=de").json()
    assert listed[0]["title"] == "Gochujang-Hähnchen zum Vorkochen"
    assert listed[0]["language"] == "de"
    assert admin.get("/api/recipes").json()[0]["title"] == "Gochujang Chicken Meal Prep"

    # Search finds the recipe by its German words, too.
    assert [r["slug"] for r in admin.get("/api/recipes?q=hähnchen").json()] == [slug]
    assert [r["slug"] for r in admin.get("/api/recipes?q=sojasauce").json()] == [slug]

    # A language without a translation falls back to English.
    french = admin.get(f"/api/recipes/{slug}?lang=fr").json()
    assert (french["language"], french["translation_outdated"]) == ("en", True)
    assert admin.get(f"/api/recipes/{slug}?lang=xx").status_code == 422


def test_editing_retranslates_unless_the_author_says_no(admin, fake):
    fake.replies = [GERMAN]
    slug = admin.post("/api/recipes", json=SAMPLE_RECIPE).json()["slug"]

    # A change that doesn't touch the text needs no new translation.
    admin.put(f"/api/recipes/{slug}", json={**SAMPLE_RECIPE, "servings": 6})
    assert len(fake.prompts) == 1

    edited = {**SAMPLE_RECIPE, "steps": [*SAMPLE_RECIPE["steps"][:1], {"text": "Mix the sauce."}]}
    response = admin.put(f"/api/recipes/{slug}?update_translations=false", json=edited)
    assert response.status_code == 200
    assert len(fake.prompts) == 1
    stale = admin.get(f"/api/recipes/{slug}?lang=de").json()
    # Still German, marked as made from an older version.
    assert (stale["language"], stale["translation_outdated"]) == ("de", True)
    assert stale["steps"][1]["text"] == "Alle Zutaten für die Soße verrühren."

    # With another step the old translation no longer lines up, so English shows.
    longer = {**edited, "steps": [*edited["steps"], {"text": "Serve."}]}
    admin.put(f"/api/recipes/{slug}?update_translations=false", json=longer)
    mismatched = admin.get(f"/api/recipes/{slug}?lang=de").json()
    assert (mismatched["language"], mismatched["translation_outdated"]) == ("en", True)
    assert mismatched["steps"][2]["text"] == "Serve."

    # By default a save translates again.
    fake.replies = [{**GERMAN, "steps": [*GERMAN["steps"], {"section": "", "text": "Servieren."}]}]
    admin.put(f"/api/recipes/{slug}", json=longer)
    fresh = admin.get(f"/api/recipes/{slug}?lang=de").json()
    assert (fresh["language"], fresh["translation_outdated"]) == ("de", False)
    assert fresh["steps"][2]["text"] == "Servieren."


def test_translate_now(admin, member, fake):
    admin.put("/api/admin/translations", json={"languages": []})
    slug = admin.post("/api/recipes", json=SAMPLE_RECIPE).json()["slug"]
    assert fake.prompts == []

    assert _visitor().post(f"/api/recipes/{slug}/translations/de").status_code == 401
    assert admin.post(f"/api/recipes/{slug}/translations/en").status_code == 400
    assert admin.post("/api/recipes/nope/translations/de").status_code == 404

    fake.replies = [GERMAN]
    german = member.post(f"/api/recipes/{slug}/translations/de").json()
    assert german["title"] == "Gochujang-Hähnchen zum Vorkochen"
    assert german["language"] == "de"

    # An answer that doesn't line up with the recipe is retried once, then refused.
    short = {**GERMAN, "steps": GERMAN["steps"][:1]}
    fake.replies = [short, short]
    failed = admin.post(f"/api/recipes/{slug}/translations/ru")
    assert failed.status_code == 502
    assert "same number of groups" in fake.prompts[-1]
    assert admin.get(f"/api/recipes/{slug}?lang=ru").json()["language"] == "en"

    fake.replies = [short, GERMAN]
    assert admin.post(f"/api/recipes/{slug}/translations/ru").json()["language"] == "ru"


def test_translating_needs_ai(admin):
    slug = admin.post("/api/recipes", json=SAMPLE_RECIPE).json()["slug"]
    response = admin.post(f"/api/recipes/{slug}/translations/de")
    assert response.status_code == 400 and "AI provider" in response.json()["detail"]
    admin.put("/api/admin/translations", json={"languages": ["de"]})
    assert admin.post("/api/admin/translations/fill").status_code == 400
    # Saving still works; there is just nothing to translate with.
    assert (
        admin.put(f"/api/recipes/{slug}", json={**SAMPLE_RECIPE, "title": "X"}).status_code == 200
    )


def test_fill_translates_every_missing_recipe(admin, member, fake):
    admin.put("/api/admin/translations", json={"languages": []})
    for title in ("One", "Two"):
        admin.post("/api/recipes", json={**SAMPLE_RECIPE, "title": title})
    assert admin.post("/api/admin/translations/fill").status_code == 400

    status = admin.put("/api/admin/translations", json={"languages": ["de"]}).json()
    assert (status["missing"], status["running"]) == (2, False)
    assert member.get("/api/admin/translations").status_code == 403

    fake.replies = [GERMAN, {"title": ""}, {"title": ""}]
    assert admin.post("/api/admin/translations/fill").status_code == 200
    status = admin.get("/api/admin/translations").json()
    assert (status["missing"], status["running"], status["done"], status["failed"]) == (
        1,
        False,
        2,
        1,
    )
    assert "even after a retry" in status["error"]


def test_export_keeps_translations(admin, fake):
    fake.replies = [GERMAN]
    slug = admin.post("/api/recipes", json={**SAMPLE_RECIPE, "source_language": "ko"}).json()[
        "slug"
    ]
    exported = admin.get("/api/export").content
    document = json.loads(zipfile.ZipFile(io.BytesIO(exported)).read("recipes.json"))
    entry = document["recipes"][0]
    assert entry["source_language"] == "ko"
    assert entry["translations"]["de"]["title"] == GERMAN["title"]

    admin.delete(f"/api/recipes/{slug}")
    entry["translations"]["fr"] = {"title": 5}
    entry["translations"]["xx"] = GERMAN
    upload = json.dumps(document).encode()
    result = admin.post("/api/import/file", files={"file": ("r.json", upload)}).json()
    slug = result["imported"][0]["slug"]
    german = admin.get(f"/api/recipes/{slug}?lang=de").json()
    assert (german["title"], german["translation_outdated"]) == (GERMAN["title"], False)
    assert german["source_language"] == "ko"
    assert admin.get(f"/api/recipes/{slug}?lang=fr").json()["language"] == "en"
