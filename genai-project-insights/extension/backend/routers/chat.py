import json
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from models.requests import ChatRequest, MAX_CONTEXT_CHARS
from providers.factory import get_provider
from services.context_builder import build_project_context

router = APIRouter()

CHAT_SYSTEM_TEMPLATE = """You are an expert project analyst and coding assistant for a GenAI developer.

You are analyzing the project at: {workspace_path}

PROJECT CONTEXT:
{context}

Guidelines:
- Answer questions accurately and specifically about THIS project
- Reference specific files and line numbers when relevant
- Explain code patterns in the context of GenAI/ML development
- Be concise but complete
- If asked to explain a file, describe its role in the larger project
- If you don't know something about the project, say so rather than guessing"""


@router.post("")
async def chat(request: Request, req: ChatRequest):
    try:
        context = build_project_context(req.workspace_path, include_file_contents=True)
        context = context[:MAX_CONTEXT_CHARS]
        provider = get_provider(req.provider, api_key=req.api_key)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Setup error: {e}")

    system_prompt = (
        CHAT_SYSTEM_TEMPLATE
        .replace("{workspace_path}", req.workspace_path)
        .replace("{context}", context)
    )

    history = [{"role": m.role, "content": m.content} for m in req.history]

    async def event_generator():
        try:
            async for token in provider.stream_chat(
                system_prompt=system_prompt,
                user_message=req.message,
                history=history,
            ):
                if await request.is_disconnected():
                    break  # client closed — stop generating, save tokens
                yield f"data: {json.dumps({'token': token})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        finally:
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
