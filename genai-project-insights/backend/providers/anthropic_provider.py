from typing import AsyncIterator
import anthropic
from .base import AIProvider


class AnthropicProvider(AIProvider):
    DEFAULT_MODEL = "claude-opus-4-5"

    def __init__(self, api_key: str, model: str = DEFAULT_MODEL):
        self.api_key = api_key
        self._model = model

    def _client(self) -> anthropic.AsyncAnthropic:
        return anthropic.AsyncAnthropic(api_key=self.api_key)

    @property
    def model_name(self) -> str:
        return f"Anthropic / {self._model}"

    async def stream_chat(
        self,
        system_prompt: str,
        user_message: str,
        history: list[dict] | None = None,
    ) -> AsyncIterator[str]:
        messages = []
        if history:
            for m in history[-10:]:
                messages.append({"role": m["role"], "content": m["content"]})
        messages.append({"role": "user", "content": user_message})

        client = self._client()
        async with client.messages.stream(
            model=self._model,
            max_tokens=4096,
            system=system_prompt,
            messages=messages,
        ) as stream:
            async for text in stream.text_stream:
                yield text

    async def complete(self, system_prompt: str, user_message: str) -> str:
        client = self._client()
        msg = await client.messages.create(
            model=self._model,
            max_tokens=2048,
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}],
        )
        return msg.content[0].text
