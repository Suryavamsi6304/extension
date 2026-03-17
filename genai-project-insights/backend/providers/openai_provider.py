from typing import AsyncIterator
from openai import AsyncOpenAI
from .base import AIProvider


class OpenAIProvider(AIProvider):
    DEFAULT_MODEL = "gpt-4o"

    def __init__(self, api_key: str, model: str = DEFAULT_MODEL, base_url: str | None = None):
        self.api_key = api_key
        self._model = model
        self._base_url = base_url  # For Azure OpenAI or custom endpoints

    def _client(self) -> AsyncOpenAI:
        kwargs = {"api_key": self.api_key}
        if self._base_url:
            kwargs["base_url"] = self._base_url
        return AsyncOpenAI(**kwargs)

    @property
    def model_name(self) -> str:
        return f"OpenAI / {self._model}"

    async def stream_chat(
        self,
        system_prompt: str,
        user_message: str,
        history: list[dict] | None = None,
    ) -> AsyncIterator[str]:
        messages = [{"role": "system", "content": system_prompt}]
        if history:
            for m in history[-10:]:
                messages.append({"role": m["role"], "content": m["content"]})
        messages.append({"role": "user", "content": user_message})

        client = self._client()
        stream = await client.chat.completions.create(
            model=self._model,
            messages=messages,
            max_tokens=4096,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta

    async def complete(self, system_prompt: str, user_message: str) -> str:
        client = self._client()
        response = await client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            max_tokens=2048,
        )
        return response.choices[0].message.content or ""
