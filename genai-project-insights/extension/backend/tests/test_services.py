"""
Step 21 — Test git_service.py and todo_service.py with fixture repos.
Uses tmp_path to create isolated repos — never touches the real project repo.

Run: cd backend && python -m pytest tests/test_services.py -v
"""
import subprocess
from pathlib import Path

import pytest


# ═══════════════════════════════════════════════════════════════════════════════
# Fixtures
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.fixture()
def git_repo(tmp_path: Path):
    """Create a small fixture git repo with two commits."""
    subprocess.run(["git", "init"], cwd=tmp_path, capture_output=True, check=True)
    subprocess.run(["git", "config", "user.email", "test@test.com"], cwd=tmp_path, capture_output=True, check=True)
    subprocess.run(["git", "config", "user.name", "Test User"], cwd=tmp_path, capture_output=True, check=True)

    # First commit
    f1 = tmp_path / "main.py"
    f1.write_text("print('hello')\n")
    subprocess.run(["git", "add", "main.py"], cwd=tmp_path, capture_output=True, check=True)
    subprocess.run(["git", "commit", "-m", "Initial commit"], cwd=tmp_path, capture_output=True, check=True)

    # Second commit
    f2 = tmp_path / "utils.py"
    f2.write_text("def add(a, b): return a + b\n")
    subprocess.run(["git", "add", "utils.py"], cwd=tmp_path, capture_output=True, check=True)
    subprocess.run(["git", "commit", "-m", "Add utils module"], cwd=tmp_path, capture_output=True, check=True)

    return tmp_path


@pytest.fixture()
def git_repo_with_uncommitted(git_repo: Path):
    """A git repo with an uncommitted file."""
    (git_repo / "dirty.py").write_text("# work in progress\n")
    return git_repo


@pytest.fixture()
def todo_workspace(tmp_path: Path):
    """Workspace with various TODO markers in different file types."""
    (tmp_path / "app.py").write_text(
        "def main():\n"
        "    # TODO: add logging\n"
        "    pass\n"
    )
    (tmp_path / "handler.ts").write_text(
        "function handle() {\n"
        "  // FIXME: handle edge case\n"
        "  // HACK: temporary workaround\n"
        "  return true;\n"
        "}\n"
    )
    (tmp_path / "notes.md").write_text("TODO: this should be ignored (not a code file)\n")
    # Nested inside an ignored directory — should be skipped
    nm = tmp_path / "node_modules" / "pkg"
    nm.mkdir(parents=True)
    (nm / "index.js").write_text("// TODO: should be ignored\n")
    return tmp_path


# ═══════════════════════════════════════════════════════════════════════════════
# git_service tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestGetGitInsights:
    def test_returns_commits(self, git_repo):
        from services.git_service import get_git_insights
        data = get_git_insights(str(git_repo))
        assert "error" not in data or not data.get("error")
        assert len(data["commits"]) == 2
        assert data["commits"][0]["message"] == "Add utils module"
        assert data["commits"][1]["message"] == "Initial commit"

    def test_branch_name(self, git_repo):
        from services.git_service import get_git_insights
        data = get_git_insights(str(git_repo))
        # Default branch could be main or master depending on git config
        assert data["branch"] in ("main", "master")

    def test_files_changed_in_commits(self, git_repo):
        from services.git_service import get_git_insights
        data = get_git_insights(str(git_repo))
        latest = data["commits"][0]
        assert "utils.py" in latest["files_changed"]

    def test_uncommitted_changes(self, git_repo_with_uncommitted):
        from services.git_service import get_git_insights
        data = get_git_insights(str(git_repo_with_uncommitted))
        assert "dirty.py" in data["uncommitted_changes"]

    def test_max_commits_respected(self, git_repo):
        from services.git_service import get_git_insights
        data = get_git_insights(str(git_repo), max_commits=1)
        assert len(data["commits"]) == 1

    def test_not_a_git_repo(self, tmp_path):
        from services.git_service import get_git_insights
        data = get_git_insights(str(tmp_path))
        assert data["error"] == "Not a git repository"

    def test_nonexistent_path(self):
        from services.git_service import get_git_insights
        data = get_git_insights("/nonexistent/xyz_fake_path")
        assert "error" in data and data["error"]

    def test_commit_fields_present(self, git_repo):
        from services.git_service import get_git_insights
        data = get_git_insights(str(git_repo))
        commit = data["commits"][0]
        assert "hash" in commit
        assert "author" in commit
        assert "date" in commit
        assert "message" in commit
        assert "files_changed" in commit
        assert commit["author"] == "Test User"


# ═══════════════════════════════════════════════════════════════════════════════
# todo_service tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestFindTodos:
    def test_finds_all_tags(self, todo_workspace):
        from services.todo_service import find_todos
        todos = find_todos(str(todo_workspace))
        tags = {t.tag for t in todos}
        assert "TODO" in tags
        assert "FIXME" in tags
        assert "HACK" in tags

    def test_correct_count(self, todo_workspace):
        from services.todo_service import find_todos
        todos = find_todos(str(todo_workspace))
        # app.py:1 TODO, handler.ts:1 FIXME + 1 HACK = 3 total
        assert len(todos) == 3

    def test_ignores_non_code_files(self, todo_workspace):
        from services.todo_service import find_todos
        todos = find_todos(str(todo_workspace))
        files = {t.file for t in todos}
        assert not any("notes.md" in f for f in files)

    def test_ignores_node_modules(self, todo_workspace):
        from services.todo_service import find_todos
        todos = find_todos(str(todo_workspace))
        files = {t.file for t in todos}
        assert not any("node_modules" in f for f in files)

    def test_line_numbers_correct(self, todo_workspace):
        from services.todo_service import find_todos
        todos = find_todos(str(todo_workspace))
        py_todo = next(t for t in todos if t.tag == "TODO" and "app.py" in t.file)
        assert py_todo.line == 2  # "# TODO: add logging" is line 2

    def test_text_extraction(self, todo_workspace):
        from services.todo_service import find_todos
        todos = find_todos(str(todo_workspace))
        py_todo = next(t for t in todos if t.tag == "TODO" and "app.py" in t.file)
        assert py_todo.text == "add logging"

    def test_relative_paths(self, todo_workspace):
        from services.todo_service import find_todos
        todos = find_todos(str(todo_workspace))
        for t in todos:
            assert not Path(t.file).is_absolute(), f"Path should be relative: {t.file}"

    def test_context_includes_surrounding_lines(self, todo_workspace):
        from services.todo_service import find_todos
        todos = find_todos(str(todo_workspace))
        py_todo = next(t for t in todos if t.tag == "TODO" and "app.py" in t.file)
        assert "def main" in py_todo.context
        assert "pass" in py_todo.context

    def test_empty_workspace(self, tmp_path):
        from services.todo_service import find_todos
        todos = find_todos(str(tmp_path))
        assert todos == []

    def test_case_insensitive_tags(self, tmp_path):
        """Tags should be uppercased regardless of source case."""
        from services.todo_service import find_todos
        (tmp_path / "test.py").write_text("# todo: lowercase tag\n# Fixme: mixed case\n")
        todos = find_todos(str(tmp_path))
        assert all(t.tag == t.tag.upper() for t in todos)
        tags = {t.tag for t in todos}
        assert "TODO" in tags
        assert "FIXME" in tags
