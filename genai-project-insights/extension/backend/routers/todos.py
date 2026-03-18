from fastapi import APIRouter
from models.requests import TodoRequest
from services.todo_service import find_todos

router = APIRouter()


@router.post("/scan")
async def scan_todos(req: TodoRequest):
    todos = find_todos(req.workspace_path)

    # Group by tag
    grouped: dict[str, list] = {}
    for item in todos:
        grouped.setdefault(item.tag, []).append({
            "tag": item.tag,
            "text": item.text,
            "file": item.file,
            "line": item.line,
            "context": item.context,
        })

    return {
        "total": len(todos),
        "by_tag": grouped,
        "all": [
            {
                "tag": t.tag,
                "text": t.text,
                "file": t.file,
                "line": t.line,
                "context": t.context,
            }
            for t in todos
        ],
    }
