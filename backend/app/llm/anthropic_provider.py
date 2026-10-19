import base64
from collections.abc import Sequence
from typing import Any

import anthropic

from .base import MAX_OUTPUT_TOKENS, TIMEOUT_SECONDS, Image, LLMError


class AnthropicProvider:
    kind = "anthropic"

    def __init__(self, api_key: str, model: str) -> None:
        self.model = model
        self._client = anthropic.Anthropic(api_key=api_key, timeout=TIMEOUT_SECONDS)

    def generate_json(
        self, system: str, prompt: str, schema: dict[str, Any], images: Sequence[Image] = ()
    ) -> str:
        content: list[dict[str, Any]] = [
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": image.media_type,
                    "data": base64.b64encode(image.data).decode(),
                },
            }
            for image in images
        ]
        content.append({"type": "text", "text": prompt})
        try:
            # Streaming avoids request timeouts on long recipes.
            with self._client.messages.stream(
                model=self.model,
                max_tokens=MAX_OUTPUT_TOKENS,
                system=system,
                messages=[{"role": "user", "content": content}],
                output_config={"format": {"type": "json_schema", "schema": schema}},
            ) as stream:
                message = stream.get_final_message()
        except anthropic.AuthenticationError as exc:
            raise LLMError("Anthropic rejected the API key") from exc
        except anthropic.NotFoundError as exc:
            raise LLMError(f"Anthropic doesn't know the model {self.model!r}") from exc
        except anthropic.APIStatusError as exc:
            raise LLMError(f"Anthropic returned an error: {exc.message}") from exc
        except anthropic.APIConnectionError as exc:
            raise LLMError("Couldn't reach Anthropic") from exc

        if message.stop_reason == "refusal":
            raise LLMError("Claude declined to process this recipe")
        if message.stop_reason == "max_tokens":
            raise LLMError("The recipe was too long for one answer")
        text = "".join(block.text for block in message.content if block.type == "text")
        if not text:
            raise LLMError("Anthropic returned an empty answer")
        return text
