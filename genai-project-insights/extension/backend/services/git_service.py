import logging
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)

try:
    from git import Repo, InvalidGitRepositoryError
    GIT_AVAILABLE = True
except ImportError:
    GIT_AVAILABLE = False


@dataclass
class CommitInfo:
    hash: str
    author: str
    date: str
    message: str
    files_changed: list[str]


def get_git_insights(workspace_path: str, max_commits: int = 20) -> dict:
    if not GIT_AVAILABLE:
        return {"error": "GitPython not installed. Run: pip install gitpython"}

    try:
        repo = Repo(workspace_path, search_parent_directories=True)
    except InvalidGitRepositoryError:
        return {"error": "Not a git repository"}
    except Exception as e:
        return {"error": str(e)}

    commits = []
    try:
        for commit in list(repo.iter_commits(max_count=max_commits)):
            changed = []
            if commit.parents:
                try:
                    diff = commit.parents[0].diff(commit)
                    changed = [d.a_path or d.b_path for d in diff if d.a_path or d.b_path]
                except Exception as e:
                    logger.debug("[git] diff error commit=%s: %s", commit.hexsha[:7], e)
            commits.append(CommitInfo(
                hash=commit.hexsha[:7],
                author=str(commit.author.name),
                date=commit.committed_datetime.isoformat(),
                message=commit.message.strip(),
                files_changed=changed[:10],
            ))
    except Exception as e:
        logger.warning("[git] iter_commits error: %s", e)
        commits = []

    try:
        branch = repo.active_branch.name
    except TypeError:
        branch = "detached HEAD"
    except Exception:
        branch = "unknown"

    try:
        dirty_files = [item.a_path for item in repo.index.diff(None)]
        dirty_files += [f for f in repo.untracked_files]
    except Exception as e:
        logger.warning("[git] dirty_files error: %s", e)
        dirty_files = []

    return {
        "branch": branch,
        "commits": [
            {
                "hash": c.hash,
                "author": c.author,
                "date": c.date,
                "message": c.message,
                "files_changed": c.files_changed,
            }
            for c in commits
        ],
        "uncommitted_changes": dirty_files[:20],
        "total_commits_scanned": len(commits),
    }
