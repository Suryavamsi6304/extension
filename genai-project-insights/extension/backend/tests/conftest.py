"""Shared fixtures for backend tests."""
import sys
import pathlib

# Ensure backend/ is on sys.path so imports like `from routers.chat import ...` work.
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))

import pytest
from unittest.mock import AsyncMock, MagicMock
from fastapi.testclient import TestClient
from main import app


@pytest.fixture()
def client():
    """Synchronous TestClient bound to the FastAPI app."""
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture()
def mock_provider():
    """A fake AIProvider that returns canned responses without network I/O."""
    provider = MagicMock()
    provider.model_name = "mock-model"
    provider.validate.return_value = None

    # Non-streaming completion
    provider.complete = AsyncMock(return_value="Mock AI response")

    # Streaming — yields a few tokens
    async def _fake_stream(system_prompt, user_message, history=None):
        for tok in ["Hello", " from", " mock"]:
            yield tok

    provider.stream_chat = _fake_stream
    return provider


@pytest.fixture()
def workspace(tmp_path):
    """A minimal workspace directory with a Python file."""
    (tmp_path / "main.py").write_text("# TODO: refactor this\nprint('hello')\n")
    (tmp_path / "utils.py").write_text("# FIXME: broken\ndef add(a, b): return a + b\n")
    return tmp_path
