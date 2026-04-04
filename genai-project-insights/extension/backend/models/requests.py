from pydantic import BaseModel, Field, field_validator

# Hard ceilings on text sent to AI providers.
# Truncate silently — never reject the request outright.
MAX_MESSAGE_CHARS = 4_000    # single user chat message (~1k tokens)
MAX_CODE_CHARS    = 8_000    # code snippet sent for explanation (~2k tokens)
MAX_CONTEXT_CHARS = 40_000   # project context / history item (~10k tokens)


class ScanRequest(BaseModel):
    workspace_path: str
    provider: str | None = None
    api_key: str | None = None


class ExplainRequest(BaseModel):
    code: str
    language: str = "python"
    file_path: str = ""
    provider: str | None = None
    api_key: str | None = None

    @field_validator("code")
    @classmethod
    def limit_code(cls, v: str) -> str:
        return v[:MAX_CODE_CHARS]


class ChatMessage(BaseModel):
    role: str   # "user" | "assistant"
    content: str

    @field_validator("content")
    @classmethod
    def limit_content(cls, v: str) -> str:
        return v[:MAX_CONTEXT_CHARS]


class ChatRequest(BaseModel):
    message: str
    workspace_path: str
    history: list[ChatMessage] = Field(default_factory=list)
    provider: str | None = None
    api_key: str | None = None

    @field_validator("message")
    @classmethod
    def limit_message(cls, v: str) -> str:
        return v[:MAX_MESSAGE_CHARS]


class TodoRequest(BaseModel):
    workspace_path: str


class GitRequest(BaseModel):
    workspace_path: str
    max_commits: int = 20
    provider: str | None = None
    api_key: str | None = None
