"""The self-hosted LLM gateway: its adapter, its settings and translating with it."""

import json
import time

import httpx
import pytest

from app.llm.base import Image, LLMError, LLMUnavailable, ProviderConfig, build_provider
from app.llm.recipes import HEALTH_SCHEMA
from app.routers import ai

from .conftest import SAMPLE_RECIPE
from .test_import import FakeProvider
from .test_translations import GERMAN

GATEWAY = {
    "api_key": "gateway-key-1234",
    "model": "gemma4",
    "base_url": "http://llm.example:8000/",
}


def _gateway(handler):
    provider = build_provider(
        ProviderConfig(
            kind="gateway", model="gemma4", api_key="gateway-key", base_url="http://llm.example:8000/"
        )
    )
    provider._client = httpx.Client(
        base_url=provider.base_url,
        transport=httpx.MockTransport(handler),
        headers=provider._client.headers,
    )
    return provider


def test_gateway_sends_the_instructions_through_the_chat_task():
    requests = []

    def handler(request):
        requests.append(request)
        return httpx.Response(200, json={"output": '```json\n{"ok": true}\n```'})

    raw = _gateway(handler).generate_json("You check health.", "Are you there?", HEALTH_SCHEMA)

    assert json.loads(raw) == {"ok": True}
    request = requests[0]
    assert str(request.url) == "http://llm.example:8000/v1/task"
    assert request.headers["Authorization"] == "Bearer gateway-key"
    body = json.loads(request.content)
    assert body["task"] == "chat"
    assert body["model"] == "gemma4"
    assert body["messages"] == [{"role": "user", "content": "Are you there?"}]
    assert body["params"]["system"].startswith("You check health.")
    assert '"ok":{"type":"boolean"}' in body["params"]["system"]


@pytest.mark.parametrize(
    ("response", "error"),
    [
        (httpx.Response(401, json={"detail": "invalid API key"}), "rejected the API key"),
        (httpx.Response(404, json={"detail": "unknown task"}), "returned an error: unknown task"),
        (httpx.Response(502, text="Bad Gateway"), "returned an error: HTTP 502"),
        (httpx.Response(200, text="not json"), "answer wasn't JSON"),
        (httpx.Response(200, json={"output": "  "}), "returned an empty answer"),
    ],
)
def test_gateway_errors(response, error):
    with pytest.raises(LLMError, match=error) as caught:
        _gateway(lambda request: response).generate_json("s", "p", HEALTH_SCHEMA)
    assert not isinstance(caught.value, LLMUnavailable)


@pytest.mark.parametrize(
    ("exc", "error"),
    [
        (httpx.ConnectError("refused"), "Couldn't reach the LLM gateway at http://llm.example:8000"),
        (httpx.ConnectTimeout("no route"), "Couldn't reach the LLM gateway"),
        (httpx.ReadTimeout("slow"), "didn't answer in time"),
    ],
)
def test_gateway_unreachable(exc, error):
    def handler(request):
        raise exc

    with pytest.raises(LLMUnavailable, match=error):
        _gateway(handler).generate_json("s", "p", HEALTH_SCHEMA)


def test_gateway_reads_no_photos():
    image = Image(data=b"\x89PNG", media_type="image/png")
    with pytest.raises(LLMError, match="can't read photos"):
        _gateway(lambda r: httpx.Response(200)).generate_json("s", "p", HEALTH_SCHEMA, [image])


def test_gateway_needs_an_address(admin):
    without = admin.put("/api/admin/ai/providers/gateway", json={**GATEWAY, "base_url": None})
    assert without.status_code == 400
    assert "server address" in without.json()["detail"]

    saved = admin.put("/api/admin/ai/providers/gateway", json=GATEWAY)
    assert saved.status_code == 200, saved.text
    out = saved.json()
    assert out["base_url"] == "http://llm.example:8000"
    assert out["needs_url"] is True
    assert "gateway-key-1234" not in json.dumps(admin.get("/api/admin/ai/providers").json())

    # Changing the model keeps the stored address and key.
    changed = admin.put("/api/admin/ai/providers/gateway", json={"model": "gemma4-fast"})
    assert changed.json()["base_url"] == "http://llm.example:8000"
    anthropic = admin.get("/api/admin/ai/providers").json()[0]
    assert anthropic["needs_url"] is False


