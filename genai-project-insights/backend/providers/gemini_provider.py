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

from .base import AIProvider

logger = logging.getLogger(__name__)

_CACHE: TTLCache = TTLCache(maxsize=128, ttl=300)
_RETRY_EXCEPTIONS = (ResourceExhausted, ServiceUnavailable)
_MAX_RETRIES = 3
_BACKOFF_BASE = 2.0


def _fingerprint(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


class GeminiProvider(AIProvider):
    DEFAULT_MODEL = "gemini-2.0-flash"

    def __init__(self, api_key: str, model: str = DEFAULT_MODEL, cache_ttl: int = 300):
        self.api_key = api_key
        self._model = model
        _CACHE.ttl = cache_ttl
        self._client = genai.Client(api_key=api_key)

    @property
    def model_name(self) -> str:
        return f"Google Gemini / {self._model}"

    def _config(self, max_tokens: int = 2048) -> types.GenerateContentConfig:
        return types.GenerateContentConfig(
            max_output_tokens=max_tokens,
            temperature=0.4,
        )

    async def complete(self, system_prompt: str, user_message: str) -> str:
        full_prompt = f"{system_prompt}\n\n{user_message}" if system_prompt else user_message
        fp = _fingerprint(full_prompt)

        if fp in _CACHE:
            logger.info("[gemini] cache hit fingerprint=%s", fp)
            return _CACHE[fp]

        loop = asyncio.get_running_loop()
        t0 = time.monotonic()

        for attempt in range(1, _MAX_RETRIES + 1):
            try:
                response = await loop.run_in_executor(
                    None,
                    lambda: self._client.models.generate_content(
                        model=self._model,
                        contents=full_prompt,
                        config=self._config(max_tokens=2048),
                    ),
                )
                latency = time.monotonic() - t0
                usage = getattr(response, "usage_metadata", None)
                logger.info(
                    "[gemini] complete fingerprint=%s latency=%.2fs input_tokens=%s output_tokens=%s",
                    fp, latency,
                    getattr(usage, "prompt_token_count", "?"),
                    getattr(usage, "candidates_token_count", "?"),
                )
                result = response.text
                _CACHE[fp] = result
                return result
            except _RETRY_EXCEPTIONS as e:
                wait = _BACKOFF_BASE ** attempt
                logger.warning("[gemini] attempt=%d error=%s retrying in %.1fs", attempt, e, wait)
                await asyncio.sleep(wait)
            except Exception as e:
                logger.error("[gemini] complete failed fingerprint=%s error=%s", fp, e)
                raise

        raise RuntimeError(f"Gemini complete failed after {_MAX_RETRIES} retries")

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
        loop = asyncio.get_running_loop()
        t0 = time.monotonic()

        for attempt in range(1, _MAX_RETRIES + 1):
            try:
                response = await loop.run_in_executor(
                    None,
                    lambda: self._client.models.generate_content(
                        model=self._model,
                        contents=contents,
                        config=self._config(max_tokens=4096),
                    ),
                )
                text = response.text or ""
                logger.info(
                    "[gemini] stream_chat fingerprint=%s latency=%.2fs chars=%d",
                    fp, time.monotonic() - t0, len(text),
                )
                yield text
                return
            except _RETRY_EXCEPTIONS as e:
                wait = _BACKOFF_BASE ** attempt
                logger.warning("[gemini] stream attempt=%d error=%s retrying in %.1fs", attempt, e, wait)
                await asyncio.sleep(wait)
            except Exception as e:
                logger.error("[gemini] stream_chat failed fingerprint=%s error=%s", fp, e)
                raise

        raise RuntimeError(f"Gemini stream_chat failed after {_MAX_RETRIES} retries")
