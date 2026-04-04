import logging
import time
from typing import AsyncIterator

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception, before_sleep_log

from .base import AIProvider

logger = logging.getLogger(__name__)


def _is_retryable(exc: BaseException) -> bool:
    """Retry on rate-limit, server errors, and transient network faults."""
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in {429, 500, 502, 503, 504}
    return isinstance(exc, httpx.TransientError)

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

    def validate(self) -> None:
        if not self.api_key or not self.api_key.strip():
            raise ValueError(
                "Pluralsight API key is missing. "
                "Set PLURALSIGHT_API_KEY in your .env file, or run "
                "'GenAI: Set / Rotate API Key' in VS Code. "
                "Obtain your key from the Pluralsight lab environment."
            )

    @property
    def model_name(self) -> str:
        return f"Pluralsight / {self._model}"

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        retry=retry_if_exception(_is_retryable),
        reraise=True,
        before_sleep=before_sleep_log(logger, logging.WARNING),
    )
    async def complete(
        self,
        system_prompt: str,
        user_message: str,
        history: list[dict] | None = None,
    ) -> str:
        parts: list[str] = []
        if system_prompt:
            parts.append(system_prompt)
        for m in (history or [])[-10:]:
            role = "User" if m["role"] == "user" else "Assistant"
            parts.append(f"{role}: {m['content']}")
        parts.append(f"User: {user_message}")
        prompt = "\n\n".join(parts)

        t0 = time.monotonic()
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                self._endpoint,
                headers=self._headers(),
                json={"prompt": prompt},
            )
            resp.raise_for_status()
            data = resp.json()
            result: str
            if "response" in data:
                result = str(data["response"])
            else:
                msg = data.get("message", "")
                if isinstance(msg, dict):
                    result = msg.get("content", "") or str(msg)
                else:
                    result = str(msg) if msg else str(data)
            logger.info(
                "ai_call provider=pluralsight model=%s chars=%d latency_ms=%d",
                self._model, len(result), round((time.monotonic() - t0) * 1000),
            )
            return result

    async def stream_chat(
        self,
        system_prompt: str,
        user_message: str,
        history: list[dict] | None = None,
    ) -> AsyncIterator[str]:
        # Pluralsight proxy does not support streaming — yield full response as one chunk
        result = await self.complete(system_prompt, user_message, history=history)
        yield result
