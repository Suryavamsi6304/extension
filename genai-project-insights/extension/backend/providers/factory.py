from .base import AIProvider
from .anthropic_provider import AnthropicProvider
from .openai_provider import OpenAIProvider
from .gemini_provider import GeminiProvider
from .ollama_provider import OllamaProvider
from .pluralsight_provider import PluralsightProvider
from config import get_settings


def get_provider(
    name: str | None = None,
    api_key: str | None = None,
) -> AIProvider:
    """
    Return an AIProvider instance for the given provider name.
    api_key overrides the configured key (for per-request key injection).
    """
    settings = get_settings()
    provider_name = name or settings.ai_provider

    match provider_name.lower():
        case "anthropic":
            key = api_key or settings.anthropic_api_key
            return AnthropicProvider(api_key=key)

        case "openai":
            key = api_key or settings.openai_api_key
            return OpenAIProvider(api_key=key)

        case "gemini":
            key = api_key or settings.gemini_api_key
            return GeminiProvider(api_key=key)

        case "ollama":
            return OllamaProvider(
                base_url=settings.ollama_base_url,
                model=settings.ollama_model,
            )

        case "pluralsight":
            key = api_key or settings.pluralsight_api_key
            return PluralsightProvider(api_key=key, model=settings.pluralsight_model)

        case _:
            raise ValueError(f"Unknown AI provider: '{provider_name}'. "
                             f"Valid options: anthropic, openai, gemini, ollama, pluralsight")
