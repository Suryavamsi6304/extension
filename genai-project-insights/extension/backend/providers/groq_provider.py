from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import AsyncIterator

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception, before_sleep_log

from .base import AIProvider

logger = logging.getLogger(__name__)

_GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"


def _is_retryable(exc: BaseException) -> bool:
    """Retry on rate-limit, server errors, and transient network faults."""
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in {429, 500, 502, 503, 504}
    return isinstance(exc, httpx.TransientError)


class GroqProvider(AIProvider):
    DEFAULT_MODEL = "llama-3.3-70b-versatile"

    def __init__(self, api_key: str, model: str = DEFAULT_MODEL):
        self.api_key = api_key
        self._model = model

    def validate(self) -> None:
        if not self.api_key or not self.api_key.strip():
            raise ValueError(
                "Groq API key is missing. "
                "Set GROQ_API_KEY in your .env file, or run "
                "'GenAI: Set / Rotate API Key' in VS Code. "
                "Get a key at https://console.groq.com"
            )

    @property
    def model_name(self) -> str:
        return f"Groq / {self._model}"

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def _build_messages(
        self, system_prompt: str, user_message: str, history: list[dict] | None
    ) -> list[dict]:
        messages: list[dict] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        for m in (history or [])[-10:]:
            messages.append({"role": m["role"], "content": m["content"]})
        messages.append({"role": "user", "content": user_message})
        return messages

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        retry=retry_if_exception(_is_retryable),
        reraise=True,
        before_sleep=before_sleep_log(logger, logging.WARNING),
    )
    async def complete(self, system_prompt: str, user_message: str) -> str:
        messages = self._build_messages(system_prompt, user_message, None)
        t0 = time.monotonic()
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                _GROQ_API_URL,
                headers=self._headers(),
                json={"model": self._model, "messages": messages, "temperature": 0.4},
            )
            resp.raise_for_status()
            data = resp.json()
            choices = data.get("choices", [])
            if not choices:
                raise ValueError(f"Groq returned empty choices list: {data}")
            usage = data.get("usage", {})
            logger.info(
                "ai_call provider=groq model=%s input_tokens=%s output_tokens=%s latency_ms=%d",
                self._model,
                usage.get("prompt_tokens", "?"),
                usage.get("completion_tokens", "?"),
                round((time.monotonic() - t0) * 1000),
            )
            return choices[0]["message"]["content"]

    async def stream_chat(
        self,
        system_prompt: str,
        user_message: str,
        history: list[dict] | None = None,
    ) -> AsyncIterator[str]:
        messages = self._build_messages(system_prompt, user_message, history)
        # Async generators cannot use the @retry decorator directly.
        # We retry only if no tokens have been yielded yet — once the client
        # has received tokens we cannot safely restart the stream.
        started = False
        token_count = 0
        t0 = time.monotonic()
        for attempt_num in range(1, 4):
            try:
                async with httpx.AsyncClient(timeout=60.0) as client:
                    async with client.stream(
                        "POST",
                        _GROQ_API_URL,
                        headers=self._headers(),
                        json={
                            "model": self._model,
                            "messages": messages,
                            "temperature": 0.4,
                            "stream": True,
                        },
                    ) as resp:
                        resp.raise_for_status()
                        async for line in resp.aiter_lines():
                            if not line.startswith("data: "):
                                continue
                            payload = line[6:].strip()
                            if payload == "[DONE]":
                                return
                            try:
                                chunk = json.loads(payload)
                                token = chunk["choices"][0]["delta"].get("content", "")
                                if token:
                                    started = True
                                    token_count += 1
                                    yield token
                            except (KeyError, IndexError, json.JSONDecodeError):
                                continue
                logger.info(
                    "ai_stream_done provider=groq model=%s chunks=%d latency_ms=%d",
                    self._model, token_count, round((time.monotonic() - t0) * 1000),
                )
                return  # stream completed successfully
            except Exception as exc:
                if started or not _is_retryable(exc) or attempt_num == 3:
                    raise
                wait_time = min(1.0 * (2 ** (attempt_num - 1)), 8.0)
                logger.warning(
                    "[groq] stream_chat attempt=%d error=%s retrying in %.1fs",
                    attempt_num, exc, wait_time,
                )
                await asyncio.sleep(wait_time)
