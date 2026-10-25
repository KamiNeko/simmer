"""AI providers (Anthropic, OpenAI, Google, a self-hosted gateway) behind one small interface."""

from .base import KINDS, LLMError, LLMUnavailable, Provider, build_provider

__all__ = ["KINDS", "LLMError", "LLMUnavailable", "Provider", "build_provider"]
