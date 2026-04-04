import logging
from .base import AIProvider
from .gemini_provider import GeminiProvider
from .groq_provider import GroqProvider
from .pluralsight_provider import PluralsightProvider
from config import get_settings

logger = logging.getLogger(__name__)


def get_provider(
    name: str | None = None,
    api_key: str | None = None,
) -> AIProvider:
    """
    Return an AIProvider instance for the given provider name.
    Supported: groq | gemini | pluralsight
    api_key overrides the configured key (for per-request key injection).
    """
    settings = get_settings()
    provider_name = (name or settings.ai_provider).lower()

    logger.info("[factory] resolving provider=%s", provider_name)

    match provider_name:
        case "gemini":
            key = api_key or settings.gemini_api_key
            provider = GeminiProvider(api_key=key, model=settings.gemini_model)

        case "pluralsight":
            key = api_key or settings.pluralsight_api_key
            provider = PluralsightProvider(api_key=key, model=settings.pluralsight_model)

        case "groq":
            key = api_key or settings.groq_api_key
            provider = GroqProvider(api_key=key, model=settings.groq_model)

        case _:
            raise ValueError(
                f"Unknown AI provider: '{provider_name}'. "
                f"Valid options: gemini, pluralsight, groq"
            )

    provider.validate()
    return provider
