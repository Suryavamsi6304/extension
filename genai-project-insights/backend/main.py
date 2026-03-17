import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from routers import project, explain, activity, chat, git, todos
from services.watcher import file_watcher


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: nothing blocking
    yield
    # Shutdown: stop file watcher
    file_watcher.stop()


app = FastAPI(
    title="GenAI Project Insights",
    description="AI-powered project analysis backend for the VS Code extension",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow VS Code webviews and localhost dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "vscode-webview://*",
        "http://localhost:*",
        "http://127.0.0.1:*",
    ],
    allow_origin_regex=r"vscode-webview://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(project.router,  prefix="/project",  tags=["Project"])
app.include_router(explain.router,  prefix="/explain",  tags=["Explain"])
app.include_router(activity.router, prefix="/activity", tags=["Activity"])
app.include_router(chat.router,     prefix="/chat",     tags=["Chat"])
app.include_router(git.router,      prefix="/git",      tags=["Git"])
app.include_router(todos.router,    prefix="/todos",    tags=["TODOs"])


@app.get("/health", tags=["Health"])
async def health():
    settings = get_settings()
    return {
        "status": "ok",
        "version": "1.0.0",
        "provider": settings.ai_provider,
        "watching": file_watcher.watched_path,
    }


@app.get("/providers", tags=["Config"])
async def list_providers():
    """List available providers and which ones have keys configured."""
    settings = get_settings()
    return {
        "current": settings.ai_provider,
        "available": {
            "anthropic": bool(settings.anthropic_api_key),
            "openai": bool(settings.openai_api_key),
            "gemini": bool(settings.gemini_api_key),
            "ollama": True,  # No key needed
        },
    }


if __name__ == "__main__":
    import uvicorn
    settings = get_settings()
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=settings.backend_port,
        reload=False,
        log_level="info",
    )
