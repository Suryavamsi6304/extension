from abc import ABC, abstractmethod
from typing import AsyncIterator


class AIProvider(ABC):
    """Abstract base class for all AI provider implementations."""

    @abstractmethod
    async def stream_chat(
        self,
        system_prompt: str,
        user_message: str,
        history: list[dict] | None = None,
    ) -> AsyncIterator[str]:
        """Yield text tokens as they arrive from the model."""
        ...

    @abstractmethod
    async def complete(self, system_prompt: str, user_message: str) -> str:
        """Return a full non-streaming completion."""
        ...

    @property
    @abstractmethod
    def model_name(self) -> str:
        """Human-readable model identifier."""
        ...
