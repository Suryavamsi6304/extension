# GenAI Project Insights

A VS Code extension + Python backend that helps GenAI developers understand their codebase using AI.

## Features

| Feature | Command | Description |
|---|---|---|
| **Project Overview** | `GenAI: Scan & Summarize Project` | AI-generated summary of what the project does, tech stack, key components |
| **Code Explainer** | Right-click → `GenAI: Explain Selected Code` | Explain any selected code with complexity rating and suggestions |
| **Project Chat** | `GenAI: Open Project Chat` | Chat with an AI that has full context of your project |
| **Git Insights** | `GenAI: Show Git Insights` | AI summary of recent commits and development activity |
| **TODO Scanner** | `GenAI: Find & List TODOs` | Find all TODOs, FIXMEs, BUGs, HACKs across the project |
| **Activity Monitor** | Sidebar | Live feed of file changes in your workspace |
| **Provider Switcher** | `GenAI: Switch AI Provider` | Switch between Anthropic, OpenAI, Gemini, or Ollama |

## Supported AI Providers

- **Anthropic Claude** (default) — `claude-opus-4-5`
- **OpenAI GPT** — `gpt-4o`
- **Google Gemini** — `gemini-1.5-pro`
- **Ollama** — any local model (no API key needed)

## Quick Start

### 1. Run setup

```bash
cd genai-project-insights
python setup.py
```

### 2. Add your API key

Edit `backend/.env`:
```env
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=your_key_here
```

Or configure in VS Code settings (`Ctrl+,` → search "GenAI"):
- `genai.provider` — which provider to use
- `genai.anthropicApiKey` — Anthropic key
- `genai.openaiApiKey` — OpenAI key
- `genai.geminiApiKey` — Gemini key

### 3. Launch the extension

```bash
cd extension
npm install
npm run compile
# Then press F5 in VS Code to open Extension Development Host
```

### 4. Or run the backend standalone

```bash
cd backend
pip install -r requirements.txt
python main.py
# API docs: http://localhost:8765/docs
```

## Architecture

```
genai-project-insights/
├── backend/           # Python FastAPI server
│   ├── main.py        # Server entry point
│   ├── config.py      # Settings (API keys, ports)
│   ├── providers/     # AI provider adapters (Anthropic, OpenAI, Gemini, Ollama)
│   ├── services/      # Project scanner, file watcher, git, TODO finder
│   ├── routers/       # API endpoints
│   └── models/        # Pydantic request/response models
│
└── extension/         # VS Code extension (TypeScript)
    ├── src/
    │   ├── extension.ts        # Entry point — registers all commands
    │   ├── backendClient.ts    # HTTP/SSE communication with backend
    │   ├── serverManager.ts    # Auto-starts Python backend
    │   ├── panels/             # Webview panels (Overview, Chat, Explain, Git)
    │   └── providers/          # TreeDataProviders (Activity, TODOs)
    └── package.json            # Extension manifest
```

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Backend status |
| GET | `/providers` | Available providers |
| POST | `/project/scan` | Scan + AI summarize project |
| POST | `/explain` | Explain code snippet |
| POST | `/chat` | Streaming chat (SSE) |
| POST | `/git/insights` | Git commit summary |
| POST | `/todos/scan` | Find TODOs/FIXMEs |
| GET | `/activity/recent` | Recent file changes |
| WS | `/activity/ws` | Live file change feed |

## Suggested Future Features

- **Code Review** — AI reviews your staged changes before commit
- **Dependency Vulnerability Scanner** — Cross-reference against CVE databases
- **Architecture Diagram** — Generate Mermaid diagrams from import graphs
- **Test Suggestor** — Generate skeleton tests for uncovered functions
- **Commit Message Generator** — AI-generated conventional commit messages
- **Documentation Generator** — Auto-generate docstrings for Python functions
