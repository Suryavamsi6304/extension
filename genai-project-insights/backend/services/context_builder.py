from .scanner import scan_project


def build_project_context(workspace_path: str, max_tree_lines: int = 100) -> str:
    """
    Build a concise project context string suitable for injecting into AI prompts.
    Keeps token count manageable while giving the model enough signal to reason.
    """
    try:
        ctx = scan_project(workspace_path)
    except Exception as e:
        return f"[Unable to scan project: {e}]"

    lines: list[str] = []

    # File tree (truncated)
    tree_lines = ctx["tree"].splitlines()
    if len(tree_lines) > max_tree_lines:
        tree_lines = tree_lines[:max_tree_lines] + [f"... ({len(tree_lines) - max_tree_lines} more lines)"]
    lines.append("## Project Structure")
    lines.append("```")
    lines.extend(tree_lines)
    lines.append("```")
    lines.append("")

    # Language breakdown
    if ctx["language_breakdown"]:
        lines.append("## Languages")
        for lang, count in sorted(ctx["language_breakdown"].items(), key=lambda x: -x[1]):
            lines.append(f"- {lang}: {count} files")
        lines.append("")

    # Dependencies
    if ctx["dependencies"]:
        lines.append("## Dependencies")
        for ecosystem, deps in ctx["dependencies"].items():
            lines.append(f"**{ecosystem.capitalize()}**: {', '.join(deps[:20])}")
        lines.append("")

    # README
    if ctx["readme"]:
        lines.append("## README")
        readme_preview = ctx["readme"][:2000]
        if len(ctx["readme"]) > 2000:
            readme_preview += "\n... (truncated)"
        lines.append(readme_preview)

    return "\n".join(lines)
