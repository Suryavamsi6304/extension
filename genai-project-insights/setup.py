"""
Setup script for GenAI Project Insights.
Run: python setup.py

This script:
  1. Checks Python version
  2. Syncs backend/ -> extension/backend/ (single source of truth)
  3. Clears __pycache__ in both backend dirs to prevent stale bytecode
  4. Installs Python dependencies
  5. Sets up .env
  6. Installs Node dependencies and compiles TypeScript
"""
import subprocess
import sys
import shutil
from pathlib import Path

SYNC_IGNORE = {".env", ".env.example", "__pycache__", ".mypy_cache", ".pytest_cache"}


def run(cmd: list, cwd: str | None = None, check: bool = True):
    print(f"  > {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=cwd, capture_output=False, check=check)
    return result.returncode == 0


def sync_backend(src: Path, dst: Path) -> None:
    """
    Mirror src into dst, skipping .env and cache dirs.
    Removes files in dst that no longer exist in src.
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
            if not target.exists() or item.read_bytes() != target.read_bytes():
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(item, target)
                print(f"    synced: {rel}")

    # Remove files in dst that no longer exist in src
    for item in list(dst.rglob("*")):
        if any(part in SYNC_IGNORE for part in item.parts):
            continue
        rel = item.relative_to(dst)
        if not (src / rel).exists():
            if item.is_file():
                item.unlink()
                print(f"    removed: {rel}")


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


def main():
    root = Path(__file__).parent
    backend_dir = root / "backend"
    ext_backend_dir = root / "extension" / "backend"
    ext_dir = root / "extension"

    print("\n=== GenAI Project Insights - Setup ===\n")

    # 1. Check Python version
    print("[1/6] Checking Python version...")
    py_ver = sys.version_info
    if py_ver < (3, 10):
        print(f"  ERROR: Python 3.10+ required, found {py_ver.major}.{py_ver.minor}")
        sys.exit(1)
    print(f"  OK: Python {py_ver.major}.{py_ver.minor}.{py_ver.micro}")

    # 2. Sync backend/ -> extension/backend/
    print("\n[2/6] Syncing backend/ -> extension/backend/ ...")
    sync_backend(backend_dir, ext_backend_dir)
    # Always sync .env from backend/ -> extension/backend/
    src_env = backend_dir / ".env"
    ext_env = ext_backend_dir / ".env"
    if src_env.exists():
        if not ext_env.exists() or src_env.read_bytes() != ext_env.read_bytes():
            shutil.copy2(src_env, ext_env)
            print("    synced: .env")
    print("  OK: extension/backend is up to date")

    # 3. Clear pycache in both backend dirs to prevent stale bytecode issues
    print("\n[3/6] Clearing pycache...")
    clear_pycache(backend_dir)
    clear_pycache(ext_backend_dir)
    print("  OK: pycache cleared")

    # 4. Install backend dependencies
    print("\n[4/6] Installing Python dependencies...")
    run([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"], cwd=str(backend_dir))

    # 5. Create .env if missing
    print("\n[5/6] Setting up .env file...")
    env_file = backend_dir / ".env"
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

    # 6. Install Node dependencies for extension
    print("\n[6/6] Installing VS Code extension dependencies...")
    npm = "npm.cmd" if sys.platform == "win32" else "npm"
    if (ext_dir / "package.json").exists():
        npm_ok = run([npm, "install"], cwd=str(ext_dir), check=False)
        if npm_ok:
            print("  Compiling TypeScript...")
            run([npm, "run", "compile"], cwd=str(ext_dir), check=False)
        else:
            print("  WARNING: npm not found or failed. Install Node.js and run 'npm install' in extension/")
    else:
        print("  Skipping (extension/package.json not found)")

    print("\n=== Setup complete! ===")
    print("""
Next steps:
  1. Edit backend/.env and add your API key(s)
     (run setup.py again to sync it to extension/backend/)
  2. Open the 'extension' folder in VS Code
  3. Press F5 to launch the Extension Development Host
  4. In the new VS Code window, open any project folder
  5. Use the GenAI sidebar or Command Palette (Ctrl+Shift+P -> "GenAI:")

To re-sync after editing backend code:
  python setup.py

To test the backend directly:
  cd backend && python main.py
  # Then open http://localhost:8765/docs
""")


if __name__ == "__main__":
    main()
