from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Protocol

KINDS: dict[str, dict[str, str]] = {
    "anthropic": {"label": "Anthropic", "default_model": "claude-opus-5-5"},
    "openai": {"label": "OpenAI", "default_model": "gpt-5"},
    "google": {"label": "Google Gemini", "default_model": "gemini-2.5-flash"},
}

# Recipes are long but the JSON stays well under this.
MAX_OUTPUT_TOKENS = 16000
TIMEOUT_SECONDS = 180


class LLMError(Exception):
    """A provider call failed in a way worth showing to the user."""


@dataclass(frozen=True)
class Image:
    data: bytes
    media_type: str


class Provider(Protocol):
    kind: str
    model: str

    def generate_json(
        self, system: str, prompt: str, schema: dict[str, Any], images: Sequence[Image] = ()
    ) -> str:
        """Return the model's reply as JSON text matching the schema."""
        ...


@dataclass
class ProviderConfig:
    kind: str
    model: str
    api_key: str


def build_provider(config: ProviderConfig) -> Provider:
    if config.kind == "anthropic":
        from .anthropic_provider import AnthropicProvider

        return AnthropicProvider(config.api_key, config.model)
    if config.kind == "openai":
        from .openai_provider import OpenAIProvider

        return OpenAIProvider(config.api_key, config.model)
    if config.kind == "google":
        from .google_provider import GoogleProvider

        return GoogleProvider(config.api_key, config.model)
    raise LLMError(f"Unknown provider {config.kind!r}")
