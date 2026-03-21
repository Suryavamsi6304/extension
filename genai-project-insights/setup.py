#!/usr/bin/env python3
"""
Setup script for GenAI Project Insights.
Run: python setup.py

This script:
  1. Checks Python version
  2. Creates/uses a virtualenv in backend/.venv
  3. Syncs backend/ -> extension/backend/ (single source of truth)
  4. Clears __pycache__ in both backend dirs to prevent stale bytecode
  5. Installs Python dependencies into the virtualenv
  6. Sets up .env (first-time only — never overwrites an existing one)
  7. Installs Node dependencies and compiles TypeScript
"""
import subprocess
import sys
import shutil
from pathlib import Path

SYNC_IGNORE = {
    ".env", ".env.example",
    "__pycache__", ".mypy_cache", ".pytest_cache",
    ".venv", "venv",
}


def run(cmd: list, cwd: str | None = None) -> bool:
    """Run a command, print it, and return True on success (never raises)."""
    print(f"  > {' '.join(str(c) for c in cmd)}")
    result = subprocess.run(cmd, cwd=cwd, capture_output=False)
    return result.returncode == 0


def _files_differ(a: Path, b: Path) -> bool:
    """Fast diff: size first, then byte-level only when sizes match."""
    if a.stat().st_size != b.stat().st_size:
        return True
    return a.read_bytes() != b.read_bytes()


def sync_backend(src: Path, dst: Path) -> None:
    """
    Mirror src into dst, skipping .env and cache dirs.
    Removes files and orphan directories in dst that no longer exist in src.
    """
    dst.mkdir(parents=True, exist_ok=True)

    # Copy new / updated files from src -> dst
    for item in src.rglob("*"):
        if any(part in SYNC_IGNORE for part in item.parts):
            continue
        rel = item.relative_to(src)
        target = dst / rel
        if item.is_dir():
            target.mkdir(parents=True, exist_ok=True)
        else:
            if not target.exists() or _files_differ(item, target):
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(item, target)
                print(f"    synced: {rel}")

    # Remove files/dirs in dst that no longer exist in src.
    # Sort deepest-first so child entries are removed before parents.
    for item in sorted(dst.rglob("*"), key=lambda p: len(p.parts), reverse=True):
        if any(part in SYNC_IGNORE for part in item.parts):
            continue
        rel = item.relative_to(dst)
        if not (src / rel).exists():
            if item.is_file():
                item.unlink()
                print(f"    removed: {rel}")
            elif item.is_dir():
                shutil.rmtree(item, ignore_errors=True)
                print(f"    removed dir: {rel}")


def clear_pycache(directory: Path) -> None:
    """Remove all __pycache__ dirs and .pyc files to prevent stale bytecode."""
    count = 0
    for cache_dir in directory.rglob("__pycache__"):
        if cache_dir.is_dir():
            shutil.rmtree(cache_dir)
            count += 1
    for pyc in directory.rglob("*.pyc"):
        pyc.unlink()
        count += 1
    if count:
        print(f"    cleared {count} pycache entries in {directory.name}/")


def ensure_venv(backend_dir: Path) -> Path:
    """Create .venv in backend_dir if it does not exist. Return path to its Python."""
    venv_dir = backend_dir / ".venv"
    if not venv_dir.exists():
        print("  Creating virtualenv...")
        subprocess.run([sys.executable, "-m", "venv", str(venv_dir)], check=True)
    venv_python = (
        venv_dir / "Scripts" / "python.exe"
        if sys.platform == "win32"
        else venv_dir / "bin" / "python"
    )
    return venv_python


def main():
    root = Path(__file__).parent
    backend_dir     = root / "backend"
    ext_backend_dir = root / "extension" / "backend"
    ext_dir         = root / "extension"

    print("\n=== GenAI Project Insights - Setup ===\n")

    # 1. Check Python version
    print("[1/7] Checking Python version...")
    py_ver = sys.version_info
    if py_ver < (3, 10):
        print(f"  ERROR: Python 3.10+ required, found {py_ver.major}.{py_ver.minor}")
        sys.exit(1)
    print(f"  OK: Python {py_ver.major}.{py_ver.minor}.{py_ver.micro}")

    # 2. Ensure virtualenv
    print("\n[2/7] Setting up virtualenv in backend/.venv ...")
    venv_python = ensure_venv(backend_dir)
    print(f"  OK: {venv_python}")

    # 3. Sync backend/ -> extension/backend/
    print("\n[3/7] Syncing backend/ -> extension/backend/ ...")
    sync_backend(backend_dir, ext_backend_dir)
    # Sync .env only on first-time setup — never overwrite an existing one.
    src_env = backend_dir / ".env"
    ext_env = ext_backend_dir / ".env"
    if src_env.exists() and not ext_env.exists():
        shutil.copy2(src_env, ext_env)
        print("    synced: .env (first-time only)")
    print("  OK: extension/backend is up to date")

    # 4. Clear pycache
    print("\n[4/7] Clearing pycache...")
    clear_pycache(backend_dir)
    clear_pycache(ext_backend_dir)
    print("  OK: pycache cleared")

    # 5. Install backend dependencies into venv
    print("\n[5/7] Installing Python dependencies into virtualenv...")
    ok = run(
        [str(venv_python), "-m", "pip", "install", "-r", "requirements.txt"],
        cwd=str(backend_dir),
    )
    if not ok:
        print("  ERROR: pip install failed — check backend/requirements.txt")
        sys.exit(1)

    # 6. Create .env in backend/ if missing
    print("\n[6/7] Setting up .env file...")
    env_file    = backend_dir / ".env"
    env_example = backend_dir / ".env.example"
    if not env_file.exists():
        if env_example.exists():
            shutil.copy(env_example, env_file)
            print(f"  Created {env_file}")
            print("  IMPORTANT: Edit backend/.env and add your API keys!")
        else:
            print("  WARNING: .env.example not found, skipping")
    else:
        print(f"  OK: {env_file} already exists")

    # 7. Install Node dependencies and compile TypeScript
    print("\n[7/7] Installing VS Code extension dependencies...")
    npm = shutil.which("npm") or ("npm.cmd" if sys.platform == "win32" else "npm")
    if (ext_dir / "package.json").exists():
        npm_ok = run([npm, "install"], cwd=str(ext_dir))
        if npm_ok:
            print("  Compiling TypeScript...")
            run([npm, "run", "compile"], cwd=str(ext_dir))
        else:
            print("  WARNING: npm install failed. Ensure Node.js is installed and on PATH.")
    else:
        print("  Skipping (extension/package.json not found)")

    print("\n=== Setup complete! ===")
    print(f"""
Next steps:
  1. Edit backend/.env and add your API key(s)
     (run setup.py again to sync it to extension/backend/ — .env is NEVER overwritten)
  2. Open the 'extension' folder in VS Code
  3. Press F5 to launch the Extension Development Host
  4. In the new VS Code window, open any project folder
  5. Use the GenAI sidebar or Command Palette (Ctrl+Shift+P -> "GenAI:")

To re-sync after editing backend code:
  python setup.py

To start the backend manually (using the virtualenv):
  backend\\.venv\\Scripts\\python -m uvicorn main:app --port 8765   (Windows)
  backend/.venv/bin/python  -m uvicorn main:app --port 8765         (Linux/Mac)
  # Then open http://localhost:8765/docs
""")


if __name__ == "__main__":
    main()
