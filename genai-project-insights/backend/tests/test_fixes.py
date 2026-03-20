"""
Minimal tests for the fixed issues.
Run from backend/: python -m pytest tests/ -v
"""
import os
import sys
import ast
import json
import pathlib
import pytest
from datetime import timezone

sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))


# ── watcher.py: timezone-aware UTC timestamp ──────────────────────────────────

def test_activity_item_timestamp_is_utc():
    from services.watcher import ActivityItem
    from datetime import datetime
    item = ActivityItem(event_type="modified", path="/some/file.py")
    dt = datetime.fromisoformat(item.timestamp)
    assert dt.tzinfo is not None, "timestamp must be timezone-aware"
    assert dt.utcoffset().total_seconds() == 0, "timestamp must be UTC"


# ── scanner.py: FileNotFoundError on bad path ─────────────────────────────────

def test_scan_project_raises_on_missing_path():
    from services.scanner import scan_project
    with pytest.raises(FileNotFoundError, match="does not exist"):
        scan_project("/nonexistent/path/xyz_does_not_exist")


def test_scan_project_raises_on_file_not_dir(tmp_path):
    from services.scanner import scan_project
    f = tmp_path / "file.txt"
    f.write_text("hello")
    with pytest.raises(NotADirectoryError):
        scan_project(str(f))


def test_scan_project_valid_dir(tmp_path):
    from services.scanner import scan_project
    (tmp_path / "main.py").write_text("print('hello')")
    ctx = scan_project(str(tmp_path))
    assert ctx["file_count"] == 1
    assert "Python" in ctx["language_breakdown"]


# ── scanner.py: dependency parsing non-zero ───────────────────────────────────

def test_deps_python_requirements(tmp_path):
    from services.scanner import scan_project
    (tmp_path / "requirements.txt").write_text("fastapi>=0.110.0\nuvicorn\n# comment\n")
    ctx = scan_project(str(tmp_path))
    assert "python" in ctx["dependencies"]
    assert len(ctx["dependencies"]["python"]) == 2


def test_deps_node_package_json(tmp_path):
    from services.scanner import scan_project
    pkg = {"dependencies": {"express": "^4.18.0"}, "devDependencies": {"typescript": "^5.0.0"}}
    (tmp_path / "package.json").write_text(json.dumps(pkg))
    ctx = scan_project(str(tmp_path))
    assert "node" in ctx["dependencies"]
    assert "express" in ctx["dependencies"]["node"]
    assert "typescript" in ctx["dependencies"]["node"]


def test_deps_monorepo_nested_package_json(tmp_path):
    """Nested packages/ dir — both package.json files should be found."""
    from services.scanner import scan_project
    pkg_a = tmp_path / "packages" / "app-a"
    pkg_a.mkdir(parents=True)
    (pkg_a / "package.json").write_text(json.dumps({"dependencies": {"lodash": "^4.0.0"}}))
    pkg_b = tmp_path / "packages" / "app-b"
    pkg_b.mkdir(parents=True)
    (pkg_b / "package.json").write_text(json.dumps({"dependencies": {"axios": "^1.0.0"}}))
    ctx = scan_project(str(tmp_path))
    assert "node" in ctx["dependencies"]
    assert "lodash" in ctx["dependencies"]["node"]
    assert "axios" in ctx["dependencies"]["node"]


def test_deps_rust_cargo_toml(tmp_path):
    from services.scanner import scan_project
    cargo = "[package]\nname = \"myapp\"\n\n[dependencies]\nserde = \"1.0\"\ntokio = { version = \"1\", features = [\"full\"] }\n"
    (tmp_path / "Cargo.toml").write_text(cargo)
    ctx = scan_project(str(tmp_path))
    assert "rust" in ctx["dependencies"]
    assert "serde" in ctx["dependencies"]["rust"]
    assert "tokio" in ctx["dependencies"]["rust"]


def test_deps_no_files_returns_empty_not_raises(tmp_path):
    """No dep files → empty dict, no exception."""
    from services.scanner import scan_project
    (tmp_path / "main.py").write_text("x = 1")
    ctx = scan_project(str(tmp_path))
    assert ctx["dependencies"] == {}


# ── context_builder.py: limits respected ─────────────────────────────────────

def test_read_file_contents_respects_max_files(tmp_path):
    from services.context_builder import _read_file_contents, MAX_FILES
    for i in range(MAX_FILES + 5):
        (tmp_path / f"file_{i}.py").write_text(f"# file {i}")
    result = _read_file_contents(str(tmp_path))
    assert result.count("### ") <= MAX_FILES


def test_read_file_contents_respects_max_total(tmp_path):
    from services.context_builder import _read_file_contents, MAX_TOTAL_CONTENT
    for i in range(10):
        (tmp_path / f"big_{i}.py").write_text("x" * 9_000)
    result = _read_file_contents(str(tmp_path))
    assert len(result) <= MAX_TOTAL_CONTENT + (MAX_TOTAL_CONTENT * 0.1)


# ── chat.py: safe templating with braces in context ──────────────────────────

def test_chat_template_safe_with_braces():
    from routers.chat import CHAT_SYSTEM_TEMPLATE
    context_with_braces = "def foo(): return {'key': 'value'}"
    workspace = "/some/path"
    result = (
        CHAT_SYSTEM_TEMPLATE
        .replace("{workspace_path}", workspace)
        .replace("{context}", context_with_braces)
    )
    assert workspace in result
    assert "key" in result


# ── explain.py: code input capped at MAX_CODE_CHARS ──────────────────────────

def test_explain_max_code_chars():
    from routers.explain import MAX_CODE_CHARS
    large_code = "x = 1\n" * 10_000
    assert len(large_code[:MAX_CODE_CHARS]) == MAX_CODE_CHARS


# ── requests.py: no typing.List import ───────────────────────────────────────

def test_requests_no_typing_list():
    src = (pathlib.Path(__file__).parent.parent / "models" / "requests.py").read_text()
    tree = ast.parse(src)
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module == "typing":
            names = [a.name for a in node.names]
            assert "List" not in names, "typing.List must not be imported in requests.py"
