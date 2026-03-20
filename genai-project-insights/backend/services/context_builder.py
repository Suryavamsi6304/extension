import os
import logging
from pathlib import Path
from .scanner import scan_project, ProjectContext

logger = logging.getLogger(__name__)

FILE_CONTENT_EXTS = {
    ".py", ".ts", ".js", ".tsx", ".jsx", ".java", ".go", ".rs",
    ".cs", ".cpp", ".c", ".h", ".rb", ".php", ".swift", ".kt",
}
MAX_FILE_SIZE = 8_000
MAX_TOTAL_CONTENT = 60_000
MAX_FILES = 30

IGNORE_DIRS = {
    ".git", "__pycache__", "node_modules", ".venv", "venv",
    "dist", "build", ".mypy_cache", ".pytest_cache",
}


def _read_file_contents(root_path: str) -> str:
    """Read actual contents of code files and return as formatted string."""
    root = Path(root_path).resolve()
    sections: list[str] = []
    total_chars = 0
    file_count = 0

    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in IGNORE_DIRS]
        if file_count >= MAX_FILES or total_chars >= MAX_TOTAL_CONTENT:
            break
        for fname in sorted(filenames):
            if file_count >= MAX_FILES or total_chars >= MAX_TOTAL_CONTENT:
                break
            fpath = Path(dirpath) / fname
            if fpath.suffix.lower() not in FILE_CONTENT_EXTS:
                continue
            try:
                content = fpath.read_text(encoding="utf-8", errors="replace")
                if len(content) > MAX_FILE_SIZE:
                    content = content[:MAX_FILE_SIZE] + "\n... (truncated)"
                rel = str(fpath.relative_to(root))
                sections.append(f"### {rel}\n```{fpath.suffix.lstrip('.')}\n{content}\n```")
                total_chars += len(content)
                file_count += 1
            except Exception as e:
                logger.warning("[context_builder] failed to read %s: %s", fpath, e)

    return "\n\n".join(sections)


def build_project_context(workspace_path: str, max_tree_lines: int = 100, ctx: ProjectContext | None = None, include_file_contents: bool = False) -> str:
    """
    Build a concise project context string suitable for injecting into AI prompts.
    Accepts an already-scanned ctx to avoid double scanning.
    Set include_file_contents=True for chat to give AI access to actual code.
    """
    if ctx is None:
        try:
            ctx = scan_project(workspace_path)
        except Exception as e:
            return f"[Unable to scan project: {e}]"

    lines: list[str] = []

    # File tree (truncated)
    tree_lines = ctx["tree"].splitlines()
    if len(tree_lines) > max_tree_lines:
        tree_lines = tree_lines[:max_tree_lines] + [f"... ({len(tree_lines) - max_tree_lines} more lines)"]
    lines.append("## Project Structure")
    lines.append("```")
    lines.extend(tree_lines)
    lines.append("```")
    lines.append("")

    # Language breakdown
    if ctx["language_breakdown"]:
        lines.append("## Languages")
        for lang, count in sorted(ctx["language_breakdown"].items(), key=lambda x: -x[1]):
            lines.append(f"- {lang}: {count} files")
        lines.append("")

    # Dependencies
    if ctx["dependencies"]:
        lines.append("## Dependencies")
        for ecosystem, deps in ctx["dependencies"].items():
            lines.append(f"**{ecosystem.capitalize()}**: {', '.join(deps[:20])}")
        lines.append("")

    # README
    if ctx["readme"]:
        lines.append("## README")
        readme_preview = ctx["readme"][:2000]
        if len(ctx["readme"]) > 2000:
            readme_preview += "\n... (truncated)"
        lines.append(readme_preview)

    # File contents (for chat — gives AI real code to reason about)
    if include_file_contents:
        file_contents = _read_file_contents(workspace_path)
        if file_contents:
            lines.append("")
            lines.append("## File Contents")
            lines.append(file_contents)

    return "\n".join(lines)
