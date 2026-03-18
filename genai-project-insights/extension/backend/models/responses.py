from pydantic import BaseModel


class ProjectOverview(BaseModel):
    summary: str
    tree: str
    file_count: int
    language_breakdown: dict[str, int]
    dependencies: dict
    readme_preview: str


class ExplainResult(BaseModel):
    explanation: str
    complexity: str       # Low | Medium | High
    key_points: list[str]
    suggestions: list[str]


class ActivityItem(BaseModel):
    event_type: str
    path: str
    timestamp: str


class TodoItem(BaseModel):
    tag: str
    text: str
    file: str
    line: int
    context: str


class CommitInfo(BaseModel):
    hash: str
    author: str
    date: str
    message: str
    files_changed: list[str]


class GitInsights(BaseModel):
    branch: str
    commits: list[CommitInfo]
    uncommitted_changes: list[str]
    ai_summary: str = ""
    error: str = ""
