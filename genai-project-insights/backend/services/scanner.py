import os
import json
from pathlib import Path
from typing import TypedDict

IGNORE_DIRS = {
    ".git", "__pycache__", "node_modules", ".venv", "venv", "env",
    "dist", "build", ".mypy_cache", ".pytest_cache", ".next", ".nuxt",
    "coverage", ".coverage", "htmlcov", ".tox",
}

CODE_EXTS = {
    ".py", ".ts", ".js", ".tsx", ".jsx", ".java", ".go", ".rs",
    ".cs", ".cpp", ".c", ".h", ".rb", ".php", ".swift", ".kt",
    ".scala", ".r", ".m", ".sh", ".bash", ".yaml", ".yml", ".toml",
}

LANG_NAMES = {
    ".py": "Python", ".ts": "TypeScript", ".js": "JavaScript",
    ".tsx": "TypeScript/React", ".jsx": "JavaScript/React",
    ".java": "Java", ".go": "Go", ".rs": "Rust", ".cs": "C#",
    ".cpp": "C++", ".c": "C", ".rb": "Ruby", ".php": "PHP",
    ".swift": "Swift", ".kt": "Kotlin",
}


class ProjectContext(TypedDict):
    tree: str
    readme: str
    dependencies: dict
    file_count: int
    language_breakdown: dict[str, int]
    root_path: str


def scan_project(root: str, max_depth: int = 6) -> ProjectContext:
    root_path = Path(root).resolve()
    tree_lines: list[str] = []
    lang_counts: dict[str, int] = {}
    file_count = 0

    for dirpath, dirnames, filenames in os.walk(root_path):
        # Prune ignored directories in place
        dirnames[:] = sorted(d for d in dirnames if d not in IGNORE_DIRS)

        rel = Path(dirpath).relative_to(root_path)
        depth = len(rel.parts)
        if depth > max_depth:
            dirnames.clear()
            continue

        indent = "  " * depth
        folder_name = rel.name if depth > 0 else root_path.name
        tree_lines.append(f"{indent}{folder_name}/")

        for fname in sorted(filenames):
            ext = Path(fname).suffix.lower()
            tree_lines.append(f"{indent}  {fname}")
            if ext in CODE_EXTS:
                lang_counts[ext] = lang_counts.get(ext, 0) + 1
                file_count += 1

    readme = _read_readme(root_path)
    deps = _parse_dependencies(root_path)

    return ProjectContext(
        tree="\n".join(tree_lines),
        readme=readme,
        dependencies=deps,
        file_count=file_count,
        language_breakdown={LANG_NAMES.get(k, k): v for k, v in lang_counts.items()},
        root_path=str(root_path),
    )


def _read_readme(root: Path) -> str:
    for name in ["README.md", "README.txt", "README.rst", "readme.md"]:
        p = root / name
        if p.exists():
            return p.read_text(encoding="utf-8", errors="replace")[:4000]
    return ""


def _parse_dependencies(root: Path) -> dict:
    deps: dict[str, list[str]] = {}

    # Python
    for req_file in ["requirements.txt", "requirements-dev.txt", "Pipfile"]:
        p = root / req_file
        if p.exists():
            lines = p.read_text(encoding="utf-8", errors="replace").splitlines()
            deps["python"] = [
                l.strip() for l in lines
                if l.strip() and not l.startswith("#") and not l.startswith("-")
            ][:50]
            break

    # Node
    pkg = root / "package.json"
    if pkg.exists():
        try:
            data = json.loads(pkg.read_text(encoding="utf-8"))
            all_deps = {
                **data.get("dependencies", {}),
                **data.get("devDependencies", {}),
            }
            deps["node"] = list(all_deps.keys())[:50]
        except json.JSONDecodeError:
            pass

    # Rust
    cargo = root / "Cargo.toml"
    if cargo.exists():
        lines = cargo.read_text(encoding="utf-8", errors="replace").splitlines()
        rust_deps = []
        in_deps = False
        for line in lines:
            if line.strip() == "[dependencies]":
                in_deps = True
            elif line.startswith("[") and in_deps:
                in_deps = False
            elif in_deps and "=" in line:
                rust_deps.append(line.split("=")[0].strip())
        if rust_deps:
            deps["rust"] = rust_deps[:50]

    # Go
    gomod = root / "go.mod"
    if gomod.exists():
        lines = gomod.read_text(encoding="utf-8", errors="replace").splitlines()
        go_deps = [l.strip().split()[0] for l in lines if l.startswith("\t") and "/" in l]
        if go_deps:
            deps["go"] = go_deps[:50]

    return deps
