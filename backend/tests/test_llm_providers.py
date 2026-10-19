"""The provider adapters, with each SDK client swapped for a fake that never touches the network."""

import json
from contextlib import contextmanager
from types import SimpleNamespace

import anthropic
import httpx2
import openai
import pytest
from google.genai import errors as google_errors

from app.llm.base import Image, LLMError, ProviderConfig, build_provider
from app.llm.recipes import HEALTH_SCHEMA, check_connection

ANSWER = '{"ok": true}'


def _status_error(cls, status, message):
    request = httpx2.Request("POST", "https://api.example/v1")
    return cls(message, response=httpx2.Response(status, request=request), body=None)


def _connection_error(sdk):
    return sdk.APIConnectionError(request=httpx2.Request("POST", "https://api.example/v1"))


def _google_error(cls, code, message):
    return cls(code, {"error": {"code": code, "message": message, "status": "ERROR"}})


def _anthropic_message(stop_reason, text=""):
    content = [SimpleNamespace(type="thinking", thinking="hmm")]
    if text:
        content.append(SimpleNamespace(type="text", text=text))
    return SimpleNamespace(stop_reason=stop_reason, content=content)


def _fake_client(kind, result, calls):
    """A client whose one method used by the adapter raises `result` or returns it."""

    def call(**kwargs):
        calls.append(kwargs)
        if isinstance(result, Exception):
            raise result
        return result

    if kind == "anthropic":

        @contextmanager
        def stream(**kwargs):
            yield SimpleNamespace(get_final_message=lambda: call(**kwargs))

        return SimpleNamespace(messages=SimpleNamespace(stream=stream))
    if kind == "openai":
        return SimpleNamespace(responses=SimpleNamespace(create=call))
    return SimpleNamespace(models=SimpleNamespace(generate_content=call))


CASES = [
    # Anthropic
    (
        "anthropic",
        _status_error(anthropic.AuthenticationError, 401, "invalid x-api-key"),
        "Anthropic rejected the API key",
    ),
    (
        "anthropic",
        _status_error(anthropic.NotFoundError, 404, "model: nope"),
        "Anthropic doesn't know the model 'test-model'",
    ),
    (
        "anthropic",
        _status_error(anthropic.APIStatusError, 529, "Overloaded"),
        "Anthropic returned an error: Overloaded",
    ),
    ("anthropic", _connection_error(anthropic), "Couldn't reach Anthropic"),
    ("anthropic", _anthropic_message("refusal"), "Claude declined to process this recipe"),
    ("anthropic", _anthropic_message("max_tokens", "{"), "The recipe was too long"),
    ("anthropic", _anthropic_message("end_turn"), "Anthropic returned an empty answer"),
    ("anthropic", _anthropic_message("end_turn", ANSWER), None),
    # OpenAI
    (
        "openai",
        _status_error(openai.AuthenticationError, 401, "Incorrect API key"),
        "OpenAI rejected the API key",
    ),
    (
        "openai",
        _status_error(openai.NotFoundError, 404, "model_not_found"),
        "OpenAI doesn't know the model 'test-model'",
    ),
    (
        "openai",
        _status_error(openai.RateLimitError, 429, "Rate limit reached"),
        "OpenAI returned an error: Rate limit reached",
    ),
    ("openai", _connection_error(openai), "Couldn't reach OpenAI"),
    (
        "openai",
        SimpleNamespace(status="incomplete", output_text="{"),
        "OpenAI stopped before the answer was complete",
    ),
    (
        "openai",
        SimpleNamespace(status="completed", output_text=""),
        "OpenAI returned an empty answer",
    ),
    ("openai", SimpleNamespace(status="completed", output_text=ANSWER), None),
    # Google
    (
        "google",
        _google_error(google_errors.ClientError, 403, "Permission denied"),
        "Google rejected the API key",
    ),
    (
        "google",
        _google_error(google_errors.ClientError, 400, "API key not valid"),
        "Google rejected the API key",
    ),
    (
        "google",
        _google_error(google_errors.ClientError, 404, "models/nope is not found"),
        "Google doesn't know the model 'test-model' or doesn't offer it to this API key. "
        "Try a current model such as gemini-3.8-flash.",
    ),
    (
        "google",
        _google_error(google_errors.ClientError, 429, "Quota exceeded"),
        "Google returned an error: Quota exceeded",
    ),
    (
        "google",
        _google_error(google_errors.ServerError, 503, "Overloaded"),
        "Google returned an error: Overloaded",
    ),
    ("google", ConnectionRefusedError("refused"), "Couldn't reach Google"),
    ("google", SimpleNamespace(text=None), "Google returned an empty answer"),
    ("google", SimpleNamespace(text=ANSWER), None),
]


@pytest.mark.parametrize(("kind", "result", "error"), CASES)
def test_provider_adapter(kind, result, error):
    provider = build_provider(ProviderConfig(kind=kind, model="test-model", api_key="test-key"))
    calls: list[dict] = []
    provider._client = _fake_client(kind, result, calls)
    image = Image(data=b"\x89PNG", media_type="image/png")

    if error is None:
        raw = provider.generate_json("system", "prompt", HEALTH_SCHEMA, [image])
        assert json.loads(raw) == {"ok": True}
        assert calls[0]["model"] == "test-model"
    else:
        with pytest.raises(LLMError) as caught:
            provider.generate_json("system", "prompt", HEALTH_SCHEMA, [image])
        assert str(caught.value).startswith(error)


def test_unknown_provider_kind():
    with pytest.raises(LLMError, match="Unknown provider 'mistral'"):
        build_provider(ProviderConfig(kind="mistral", model="m", api_key="k"))


def test_check_connection_wants_the_health_answer():
    def answering(raw):
        return SimpleNamespace(generate_json=lambda system, prompt, schema, images=(): raw)

    check_connection(answering(ANSWER))
    for wrong in ('{"status": "fine"}', "OK", "[]"):
        with pytest.raises(LLMError, match="not in the expected format"):
            check_connection(answering(wrong))
