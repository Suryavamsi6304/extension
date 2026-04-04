import json
import logging
import re
from fastapi import APIRouter, HTTPException
from models.requests import ExplainRequest
from models.responses import ExplainResult
from providers.factory import get_provider

logger = logging.getLogger(__name__)

router = APIRouter()

EXPLAIN_SYSTEM_PROMPT = """You are an expert code analyst specializing in explaining code to GenAI developers.

Analyze the provided code and respond in this exact JSON format:
{
  "explanation": "Clear explanation of what this code does (2-4 paragraphs)",
  "complexity": "Low|Medium|High",
  "key_points": ["Point 1", "Point 2", "Point 3"],
  "suggestions": ["Suggestion 1", "Suggestion 2"]
}

Be precise and technical. Focus on:
- What the code does and why
- Design patterns used
- Potential issues or improvements
- How it fits in a typical GenAI/ML codebase"""


@router.post("", response_model=ExplainResult)
async def explain_code(req: ExplainRequest):
    if not req.code.strip():
        raise HTTPException(status_code=400, detail="Code cannot be empty")

    user_message = f"""Language: {req.language}
File: {req.file_path or 'unknown'}

Code to explain:
```{req.language}
{req.code}
```"""

    try:
        provider = get_provider(req.provider, api_key=req.api_key)
        raw = await provider.complete(
            system_prompt=EXPLAIN_SYSTEM_PROMPT,
            user_message=user_message,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI provider error: {e}")

    data = _extract_json(raw)
    return ExplainResult(
        explanation=data.get("explanation", raw),
        complexity=data.get("complexity", "Medium"),
        key_points=data.get("key_points", []),
        suggestions=data.get("suggestions", []),
    )


def _extract_json(raw: str) -> dict:
    """Extract a JSON object from raw text using bracket-counting (handles nested objects)."""
    # First try: direct parse (AI returned pure JSON)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    # Second try: strip markdown code fences then parse
    stripped = re.sub(r"```(?:json)?\n?", "", raw).strip()
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        pass

    # Third try: find the outermost {...} using bracket counting
    start = raw.find("{")
    if start == -1:
        return {}
    depth = 0
    for i, ch in enumerate(raw[start:], start):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(raw[start : i + 1])
                except json.JSONDecodeError:
                    break
    return {}
