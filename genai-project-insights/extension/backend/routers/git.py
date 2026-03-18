from fastapi import APIRouter, HTTPException
from models.requests import GitRequest
from services.git_service import get_git_insights
from providers.factory import get_provider

router = APIRouter()

GIT_SUMMARY_PROMPT = """You are a senior engineer reviewing recent git activity.

Given the commit history below, provide:
1. A 2-3 sentence summary of what the team has been working on recently
2. What seems to be the current development focus
3. Any patterns you notice (e.g., bug fixing sprint, feature development, refactoring)
4. What logical next steps might be based on the commit messages

Be concise and insightful. No fluff."""


@router.post("/insights")
async def git_insights(req: GitRequest):
    data = get_git_insights(req.workspace_path, req.max_commits)

    if "error" in data and data["error"]:
        return data

    # Generate AI summary of commits
    ai_summary = ""
    if data.get("commits"):
        commit_text = "\n".join([
            f"- [{c['hash']}] {c['message']} (by {c['author']}, {c['date'][:10]})"
            for c in data["commits"][:15]
        ])
        uncommitted = data.get("uncommitted_changes", [])
        user_msg = f"""Branch: {data['branch']}
Uncommitted files: {', '.join(uncommitted[:5]) or 'none'}

Recent commits:
{commit_text}"""

        try:
            provider = get_provider(req.provider, api_key=req.api_key)
            ai_summary = await provider.complete(
                system_prompt=GIT_SUMMARY_PROMPT,
                user_message=user_msg,
            )
        except Exception as e:
            ai_summary = f"(AI summary unavailable: {e})"

    data["ai_summary"] = ai_summary
    return data
