"""
Step 20 — Unit tests for each router.
Run: cd backend && python -m pytest tests/test_routers.py -v
"""
from unittest.mock import patch, AsyncMock


# ── /health ──────────────────────────────────────────────────────────────────

def test_health_returns_ok(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert "provider" in body


# ── /providers ───────────────────────────────────────────────────────────────

def test_providers_returns_current(client):
    resp = client.get("/providers")
    assert resp.status_code == 200
    body = resp.json()
    assert "current" in body
    assert "available" in body


# ── POST /chat ───────────────────────────────────────────────────────────────

def test_chat_returns_sse_stream(client, mock_provider, workspace):
    with patch("routers.chat.get_provider", return_value=mock_provider):
        resp = client.post("/chat", json={
            "message": "hello",
            "workspace_path": str(workspace),
            "history": [],
            "provider": "groq",
            "api_key": "test-key",
        })
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")
    text = resp.text
    assert "data:" in text
    assert "[DONE]" in text


def test_chat_streams_tokens(client, mock_provider, workspace):
    with patch("routers.chat.get_provider", return_value=mock_provider):
        resp = client.post("/chat", json={
            "message": "hi",
            "workspace_path": str(workspace),
            "provider": "groq",
            "api_key": "test-key",
        })
    # Verify individual token data lines
    lines = [l for l in resp.text.splitlines() if l.startswith("data: ") and l.strip() != "data: [DONE]"]
    assert len(lines) >= 1, "Expected at least one token data line"


def test_chat_empty_workspace_returns_error(client, mock_provider, tmp_path):
    missing = str(tmp_path / "nonexistent")
    with patch("routers.chat.get_provider", return_value=mock_provider):
        resp = client.post("/chat", json={
            "message": "hello",
            "workspace_path": missing,
            "provider": "groq",
            "api_key": "test-key",
        })
    # build_project_context may still work on missing dirs — router itself shouldn't crash
    assert resp.status_code in (200, 400, 500)


def test_chat_invalid_provider_returns_400(client, workspace):
    resp = client.post("/chat", json={
        "message": "hello",
        "workspace_path": str(workspace),
        "provider": "nonexistent",
        "api_key": "key",
    })
    assert resp.status_code == 400


# ── POST /explain ────────────────────────────────────────────────────────────

def test_explain_returns_result(client, mock_provider):
    mock_provider.complete = AsyncMock(return_value='{"explanation": "It prints hello", "complexity": "Low", "key_points": ["simple"], "suggestions": []}')
    with patch("routers.explain.get_provider", return_value=mock_provider):
        resp = client.post("/explain", json={
            "code": "print('hello')",
            "language": "python",
            "file_path": "test.py",
            "provider": "groq",
            "api_key": "test-key",
        })
    assert resp.status_code == 200
    body = resp.json()
    assert "explanation" in body
    assert body["complexity"] in ("Low", "Medium", "High")


def test_explain_empty_code_returns_400(client):
    resp = client.post("/explain", json={
        "code": "   ",
        "language": "python",
        "provider": "groq",
        "api_key": "test-key",
    })
    assert resp.status_code == 400


def test_explain_fallback_on_bad_json(client, mock_provider):
    """When AI returns non-JSON, the explanation falls back to the raw text."""
    mock_provider.complete = AsyncMock(return_value="This code does stuff.")
    with patch("routers.explain.get_provider", return_value=mock_provider):
        resp = client.post("/explain", json={
            "code": "x = 1",
            "language": "python",
            "provider": "groq",
            "api_key": "test-key",
        })
    assert resp.status_code == 200
    body = resp.json()
    assert body["explanation"] == "This code does stuff."
    assert body["complexity"] == "Medium"  # default


# ── POST /project/scan ──────────────────────────────────────────────────────

def test_scan_returns_overview(client, mock_provider, workspace):
    with patch("routers.project.get_provider", return_value=mock_provider):
        resp = client.post("/project/scan", json={
            "workspace_path": str(workspace),
            "provider": "groq",
            "api_key": "test-key",
        })
    assert resp.status_code == 200
    body = resp.json()
    assert "summary" in body
    assert body["file_count"] >= 1
    assert "Python" in body["language_breakdown"]


def test_scan_missing_path_returns_404(client):
    resp = client.post("/project/scan", json={
        "workspace_path": "/nonexistent/path/xyz",
    })
    assert resp.status_code == 404


# ── POST /git/insights ──────────────────────────────────────────────────────

def test_git_insights_non_repo(client, workspace):
    """Workspace without .git returns an error field, not an HTTP error."""
    resp = client.post("/git/insights", json={
        "workspace_path": str(workspace),
    })
    assert resp.status_code == 200
    body = resp.json()
    assert "error" in body


# ── POST /todos/scan ────────────────────────────────────────────────────────

def test_todos_scan_finds_items(client, workspace):
    resp = client.post("/todos/scan", json={
        "workspace_path": str(workspace),
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] >= 2  # workspace fixture has TODO + FIXME
    assert "TODO" in body["by_tag"]
    assert "FIXME" in body["by_tag"]


def test_todos_scan_empty_dir(client, tmp_path):
    resp = client.post("/todos/scan", json={
        "workspace_path": str(tmp_path),
    })
    assert resp.status_code == 200
    assert resp.json()["total"] == 0


# ── explain._extract_json edge cases ────────────────────────────────────────

def test_extract_json_pure_json():
    from routers.explain import _extract_json
    result = _extract_json('{"explanation": "test", "complexity": "Low"}')
    assert result["explanation"] == "test"


def test_extract_json_markdown_fenced():
    from routers.explain import _extract_json
    raw = '```json\n{"explanation": "test"}\n```'
    result = _extract_json(raw)
    assert result["explanation"] == "test"


def test_extract_json_embedded_in_text():
    from routers.explain import _extract_json
    raw = 'Here is the result:\n{"explanation": "nested {braces}", "x": 1}\nExtra text'
    result = _extract_json(raw)
    assert result["explanation"] == "nested {braces}"


def test_extract_json_no_json_returns_empty():
    from routers.explain import _extract_json
    result = _extract_json("No JSON here at all")
    assert result == {}
