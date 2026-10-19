from collections.abc import Sequence
from typing import Any

from google import genai
from google.genai import errors, types

from .base import MAX_OUTPUT_TOKENS, TIMEOUT_SECONDS, Image, LLMError


class GoogleProvider:
    kind = "google"

    def __init__(self, api_key: str, model: str) -> None:
        self.model = model
        self._client = genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(timeout=TIMEOUT_SECONDS * 1000),
        )

    def generate_json(
        self, system: str, prompt: str, schema: dict[str, Any], images: Sequence[Image] = ()
    ) -> str:
        contents: list[Any] = [
            types.Part.from_bytes(data=image.data, mime_type=image.media_type) for image in images
        ]
        contents.append(prompt)
        try:
            response = self._client.models.generate_content(
                model=self.model,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=system,
                    max_output_tokens=MAX_OUTPUT_TOKENS,
                    response_mime_type="application/json",
                    response_json_schema=schema,
                ),
            )
        except errors.ClientError as exc:
            if exc.code in (401, 403) or "API key" in str(exc):
                raise LLMError("Google rejected the API key") from exc
            if exc.code == 404:
                raise LLMError(f"Google doesn't know the model {self.model!r}") from exc
            raise LLMError(f"Google returned an error: {exc.message}") from exc
        except errors.APIError as exc:
            raise LLMError(f"Google returned an error: {exc.message}") from exc
        except OSError as exc:
            raise LLMError("Couldn't reach Google") from exc

        text = response.text
        if not text:
            raise LLMError("Google returned an empty answer")
        return text
