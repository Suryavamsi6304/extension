from __future__ import annotations

import asyncio
import hashlib
import logging
import time
from typing import AsyncIterator

from google import genai
from google.genai import types
from google.api_core.exceptions import ResourceExhausted, ServiceUnavailable
from cachetools import TTLCache
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception, before_sleep_log

from .base import AIProvider

logger = logging.getLogger(__name__)

_CACHE: TTLCache = TTLCache(maxsize=128, ttl=300)
_RETRY_EXCEPTIONS = (ResourceExhausted, ServiceUnavailable)


def _is_retryable(exc: BaseException) -> bool:
    """Retry on Google quota/availability errors and executor timeouts."""
    return isinstance(exc, (*_RETRY_EXCEPTIONS, asyncio.TimeoutError))


def _fingerprint(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


class GeminiProvider(AIProvider):
    DEFAULT_MODEL = "gemini-2.0-flash"

    def __init__(self, api_key: str, model: str = DEFAULT_MODEL, cache_ttl: int = 300):
        self.api_key = api_key
        self._model = model
        # Do not mutate the module-level _CACHE.ttl — it is shared across all instances
        # and mutating it here would affect cached entries from previous instances.
        self._client = genai.Client(api_key=api_key)

    def validate(self) -> None:
        if not self.api_key or not self.api_key.strip():
            raise ValueError(
                "Gemini API key is missing. "
                "Set GEMINI_API_KEY in your .env file, or run "
                "'GenAI: Set / Rotate API Key' in VS Code. "
                "Get a key at https://aistudio.google.com"
            )

    @property
    def model_name(self) -> str:
        return f"Google Gemini / {self._model}"

    def _config(self, max_tokens: int = 2048) -> types.GenerateContentConfig:
        return types.GenerateContentConfig(
            max_output_tokens=max_tokens,
            temperature=0.4,
        )

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        retry=retry_if_exception(_is_retryable),
        reraise=True,
        before_sleep=before_sleep_log(logger, logging.WARNING),
    )
    async def _generate(self, contents: str | list, max_tokens: int, timeout: float) -> str:
        """Retried inner call — keeps cache and logging logic out of the retry loop."""
        loop = asyncio.get_running_loop()
        # Capture locals so the lambda doesn't close over mutable self attributes
        model, client, config = self._model, self._client, self._config(max_tokens)
        response = await asyncio.wait_for(
            loop.run_in_executor(
                None,
                lambda: client.models.generate_content(
                    model=model, contents=contents, config=config,
                ),
            ),
            timeout=timeout,
        )
        return response.text or ""

    async def complete(self, system_prompt: str, user_message: str) -> str:
        full_prompt = f"{system_prompt}\n\n{user_message}" if system_prompt else user_message
        fp = _fingerprint(full_prompt)

        if fp in _CACHE:
            logger.info("[gemini] cache hit fp=%s", fp)
            return _CACHE[fp]

        t0 = time.monotonic()
        result = await self._generate(full_prompt, max_tokens=2048, timeout=30.0)
        logger.info(
            "ai_call provider=gemini model=%s fp=%s chars=%d latency_ms=%d",
            self._model, fp, len(result), round((time.monotonic() - t0) * 1000),
        )
        _CACHE[fp] = result
        return result

    async def stream_chat(
        self,
        system_prompt: str,
        user_message: str,
        history: list[dict] | None = None,
    ) -> AsyncIterator[str]:
        contents: list[types.Content] = [
            types.Content(
                role="user" if m["role"] == "user" else "model",
                parts=[types.Part(text=m["content"])],
            )
            for m in (history or [])[-10:]
        ]
        full_message = f"{system_prompt}\n\n{user_message}" if system_prompt else user_message
        contents.append(types.Content(role="user", parts=[types.Part(text=full_message)]))

        fp = _fingerprint(full_message)
        t0 = time.monotonic()
        # _generate carries full retry logic; yield once after it resolves
        text = await self._generate(contents, max_tokens=4096, timeout=60.0)
        logger.info(
            "ai_stream_done provider=gemini model=%s fp=%s chars=%d latency_ms=%d",
            self._model, fp, len(text), round((time.monotonic() - t0) * 1000),
        )
        yield text