@pytest.fixture
def two_providers(monkeypatch, admin):
    """Anthropic as the default for imports, the gateway beside it, each routed to a fake."""
    admin.put(
        "/api/admin/ai/providers/anthropic",
        json={"api_key": "sk-ant-test-1234", "model": "claude-opus-5-5"},
    )
    admin.put("/api/admin/ai/providers/gateway", json=GATEWAY)
    fakes = {"anthropic": FakeProvider([]), "gateway": FakeProvider([])}
    fakes["gateway"].kind = "gateway"
    monkeypatch.setattr(ai, "build_provider", lambda config: fakes[config.kind])
    return fakes


@pytest.fixture
def slug(admin, two_providers):
    return admin.post("/api/recipes", json=SAMPLE_RECIPE).json()["slug"]


def _wait_for_job(admin):
    for _ in range(100):
        status = admin.get("/api/admin/translations").json()
        if not status["running"]:
            return status
        time.sleep(0.02)
    raise AssertionError("the translation job didn't finish")


def test_translations_use_the_chosen_provider(admin, two_providers, slug):
    response = admin.put(
        "/api/admin/translations", json={"languages": ["de"], "provider": "gateway"}
    )
    assert response.json()["provider"] == "gateway"
    two_providers["gateway"].replies = [GERMAN]

    translated = admin.post(f"/api/recipes/{slug}/translations/de")

    assert translated.status_code == 200, translated.text
    assert translated.json()["title"] == GERMAN["title"]
    assert two_providers["anthropic"].prompts == []


def test_translations_fall_back_to_the_default_provider(admin, two_providers, slug):
    admin.put("/api/admin/translations", json={"languages": ["de"], "provider": "gateway"})
    assert admin.delete("/api/admin/ai/providers/gateway").status_code == 204
    two_providers["anthropic"].replies = [GERMAN]

    translated = admin.post(f"/api/recipes/{slug}/translations/de")

    assert translated.status_code == 200, translated.text
    assert len(two_providers["anthropic"].prompts) == 1


def test_bulk_translation_stops_when_the_gateway_is_offline(admin, two_providers, slug):
    second = {**SAMPLE_RECIPE, "title": "Second recipe"}
    assert admin.post("/api/recipes", json=second).status_code == 201
    down = LLMUnavailable("Couldn't reach the LLM gateway at http://llm.example:8000")
    two_providers["gateway"].replies = [down, GERMAN]
    admin.put("/api/admin/translations", json={"languages": ["de"], "provider": "gateway"})

    admin.post("/api/admin/translations/fill")
    status = _wait_for_job(admin)

    # One failed call, not one per recipe: the second reply was never asked for.
    assert two_providers["gateway"].replies == [GERMAN]
    assert status["failed"] == 2
    assert "Couldn't reach the LLM gateway" in status["error"]
    assert status["missing"] == 2


def test_gateway_fills_in_text_the_model_left_out():
    schema = {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "servings": {"type": ["number", "null"]},
            "unit": {"type": ["string", "null"], "enum": ["g", "cup", None]},
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {"name": {"type": "string"}, "note": {"type": "string"}},
                },
            },
        },
    }
    answer = json.dumps(
        {
            "title": None,
            "servings": None,
            "unit": "null",
            "items": [{"name": "egg", "note": None}, {"name": "salt"}],
        }
    )

    raw = _gateway(lambda r: httpx.Response(200, json={"output": answer})).generate_json(
        "s", "p", schema
    )

    assert json.loads(raw) == {
        "title": "",
        "servings": None,
        "unit": None,
        "items": [{"name": "egg", "note": ""}, {"name": "salt", "note": ""}],
    }
