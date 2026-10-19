from typing import Any

import openai

from .base import MAX_OUTPUT_TOKENS, TIMEOUT_SECONDS, LLMError


class OpenAIProvider:
    kind = "openai"

    def __init__(self, api_key: str, model: str) -> None:
        self.model = model
        self._client = openai.OpenAI(api_key=api_key, timeout=TIMEOUT_SECONDS)

    def generate_json(self, system: str, prompt: str, schema: dict[str, Any]) -> str:
        try:
            response = self._client.responses.create(
                model=self.model,
                instructions=system,
                input=prompt,
                max_output_tokens=MAX_OUTPUT_TOKENS,
                text={
                    "format": {
                        "type": "json_schema",
                        "name": "result",
                        "schema": schema,
                        "strict": True,
                    }
                },
            )
        except openai.AuthenticationError as exc:
            raise LLMError("OpenAI rejected the API key") from exc
        except openai.NotFoundError as exc:
            raise LLMError(f"OpenAI doesn't know the model {self.model!r}") from exc
        except openai.APIStatusError as exc:
            raise LLMError(f"OpenAI returned an error: {exc.message}") from exc
        except openai.APIConnectionError as exc:
            raise LLMError("Couldn't reach OpenAI") from exc

        if response.status == "incomplete":
            raise LLMError("OpenAI stopped before the answer was complete")
        text = response.output_text
        if not text:
            raise LLMError("OpenAI returned an empty answer")
        return text
