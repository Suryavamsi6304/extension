from typing import AsyncIterator
import httpx
from .base import AIProvider

ENDPOINT_MAP = {
    "chatgpt-4o": "https://labs.pluralsight.com/labs-ai-proxy/rest/openai/chatgpt-4o/v1/chat/completions",
    "claude-instant-v1": "https://labs.pluralsight.com/labs-ai-proxy/rest/bedrock/anthropic/claude-instant-v1",
    "claude-v2": "https://labs.pluralsight.com/labs-ai-proxy/rest/bedrock/anthropic/claude-v2",
    "titan-tg1-large": "https://labs.pluralsight.com/labs-ai-proxy/bedrock-amazon/titan-tg1-large",
    "jamba-mini": "https://labs.pluralsight.com/labs-ai-proxy/rest/bedrock/ai21/jamba-mini",
    "jamba-large": "https://labs.pluralsight.com/labs-ai-proxy/rest/bedrock/ai21/jamba-large",
    "llama2-13b": "https://labs.pluralsight.com/labs-ai-proxy/rest/bedrock/meta/llama2-13b-chat-v1",
}

DEFAULT_MODEL = "chatgpt-4o"


class PluralsightProvider(AIProvider):
    def __init__(self, api_key: str, model: str = DEFAULT_MODEL):
        self.api_key = api_key
        self._model = model
        self._endpoint = ENDPOINT_MAP.get(model, ENDPOINT_MAP[DEFAULT_MODEL])

    @property
    def model_name(self) -> str:
        return f"Pluralsight / {self._model}"

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def complete(self, system_prompt: str, user_message: str) -> str:
        prompt = f"{system_prompt}\n\n{user_message}" if system_prompt else user_message
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                self._endpoint,
                headers=self._headers(),
                json={"prompt": prompt},
            )
            resp.raise_for_status()
            data = resp.json()
            # chatgpt-4o returns {"response": "..."}
            # bedrock models return {"message": "..."}
            if "response" in data:
                return str(data["response"])
            msg = data.get("message", "")
            if isinstance(msg, dict):
                return msg.get("content", "") or str(msg)
            return str(msg) if msg else str(data)

    async def stream_chat(
        self,
        system_prompt: str,
        user_message: str,
        history: list[dict] | None = None,
    ) -> AsyncIterator[str]:
        # Proxy API does not support streaming — yield full response as one chunk
        result = await self.complete(system_prompt, user_message)
        yield result
