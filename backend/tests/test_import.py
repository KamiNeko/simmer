import io
import json
from pathlib import Path

import httpx
import pytest
from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import db as db_module
from app import importer
from app.llm.base import LLMError
from app.llm.recipes import INGREDIENT_SCHEMA, RECIPE_SCHEMA
from app.models import LLMProvider
from app.routers import ai

from .conftest import login

PAGE = (Path(__file__).parent / "fixtures" / "wprm_recipe.html").read_bytes()
URL = "https://example.com/gochujang-chicken/"

AI_RECIPE = {
    "title": "Gochujang Chicken",
    "description": "Spicy-sweet chicken.",
    "servings": 4,
    "prep_minutes": 15,
    "cook_minutes": 25,
    "total_minutes": 100,
    "tags": ["Korean", "Chicken"],
    "groups": [
        {
            "name": "",
            "ingredients": [
                {
                    "quantity": 2,
                    "quantity_max": None,
                    "unit": "cup",
                    "name": "rice",
                    "note": "",
                    "original_text": "2 cups rice",
                    "grams_per_ml": 0.85,
                },
                {
                    "quantity": 0,
                    "quantity_max": None,
                    "unit": None,
                    "name": "",
                    "note": "",
                    "original_text": "",
                    "grams_per_ml": None,
                },
            ],
        },
        {
            "name": "Sauce",
            "ingredients": [
                {
                    "quantity": 3,
                    "quantity_max": None,
                    "unit": "tbsp",
                    "name": "gochujang",
                    "note": "",
                    "original_text": "3 tbsp gochujang",
                    "grams_per_ml": 1.2,
                }
            ],
        },
    ],
    "steps": [{"section": "Cook", "text": "Bake it."}, {"section": "", "text": " "}],
}


class FakeProvider:
    kind = "anthropic"
    model = "fake-model"

    def __init__(self, replies):
        self.replies = list(replies)
        self.prompts: list[str] = []
        self.images: list = []

    def generate_json(self, system, prompt, schema, images=()):
        self.prompts.append(prompt)
        self.images.append(list(images))
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply if isinstance(reply, str) else json.dumps(reply)


@pytest.fixture
def page(monkeypatch):
    monkeypatch.setattr(importer, "fetch", lambda url, max_bytes=0: (PAGE, url, "text/html"))


@pytest.fixture
def fake(monkeypatch, admin):
    """Configure Anthropic and route its calls to a fake provider."""
    response = admin.put(
        "/api/admin/ai/providers/anthropic",
        json={"api_key": "sk-ant-test-1234", "model": "claude-opus-5-5"},
    )
    assert response.status_code == 200, response.text
    provider = FakeProvider([])
    monkeypatch.setattr(ai, "build_provider", lambda config: provider)
    return provider


# Page parsing


def test_duration_and_servings():
    assert importer.parse_duration("PT1H30M") == 90
    assert importer.parse_duration("P0DT0H25M") == 25
    assert importer.parse_duration("PT0S") is None
    assert importer.parse_duration("soon") is None
    assert importer.parse_servings(["4", "4 servings"]) == 4
    assert importer.parse_servings("Makes 2,5 l") == 2.5
    assert importer.parse_servings(None) is None


def test_parse_page_reads_jsonld_groups_and_sections():
    page = importer.parse_page(PAGE, URL)
    assert page.image_url == "https://example.com/images/chicken.jpg"
    assert [name for name, _ in page.ingredient_groups] == ["", "Marinade", "Sauce"]

    draft = importer.draft_from_page(page)
    assert draft.title == "Gochujang Chicken Meal Prep & Rice"
    assert draft.description == "Spicy-sweet chicken for the week."
    assert (draft.servings, draft.prep_minutes, draft.total_minutes) == (4, 15, 100)
    assert draft.tags == ["Korean", "Main Course", "Gochujang chicken", "Meal prep"]
    assert [g.name for g in draft.groups] == ["", "Marinade", "Sauce"]
    chicken = draft.groups[0].ingredients[0]
    assert (chicken.quantity, chicken.unit, chicken.name, chicken.note) == (
        2,
        "lb",
        "chicken thigh",
        "boneless",
    )
    assert chicken.original_text == "2 lb chicken thigh, boneless"
    assert [(s.section, s.text) for s in draft.steps] == [
        ("Marinate", "Mix the marinade."),
        ("Marinate", "Coat the chicken and rest 30 minutes."),
        ("Cook", "Bake at 200°C for 25 minutes."),
    ]

    source = importer.llm_source(page)
    assert "Marinade:\n- 1 tbsp soy sauce" in source
    assert "Site navigation" not in source


