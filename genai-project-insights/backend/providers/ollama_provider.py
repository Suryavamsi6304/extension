from typing import AsyncIterator
import httpx
import json
from .base import AIProvider


class OllamaProvider(AIProvider):
    def __init__(self, base_url: str = "http://localhost:11434", model: str = "llama3"):
        self.base_url = base_url.rstrip("/")
        self._model = model

    @property
    def model_name(self) -> str:
        return f"Ollama / {self._model}"

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

        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/api/chat",
                json={"model": self._model, "messages": messages, "stream": True},
            ) as response:
                async for line in response.aiter_lines():
                    if line:
                        data = json.loads(line)
                        content = data.get("message", {}).get("content", "")
                        if content:
                            yield content
                        if data.get("done"):
                            break

    async def complete(self, system_prompt: str, user_message: str) -> str:
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ]
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{self.base_url}/api/chat",
                json={"model": self._model, "messages": messages, "stream": False},
            )
            data = response.json()
            return data.get("message", {}).get("content", "")
