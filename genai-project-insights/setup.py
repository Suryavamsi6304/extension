"""
Setup script for GenAI Project Insights backend.
Run: python setup.py
"""
import subprocess
import sys
import os
from pathlib import Path


def run(cmd: list, cwd: str | None = None, check: bool = True):
    print(f"  > {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=cwd, capture_output=False, check=check)
    return result.returncode == 0


def main():
    root = Path(__file__).parent
    backend_dir = root / "backend"

    print("\n=== GenAI Project Insights - Setup ===\n")

    # 1. Check Python version
    print("[1/4] Checking Python version...")
    py_ver = sys.version_info
    if py_ver < (3, 10):
        print(f"  ERROR: Python 3.10+ required, found {py_ver.major}.{py_ver.minor}")
        sys.exit(1)
    print(f"  OK: Python {py_ver.major}.{py_ver.minor}.{py_ver.micro}")

    # 2. Install backend dependencies
    print("\n[2/4] Installing Python dependencies...")
    run([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"], cwd=str(backend_dir))

    # 3. Create .env if missing
    print("\n[3/4] Setting up .env file...")
    env_file = backend_dir / ".env"
    env_example = backend_dir / ".env.example"
    if not env_file.exists():
        if env_example.exists():
            import shutil
            shutil.copy(env_example, env_file)
            print(f"  Created {env_file}")
            print("  IMPORTANT: Edit backend/.env and add your API keys!")
        else:
            print("  WARNING: .env.example not found, skipping")
    else:
        print(f"  OK: {env_file} already exists")

    # 4. Install Node dependencies for extension
    print("\n[4/4] Installing VS Code extension dependencies...")
    ext_dir = root / "extension"
    # On Windows, npm is npm.cmd
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
  2. Open the 'extension' folder in VS Code
  3. Press F5 to launch the Extension Development Host
  4. In the new VS Code window, open any project folder
  5. Use the GenAI sidebar or Command Palette (Ctrl+Shift+P → "GenAI:")

Alternatively, test the backend directly:
  cd backend
  python main.py
  # Then open http://localhost:8765/docs
""")


if __name__ == "__main__":
    main()
