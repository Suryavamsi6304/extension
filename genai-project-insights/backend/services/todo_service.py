import re
from pathlib import Path
from dataclasses import dataclass

PATTERN = re.compile(r"\b(TODO|FIXME|HACK|BUG|NOTE|XXX)\b[:\s]*(.*)", re.IGNORECASE)

CODE_EXTS = {
    ".py", ".ts", ".js", ".tsx", ".jsx", ".java", ".go", ".rs",
    ".cs", ".cpp", ".c", ".h", ".rb", ".php", ".swift", ".kt",
    ".scala", ".sh", ".bash",
}

IGNORE_DIRS = {
    "node_modules", ".git", "__pycache__", ".venv", "venv",
    "dist", "build", ".next", "coverage",
}


@dataclass
class TodoItem:
    tag: str          # TODO | FIXME | HACK | BUG | NOTE | XXX
    text: str
    file: str         # relative to workspace root
    line: int
    context: str      # surrounding lines for AI explanation


def find_todos(workspace_path: str) -> list[TodoItem]:
    todos: list[TodoItem] = []
    root = Path(workspace_path).resolve()

    for path in root.rglob("*"):
        # Skip ignored directories
        if any(p in path.parts for p in IGNORE_DIRS):
            continue
        if not path.is_file():
            continue
        if path.suffix.lower() not in CODE_EXTS:
            continue

        try:
            lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        except Exception:
            continue

        for i, line in enumerate(lines):
            m = PATTERN.search(line)
            if m:
                ctx_start = max(0, i - 1)
                ctx_end = min(len(lines), i + 3)
                try:
                    rel_path = str(path.relative_to(root))
                except ValueError:
                    rel_path = str(path)

                todos.append(TodoItem(
                    tag=m.group(1).upper(),
                    text=m.group(2).strip(),
                    file=rel_path,
                    line=i + 1,
                    context="\n".join(lines[ctx_start:ctx_end]),
                ))

    return todos
