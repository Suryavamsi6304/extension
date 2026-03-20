from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

_ENV_PATH = Path(__file__).parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_PATH),
        env_file_encoding="utf-8",
    )

    # AI provider selection: gemini | pluralsight
    ai_provider: str = "pluralsight"

    # Gemini
    gemini_api_key: str = ""
    gemini_model: str = "gemini-1.5-pro"

    # Pluralsight Prompt Sandbox
    pluralsight_api_key: str = ""
    pluralsight_model: str = "chatgpt-4o"

    # Server config
    backend_port: int = 8765
    max_file_size_kb: int = 500

    # Cache TTL in seconds for repeated LLM calls
    llm_cache_ttl: int = 300


def get_settings() -> Settings:
    return Settings()
