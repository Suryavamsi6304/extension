from abc import ABC, abstractmethod
from typing import AsyncIterator


class AIProvider(ABC):
    """Abstract base class for all AI provider implementations."""

    @abstractmethod
    def validate(self) -> None:
        """
        Raise ValueError with a clear, actionable message if the provider
        cannot be used (e.g. API key missing or obviously malformed).
        Must be synchronous and free of network I/O — called on every
        get_provider() call and once at startup.
        """
        ...

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
    async def complete(
        self,
        system_prompt: str,
        user_message: str,
        history: list[dict] | None = None,
    ) -> str:
        """Return a full non-streaming completion."""
        ...

    @property
    @abstractmethod
    def model_name(self) -> str:
        """Human-readable model identifier."""
        ...
