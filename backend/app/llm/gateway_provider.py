"""A self-hosted LLM gateway in front of Ollama, such as a home server running Gemma.

The gateway runs named tasks; Simmer sends its own instructions through the `chat` task.
It has no JSON mode, so the schema goes into the instructions and the answer is checked
by the caller like any other. A home server on CPU answers slowly and one request at a
time, so calls wait for each other here instead of queueing up on the server.
"""

import json
import re
import threading
from collections.abc import Sequence
from typing import Any

import httpx

from .base import Image, LLMError, LLMUnavailable

# A recipe takes about a minute on CPU; leave room for a cold start and a queue.
TIMEOUT = httpx.Timeout(600, connect=10)
MAX_OUTPUT_TOKENS = 4096

_one_at_a_time = threading.Lock()
_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$")


class GatewayProvider:
    kind = "gateway"

    def __init__(self, api_key: str, model: str, base_url: str) -> None:
        self.model = model
        self.base_url = base_url.rstrip("/")
        self._client = httpx.Client(
            base_url=self.base_url, timeout=TIMEOUT, headers={"Authorization": f"Bearer {api_key}"}
        )

    def generate_json(
        self, system: str, prompt: str, schema: dict[str, Any], images: Sequence[Image] = ()
    ) -> str:
        """Ask the gateway for JSON matching the schema and return the text."""
        if images:
            raise LLMError("The LLM gateway can't read photos. Choose another provider.")
        instructions = (
            f"{system}\n\nAnswer with one JSON object matching this JSON schema, with no code "
            f"fences and no other text:\n{json.dumps(schema, separators=(',', ':'))}"
        )
        body = {
            "task": "chat",
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}],
            "params": {
                "system": instructions,
                "options": {"temperature": 0.2, "num_predict": MAX_OUTPUT_TOKENS},
            },
        }
        try:
            with _one_at_a_time:
                response = self._client.post("/v1/task", json=body)
        except httpx.ConnectTimeout as exc:
            raise LLMUnavailable(f"Couldn't reach the LLM gateway at {self.base_url}") from exc
        except httpx.TimeoutException as exc:
            raise LLMUnavailable("The LLM gateway didn't answer in time") from exc
        except httpx.HTTPError as exc:
            raise LLMUnavailable(f"Couldn't reach the LLM gateway at {self.base_url}") from exc

        if response.status_code == 401:
            raise LLMError("The LLM gateway rejected the API key")
        if response.status_code >= 400:
            raise LLMError(f"The LLM gateway returned an error: {_detail(response)}")
        data = _json(response)
        if data is None:
            raise LLMError("The LLM gateway's answer wasn't JSON")
        text = _FENCE.sub("", str(data.get("output") or "").strip())
        if not text:
            raise LLMError("The LLM gateway returned an empty answer")
        try:
            return json.dumps(_fit(json.loads(text), schema), ensure_ascii=False)
        except ValueError:
            # Not JSON: the caller's check reports it and asks again.
            return text


def _fit(value: Any, schema: dict[str, Any]) -> Any:
    """Fill the gaps a model without a JSON mode leaves: null or missing text becomes "",
    and a value outside a nullable enum, such as the unit "null", becomes null."""
    kind = schema.get("type")
    allowed = schema.get("enum")
    if allowed is not None and value not in allowed and None in allowed:
        return None
    if kind == "string" and value is None:
        return ""
    if kind == "object" and isinstance(value, dict):
        properties = schema.get("properties", {})
        for key, sub_schema in properties.items():
            value[key] = _fit(value.get(key), sub_schema)
        return value
    if kind == "array" and isinstance(value, list):
        return [_fit(item, schema.get("items", {})) for item in value]
    return value


def _json(response: httpx.Response) -> dict[str, Any] | None:
    try:
        data = response.json()
    except ValueError:
        return None
    return data if isinstance(data, dict) else None


def _detail(response: httpx.Response) -> str:
    detail = (_json(response) or {}).get("detail")
    return str(detail or f"HTTP {response.status_code}")
