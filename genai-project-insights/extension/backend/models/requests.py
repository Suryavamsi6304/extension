from pydantic import BaseModel, Field


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


class ChatMessage(BaseModel):
    role: str   # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    workspace_path: str
    history: list[ChatMessage] = Field(default_factory=list)
    provider: str | None = None
    api_key: str | None = None


class TodoRequest(BaseModel):
    workspace_path: str


class GitRequest(BaseModel):
    workspace_path: str
    max_commits: int = 20
    provider: str | None = None
    api_key: str | None = None
