from __future__ import annotations

import json
import logging
from typing import AsyncIterator

import httpx

from .base import AIProvider

logger = logging.getLogger(__name__)

_GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"


class GroqProvider(AIProvider):
    DEFAULT_MODEL = "llama-3.3-70b-versatile"

    def __init__(self, api_key: str, model: str = DEFAULT_MODEL):
        self.api_key = api_key
        self._model = model

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

    async def complete(self, system_prompt: str, user_message: str) -> str:
        messages = self._build_messages(system_prompt, user_message, None)
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                _GROQ_API_URL,
                headers=self._headers(),
                json={"model": self._model, "messages": messages, "temperature": 0.4},
            )
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"]

    async def stream_chat(
        self,
        system_prompt: str,
        user_message: str,
        history: list[dict] | None = None,
    ) -> AsyncIterator[str]:
        messages = self._build_messages(system_prompt, user_message, history)
        async with httpx.AsyncClient(timeout=120) as client:
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
                        break
                    try:
                        chunk = json.loads(payload)
                        token = chunk["choices"][0]["delta"].get("content", "")
                        if token:
                            yield token
                    except (KeyError, json.JSONDecodeError):
                        continue
