import json
import logging
import logging.config
import traceback
import time
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import get_settings
from routers import project, explain, activity, chat, git, todos
from services.watcher import file_watcher


class JSONFormatter(logging.Formatter):
    """Emit one JSON object per log line — machine-parseable, grep-friendly."""

    def format(self, record: logging.LogRecord) -> str:
        entry: dict = {
            "time": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "router": record.name,
            "msg": record.getMessage(),
        }
        if record.exc_info and record.exc_info[1] is not None:
            entry["error"] = "".join(traceback.format_exception(*record.exc_info)).strip()
        return json.dumps(entry, default=str)


logging.config.dictConfig({
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "json": {"()": JSONFormatter},
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "json"}
    },
    "root": {"level": "INFO", "handlers": ["console"]},
})

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("[startup] GenAI Project Insights backend starting")

    # Validate every provider whose key is configured.
    # groq_api_key is required (no default) so it is always checked.
    # gemini and pluralsight are optional — only validated when a key is set.
    settings = get_settings()
    providers_to_check: list[tuple[str, str]] = [
        ("groq",        settings.groq_api_key),
        ("gemini",      settings.gemini_api_key),
        ("pluralsight", settings.pluralsight_api_key),
    ]
    for name, key in providers_to_check:
        if not key:
            continue  # optional provider not configured — skip
        try:
            from providers.factory import get_provider
            get_provider(name=name, api_key=key)
            logger.info("[startup] provider=%s validated OK", name)
        except ValueError as exc:
            logger.error("[startup] provider=%s validation FAILED: %s", name, exc)

    yield
    file_watcher.stop()
    logger.info("[shutdown] backend stopped")


app = FastAPI(
    title="GenAI Project Insights",
    description="AI-powered project analysis backend for the VS Code extension",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    # No exact-match origins — VS Code webviews each get a unique ID, so the
    # regex below is the only correct way to allow them.
    allow_origins=[],
    allow_origin_regex=r"vscode-webview://.*",
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    t0 = time.monotonic()
    response = await call_next(request)
    elapsed_ms = round((time.monotonic() - t0) * 1000)
    logger.info(
        "request method=%s path=%s status=%d latency_ms=%d",
        request.method, request.url.path, response.status_code, elapsed_ms,
    )
    return response


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error("Unhandled error on %s %s: %s", request.method, request.url.path, exc, exc_info=True)
    return JSONResponse(status_code=500, content={"error": "Internal server error"})


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
    settings = get_settings()
    return {
        "current": settings.ai_provider,
        "available": {
            "groq": bool(settings.groq_api_key),
            "gemini": bool(settings.gemini_api_key),
            "pluralsight": bool(settings.pluralsight_api_key),
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
