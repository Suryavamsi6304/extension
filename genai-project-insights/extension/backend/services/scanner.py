import os
import json
import logging
from pathlib import Path
from typing import TypedDict

logger = logging.getLogger(__name__)

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
    if not root_path.exists():
        raise FileNotFoundError(f"Workspace path does not exist: {root}")
    if not root_path.is_dir():
        raise NotADirectoryError(f"Workspace path is not a directory: {root}")
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
    _collect_python_deps(root, deps)
    _collect_node_deps(root, deps)
    _collect_rust_deps(root, deps)
    _collect_go_deps(root, deps)
    if not deps:
        logger.warning("[scanner] no dependency files found under %s", root)
    return deps


def _iter_files(root: Path, filename: str):
    """Yield all files named `filename` under root, skipping ignored dirs."""
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in IGNORE_DIRS]
        if filename in filenames:
            yield Path(dirpath) / filename


def _collect_python_deps(root: Path, deps: dict) -> None:
    python_pkgs: list[str] = []
    for candidate in ["requirements.txt", "requirements-dev.txt", "requirements-test.txt"]:
        for p in _iter_files(root, candidate):
            try:
                lines = p.read_text(encoding="utf-8", errors="replace").splitlines()
                python_pkgs += [
                    l.strip() for l in lines
                    if l.strip() and not l.startswith("#") and not l.startswith("-")
                ]
            except Exception as e:
                logger.warning("[scanner] failed to read %s: %s", p, e)
    # poetry.lock: extract package names from [[package]] blocks
    for p in _iter_files(root, "poetry.lock"):
        try:
            lines = p.read_text(encoding="utf-8", errors="replace").splitlines()
            for line in lines:
                if line.startswith("name = "):
                    python_pkgs.append(line.split("=", 1)[1].strip().strip('"'))
        except Exception as e:
            logger.warning("[scanner] failed to read %s: %s", p, e)
    # Pipfile
    for p in _iter_files(root, "Pipfile"):
        try:
            lines = p.read_text(encoding="utf-8", errors="replace").splitlines()
            in_section = False
            for line in lines:
                if line.strip() in ("[packages]", "[dev-packages]"):
                    in_section = True
                elif line.startswith("["):
                    in_section = False
                elif in_section and "=" in line:
                    python_pkgs.append(line.split("=")[0].strip())
        except Exception as e:
            logger.warning("[scanner] failed to read %s: %s", p, e)
    seen: set[str] = set()
    unique = [x for x in python_pkgs if x not in seen and not seen.add(x)]  # type: ignore[func-returns-value]
    if unique:
        deps["python"] = unique[:50]


def _collect_node_deps(root: Path, deps: dict) -> None:
    node_pkgs: list[str] = []
    for p in _iter_files(root, "package.json"):
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            # Skip workspace root package.json that only has workspaces key
            all_deps = {
                **data.get("dependencies", {}),
                **data.get("devDependencies", {}),
                **data.get("peerDependencies", {}),
            }
            node_pkgs += list(all_deps.keys())
        except Exception as e:
            logger.warning("[scanner] failed to read %s: %s", p, e)
    seen: set[str] = set()
    unique = [x for x in node_pkgs if x not in seen and not seen.add(x)]  # type: ignore[func-returns-value]
    if unique:
        deps["node"] = unique[:50]


def _collect_rust_deps(root: Path, deps: dict) -> None:
    rust_pkgs: list[str] = []
    for p in _iter_files(root, "Cargo.toml"):
        try:
            lines = p.read_text(encoding="utf-8", errors="replace").splitlines()
            in_deps = False
            for line in lines:
                stripped = line.strip()
                if stripped in ("[dependencies]", "[dev-dependencies]", "[build-dependencies]"):
                    in_deps = True
                elif stripped.startswith("[") and in_deps:
                    in_deps = False
                elif in_deps and "=" in stripped and not stripped.startswith("#"):
                    rust_pkgs.append(stripped.split("=")[0].strip())
        except Exception as e:
            logger.warning("[scanner] failed to read %s: %s", p, e)
    seen: set[str] = set()
    unique = [x for x in rust_pkgs if x not in seen and not seen.add(x)]  # type: ignore[func-returns-value]
    if unique:
        deps["rust"] = unique[:50]


def _collect_go_deps(root: Path, deps: dict) -> None:
    go_pkgs: list[str] = []
    for p in _iter_files(root, "go.mod"):
        try:
            lines = p.read_text(encoding="utf-8", errors="replace").splitlines()
            for line in lines:
                stripped = line.strip()
                if stripped.startswith("require ") and "/" in stripped:
                    go_pkgs.append(stripped.split()[1])
                elif line.startswith("\t") and "/" in line:
                    go_pkgs.append(stripped.split()[0])
        except Exception as e:
            logger.warning("[scanner] failed to read %s: %s", p, e)
    seen: set[str] = set()
    unique = [x for x in go_pkgs if x not in seen and not seen.add(x)]  # type: ignore[func-returns-value]
    if unique:
        deps["go"] = unique[:50]
