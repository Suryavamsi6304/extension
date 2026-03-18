import asyncio
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler, FileSystemEvent

IGNORE_PATHS = {".git", "__pycache__", ".pyc", "node_modules", ".venv", "dist", "build"}


@dataclass
class ActivityItem:
    event_type: str   # created | modified | deleted | moved
    path: str
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())

    def to_dict(self) -> dict:
        return {
            "event_type": self.event_type,
            "path": self.path,
            "timestamp": self.timestamp,
        }


class _EventHandler(FileSystemEventHandler):
    def __init__(self, queue: deque, loop: asyncio.AbstractEventLoop):
        super().__init__()
        self._queue = queue
        self._loop = loop
        self._ws_callbacks: list = []

    def _should_ignore(self, path: str) -> bool:
        return any(p in path for p in IGNORE_PATHS)

    def on_any_event(self, event: FileSystemEvent):
        if event.is_directory:
            return
        if self._should_ignore(str(event.src_path)):
            return

        item = ActivityItem(
            event_type=event.event_type,
            path=str(event.src_path),
        )
        self._queue.append(item)

        # Notify WebSocket subscribers on the event loop
        for callback in list(self._ws_callbacks):
            try:
                self._loop.call_soon_threadsafe(callback, item)
            except Exception:
                pass

    def add_ws_callback(self, cb) -> None:
        self._ws_callbacks.append(cb)

    def remove_ws_callback(self, cb) -> None:
        self._ws_callbacks.discard(cb) if hasattr(self._ws_callbacks, 'discard') else None
        if cb in self._ws_callbacks:
            self._ws_callbacks.remove(cb)


class FileWatcher:
    def __init__(self, maxlen: int = 300):
        self._recent: deque[ActivityItem] = deque(maxlen=maxlen)
        self._observer: Observer | None = None
        self._handler: _EventHandler | None = None
        self._watched_path: str | None = None

    def start(self, workspace_path: str, loop: asyncio.AbstractEventLoop) -> None:
        if self._observer and self._observer.is_alive():
            self._observer.stop()
            self._observer.join()

        self._handler = _EventHandler(self._recent, loop)
        self._observer = Observer()
        self._observer.schedule(self._handler, workspace_path, recursive=True)
        self._observer.start()
        self._watched_path = workspace_path

    def get_recent(self, limit: int = 50) -> list[ActivityItem]:
        return list(self._recent)[-limit:]

    def subscribe(self, callback) -> None:
        if self._handler:
            self._handler.add_ws_callback(callback)

    def unsubscribe(self, callback) -> None:
        if self._handler:
            self._handler.remove_ws_callback(callback)

    def stop(self) -> None:
        if self._observer and self._observer.is_alive():
            self._observer.stop()
            self._observer.join()

    @property
    def watched_path(self) -> str | None:
        return self._watched_path


# Module-level singleton
file_watcher = FileWatcher()
