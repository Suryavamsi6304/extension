from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # AI provider selection
    ai_provider: str = "anthropic"  # openai | anthropic | gemini | ollama

    # API keys
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    gemini_api_key: str = ""

    # Pluralsight Prompt Sandbox
    pluralsight_api_key: str = ""
    pluralsight_model: str = "chatgpt-4o"  # see pluralsight_provider.py ENDPOINT_MAP

    # Ollama config (no key needed — local)
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3"

    # Server config
    backend_port: int = 8765
    max_file_size_kb: int = 500

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


def get_settings() -> Settings:
    # No cache — always reads .env fresh on each process start
    return Settings()
