from typing import AsyncIterator
import asyncio
import google.generativeai as genai
from .base import AIProvider


class GeminiProvider(AIProvider):
    DEFAULT_MODEL = "gemini-1.5-pro"

    def __init__(self, api_key: str, model: str = DEFAULT_MODEL):
        self.api_key = api_key
        self._model = model
        genai.configure(api_key=api_key)

    @property
    def model_name(self) -> str:
        return f"Google Gemini / {self._model}"

    def _get_model(self):
        return genai.GenerativeModel(self._model)

    async def stream_chat(
        self,
        system_prompt: str,
        user_message: str,
        history: list[dict] | None = None,
    ) -> AsyncIterator[str]:
        model = self._get_model()

        # Build history for Gemini format
        gemini_history = []
        if history:
            for m in history[-10:]:
                role = "user" if m["role"] == "user" else "model"
                gemini_history.append({"role": role, "parts": [m["content"]]})

        chat = model.start_chat(history=gemini_history)
        full_message = f"{system_prompt}\n\n{user_message}"

        # Gemini streaming is synchronous — run in thread pool
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: chat.send_message(full_message, stream=True),
        )
        for chunk in response:
            if chunk.text:
                yield chunk.text

    async def complete(self, system_prompt: str, user_message: str) -> str:
        model = self._get_model()
        loop = asyncio.get_event_loop()
        full_message = f"{system_prompt}\n\n{user_message}"
        response = await loop.run_in_executor(
            None,
            lambda: model.generate_content(full_message),
        )
        return response.text