def test_page_without_recipe_data_falls_back_to_text():
    page = importer.parse_page(
        b"<html><body><nav>menu</nav><main><p>Mix 2 eggs</p></main></body></html>", URL
    )
    assert importer.draft_from_page(page) is None
    assert page.text == "Mix 2 eggs"
    assert "Mix 2 eggs" in importer.llm_source(page)


def test_private_addresses_are_refused(monkeypatch):
    for name in ("HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "ALL_PROXY"):
        monkeypatch.delenv(name, raising=False)
    with pytest.raises(importer.FetchError, match="local or private"):
        importer.fetch("http://127.0.0.1:8080/")
    with pytest.raises(importer.FetchError, match="http and https"):
        importer.fetch("file:///etc/passwd")


def test_blocked_sites_suggest_text_or_photo_import(monkeypatch):
    seen = {}

    def answer(request):
        seen.update(request.headers)
        return httpx.Response(403, text="Forbidden")

    client = httpx.Client
    monkeypatch.setattr(importer, "_check_public", lambda url: None)
    monkeypatch.setattr(importer, "_check_peer", lambda response: None)
    monkeypatch.setattr(
        importer.httpx, "Client", lambda **kw: client(transport=httpx.MockTransport(answer), **kw)
    )
    with pytest.raises(importer.FetchError, match=r"error 403.*bookmark.*From text"):
        importer.fetch("https://recipes.example/beans/")
    assert "Simmer" not in seen["user-agent"]
    assert seen["accept"].startswith("text/html")


def _all_objects(schema):
    if isinstance(schema, dict):
        if schema.get("type") == "object":
            yield schema
        for value in schema.values():
            yield from _all_objects(value)


def test_schema_uses_the_strict_subset():
    objects = list(_all_objects(RECIPE_SCHEMA))
    assert INGREDIENT_SCHEMA in objects
    for obj in objects:
        assert obj["additionalProperties"] is False
        assert set(obj["required"]) == set(obj["properties"])


# Provider settings


def test_provider_settings_keep_the_key_secret(admin):
    assert admin.post("/api/admin/ai/providers/openai/test").status_code == 404
    missing_key = admin.put("/api/admin/ai/providers/openai", json={"model": "gpt-5"})
    assert missing_key.status_code == 400

    saved = admin.put(
        "/api/admin/ai/providers/openai",
        json={"api_key": "sk-openai-secret-9876", "model": "gpt-5"},
    ).json()
    assert saved["configured"] and saved["is_default"] and saved["key_hint"] == "9876"
    assert "sk-openai" not in json.dumps(admin.get("/api/admin/ai/providers").json())

    with Session(db_module.get_engine()) as session:
        row = session.scalar(select(LLMProvider).where(LLMProvider.kind == "openai"))
        assert "sk-openai-secret-9876" not in row.api_key_encrypted

    # A model change keeps the key; a second provider can become the default.
    admin.put("/api/admin/ai/providers/openai", json={"model": "gpt-5-mini"})
    admin.put(
        "/api/admin/ai/providers/google",
        json={"api_key": "AIza-google-key", "model": "gemini-2.5-flash", "is_default": True},
    )
    providers = {p["kind"]: p for p in admin.get("/api/admin/ai/providers").json()}
    assert providers["openai"]["model"] == "gpt-5-mini"
    assert providers["openai"]["key_hint"] == "9876"
    assert providers["google"]["is_default"] and not providers["openai"]["is_default"]
    assert not providers["anthropic"]["configured"]

    # Removing the default promotes another provider.
    assert admin.delete("/api/admin/ai/providers/google").status_code == 204
    ready = admin.get("/api/ai/providers").json()
    assert [(p["kind"], p["is_default"]) for p in ready] == [("openai", True)]


def test_members_cannot_manage_providers(admin):
    admin.post(
        "/api/users",
        json={"username": "sam", "display_name": "Sam", "password": "member-pass"},
    )
    login(admin, "sam", "member-pass")
    assert admin.get("/api/admin/ai/providers").status_code == 403
    assert admin.get("/api/ai/providers").status_code == 200
    admin.cookies.clear()
    assert admin.get("/api/ai/providers").status_code == 401
    assert admin.post("/api/import", json={"url": URL}).status_code == 401


def test_provider_test_endpoint(admin, fake):
    fake.replies = [{"ok": True}, LLMError("Anthropic rejected the API key")]
    assert admin.post("/api/admin/ai/providers/anthropic/test").json() == {"status": "ok"}
    failed = admin.post("/api/admin/ai/providers/anthropic/test")
    assert failed.status_code == 502
    assert failed.json()["detail"] == "Anthropic rejected the API key"


# Import


def test_url_import_without_ai_uses_page_data(admin, page):
    result = admin.post("/api/import", json={"url": URL}).json()
    assert result["provider"] is None and result["warning"] is None
    assert result["image_url"] == "https://example.com/images/chicken.jpg"
    recipe = result["recipe"]
    assert recipe["source_url"] == URL
    assert [g["name"] for g in recipe["groups"]] == ["", "Marinade", "Sauce"]

    # The draft saves as is.
    assert admin.post("/api/recipes", json=recipe).status_code == 201


def test_page_from_the_browser_is_read_without_downloading(admin, monkeypatch):
    def blocked(url, max_bytes=0):
        raise importer.FetchError("blocked")

    monkeypatch.setattr(importer, "fetch", blocked)
    html = PAGE.decode()
    result = admin.post("/api/import", json={"html": html, "url": URL}).json()
    recipe = result["recipe"]
    assert recipe["source_url"] == URL
    assert [g["name"] for g in recipe["groups"]] == ["", "Marinade", "Sauce"]
    assert result["image_url"] == "https://example.com/images/chicken.jpg"

    # Pasted page source has no address.
    result = admin.post("/api/import", json={"html": html}).json()
    assert result["recipe"]["source_url"] is None
    assert admin.post("/api/recipes", json=result["recipe"]).status_code == 201


def test_url_import_with_ai(admin, page, fake):
    fake.replies = [AI_RECIPE]
    result = admin.post("/api/import", json={"url": URL}).json()
    assert (result["provider"], result["model"]) == ("anthropic", "fake-model")
    recipe = result["recipe"]
    assert recipe["source_url"] == URL
    # Empty ingredients and steps from the model are dropped.
    assert [len(g["ingredients"]) for g in recipe["groups"]] == [1, 1]
    assert recipe["groups"][1]["ingredients"][0]["grams_per_ml"] == 1.2
    assert recipe["steps"] == [{"section": "Cook", "text": "Bake it."}]
    assert "Marinade:" in fake.prompts[0]


def test_ai_answer_is_retried_once_with_the_error(admin, page, fake):
    fake.replies = ["not json", AI_RECIPE]
    result = admin.post("/api/import", json={"url": URL})
    assert result.status_code == 200
    assert "not valid" in fake.prompts[1] and "not json" in fake.prompts[1]

    fake.replies = [{"title": ""}, {"title": ""}]
    result = admin.post("/api/import", json={"url": URL}).json()
    assert "even after a retry" in result["warning"]
    assert result["provider"] is None
    assert result["recipe"]["title"] == "Gochujang Chicken Meal Prep & Rice"


def test_skipping_ai_and_text_import(admin, page, fake):
    result = admin.post("/api/import", json={"url": URL, "provider": "none"}).json()
    assert result["provider"] is None
    assert admin.post("/api/import", json={"url": URL, "provider": "google"}).status_code == 400

    fake.replies = [AI_RECIPE]
    result = admin.post("/api/import", json={"text": "Gochujang chicken\n2 cups rice"}).json()
    assert result["recipe"]["title"] == "Gochujang Chicken"
    assert result["recipe"]["source_url"] is None
    assert "2 cups rice" in fake.prompts[0]


def test_text_import_needs_a_provider(admin):
    response = admin.post("/api/import", json={"text": "2 eggs"})
    assert response.status_code == 400
    assert "AI provider" in response.json()["detail"]
    assert admin.post("/api/import", json={"text": "  "}).status_code == 400


def test_page_without_recipe_needs_ai(admin, monkeypatch):
    monkeypatch.setattr(
        importer, "fetch", lambda url, max_bytes=0: (b"<p>hello</p>", url, "text/html")
    )
    response = admin.post("/api/import", json={"url": URL})
    assert response.status_code == 422


def test_tidy_keeps_title_and_description(admin, fake):
    fake.replies = [AI_RECIPE]
    typed = {
        "title": "My chicken",
        "description": "Grandma's",
        "groups": [{"name": "", "ingredients": [{"name": "2 cups rice"}]}],
        "steps": [{"text": "Cook everything."}],
    }
    tidied = admin.post("/api/ai/tidy", json={"recipe": typed}).json()
    assert (tidied["title"], tidied["description"]) == ("My chicken", "Grandma's")
    assert tidied["groups"][1]["name"] == "Sauce"
    assert '"2 cups rice"' in fake.prompts[0]


def test_photo_from_url(admin, monkeypatch):
    slug = admin.post("/api/recipes", json={"title": "Toast"}).json()["slug"]
    buffer = io.BytesIO()
    Image.new("RGB", (800, 600), "orange").save(buffer, "JPEG")
    monkeypatch.setattr(
        importer, "fetch", lambda url, max_bytes=0: (buffer.getvalue(), url, "image/jpeg")
    )
    recipe = admin.put(
        f"/api/recipes/{slug}/photo/from-url", json={"url": "https://example.com/a.jpg"}
    ).json()
    assert recipe["photo_url"].endswith(".webp")

    monkeypatch.setattr(importer, "fetch", lambda url, max_bytes=0: (b"nope", url, "text/html"))
    bad = admin.put(f"/api/recipes/{slug}/photo/from-url", json={"url": "https://example.com/"})
    assert bad.status_code == 400


def _jpeg(size=(3000, 2000)):
    buffer = io.BytesIO()
    Image.new("RGB", size, "white").save(buffer, "JPEG")
    return buffer.getvalue()


def test_photo_import(admin, fake):
    fake.replies = [AI_RECIPE]
    files = [
        ("files", ("page1.jpg", _jpeg(), "image/jpeg")),
        ("files", ("page2.png", _jpeg((800, 600)), "image/png")),
    ]
    result = admin.post("/api/import/photos", files=files, data={"provider": "anthropic"}).json()
    assert result["recipe"]["title"] == "Gochujang Chicken"
    assert result["provider"] == "anthropic" and result["image_url"] is None
    sent = fake.images[0]
    assert [i.media_type for i in sent] == ["image/jpeg", "image/jpeg"]
    # Large photos are scaled down before they go to the provider.
    assert max(Image.open(io.BytesIO(sent[0].data)).size) == 2000


def test_photo_import_errors(admin):
    jpeg = [("files", ("page.jpg", _jpeg((400, 300)), "image/jpeg"))]
    response = admin.post("/api/import/photos", files=jpeg)
    assert response.status_code == 400 and "AI provider" in response.json()["detail"]

    admin.put(
        "/api/admin/ai/providers/openai", json={"api_key": "sk-openai-key-1", "model": "gpt-5"}
    )
    bad = [("files", ("notes.txt", b"hello", "text/plain"))]
    assert admin.post("/api/import/photos", files=bad).status_code == 400
    many = jpeg * 7
    assert admin.post("/api/import/photos", files=many).status_code == 400
