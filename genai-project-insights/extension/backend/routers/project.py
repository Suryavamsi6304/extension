from fastapi import APIRouter, HTTPException
from models.requests import ScanRequest
from models.responses import ProjectOverview
from services.scanner import scan_project
from services.context_builder import build_project_context
from providers.factory import get_provider

router = APIRouter()

PROJECT_SUMMARY_PROMPT = """You are a senior software architect. Analyze the project and produce a concise summary.

Format your response as:
## What this project does
(2-3 sentences)

## Tech stack
(bullet list)

## Key components
(bullet list of main files/modules and their purpose)

## Current development focus
(what seems to be actively worked on, based on structure)

Be specific and technical. No fluff."""


@router.post("/scan", response_model=ProjectOverview)
async def scan_and_summarize(req: ScanRequest):
    try:
        ctx = scan_project(req.workspace_path)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Path not found: {req.workspace_path}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Build context for AI
    project_context = build_project_context(req.workspace_path)

    try:
        provider = get_provider(req.provider, api_key=req.api_key)
        summary = await provider.complete(
            system_prompt=PROJECT_SUMMARY_PROMPT,
            user_message=f"Project path: {req.workspace_path}\n\n{project_context}",
        )
    except Exception as e:
        summary = f"(AI summary unavailable: {e})\n\nProject has {ctx['file_count']} code files."

    return ProjectOverview(
        summary=summary,
        tree=ctx["tree"],
        file_count=ctx["file_count"],
        language_breakdown=ctx["language_breakdown"],
        dependencies=ctx["dependencies"],
        readme_preview=ctx["readme"][:1500],
    )
