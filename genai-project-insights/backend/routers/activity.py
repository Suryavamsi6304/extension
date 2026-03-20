import asyncio
import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from services.watcher import file_watcher

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/recent")
async def get_recent_activity(limit: int = Query(50, ge=1, le=200)):
    items = file_watcher.get_recent(limit)
    return [item.to_dict() for item in items]


@router.post("/watch")
async def start_watching(workspace_path: str):
    loop = asyncio.get_running_loop()
    file_watcher.start(workspace_path, loop)
    return {"status": "watching", "path": workspace_path}


@router.websocket("/ws")
async def activity_websocket(websocket: WebSocket):
    await websocket.accept()

    queue: asyncio.Queue = asyncio.Queue()

    def on_activity(item):
        queue.put_nowait(item.to_dict())

    file_watcher.subscribe(on_activity)

    try:
        while True:
            try:
                item = await asyncio.wait_for(queue.get(), timeout=30.0)
                await websocket.send_text(json.dumps(item))
            except asyncio.TimeoutError:
                # Send heartbeat to keep connection alive
                await websocket.send_text(json.dumps({"type": "heartbeat"}))
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.warning("[activity_ws] error: %s", e)
    finally:
        file_watcher.unsubscribe(on_activity)
