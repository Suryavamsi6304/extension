# GenAI Project Insights

> AI-powered project analysis directly inside VS Code. Understand any codebase in seconds.

---

## What is this?

GenAI Project Insights is a VS Code extension that connects your workspace to an AI backend. It reads your entire project and lets you ask questions, get explanations, scan for issues, and track activity — all without leaving your editor.

---

## Features

| Feature | Command | Description |
|---|---|---|
| **Project Overview** | `GenAI: Scan & Summarize Project` | AI summary of what the project does, tech stack, key components |
| **Code Explainer** | Right-click → `GenAI: Explain Selected Code` | Explains selected code with complexity rating and suggestions |
| **Project Chat** | `GenAI: Open Project Chat` | Chat with AI that has full context of your project |
| **Git Insights** | `GenAI: Show Git Insights` | AI summary of recent commits and development activity |
| **TODO Scanner** | `GenAI: Find & List TODOs` | Finds all TODOs, FIXMEs, BUGs, HACKs across the project |
| **Activity Monitor** | Sidebar | Live feed of file changes in your workspace |
| **Provider Switcher** | `GenAI: Switch AI Provider` | Switch between Pluralsight, OpenAI, Anthropic, Gemini, or Ollama |

---

## Supported AI Providers

| Provider | Model | Requires Key |
|---|---|---|
| **Pluralsight** *(default)* | ChatGPT-4o, Claude, Llama, Titan, Jamba | Pluralsight Sandbox key |
| **OpenAI** | GPT-4o | Yes — [platform.openai.com](https://platform.openai.com) |
| **Anthropic** | Claude Opus | Yes — [console.anthropic.com](https://console.anthropic.com) |
| **Google Gemini** | Gemini 1.5 Pro | Yes — [aistudio.google.com](https://aistudio.google.com) |
| **Ollama** | Any local model | No — runs locally |

---

## Requirements

- VS Code 1.85.0 or higher
- Python 3.10+
- Node.js 18+
- An API key for your chosen AI provider

---

## Quick Start (Clone & Run)

### Step 1 — Clone the repo
```bash
git clone https://github.com/Suryavamsi6304/extension.git
cd extension/genai-project-insights
```

### Step 2 — Install Python backend dependencies
```bash
cd backend
pip install -r requirements.txt
```

### Step 3 — Install extension dependencies and compile
```bash
cd ../extension
npm install
npm run compile
```

### Step 4 — Set your API key
Edit `backend/.env`:
```env
AI_PROVIDER=pluralsight
PLURALSIGHT_API_KEY=your_key_here
PLURALSIGHT_MODEL=chatgpt-4o
```

### Step 5 — Launch
Open the `extension` folder in VS Code and press `F5`.
A new **Extension Development Host** window will open.

---

## Quick Start (Install via .vsix)

### Step 1 — Install the extension
```
code --install-extension genai-project-insights-1.0.0.vsix
```
Or in VS Code: `Ctrl+Shift+X` → `...` → **Install from VSIX**

### Step 2 — Install Python dependencies
```bash
cd %USERPROFILE%\.vscode\extensions\genai-insights.genai-project-insights-1.0.0\backend
pip install -r requirements.txt
```

### Step 3 — Set your API key
`Ctrl+,` → search **GenAI** → set `genai.pluralsightApiKey`

---

## Project Structure

```
genai-project-insights/
├── backend/                        # Python FastAPI server
│   ├── main.py                     # Server entry point
│   ├── config.py                   # Settings loader (.env)
│   ├── requirements.txt            # Python dependencies
│   ├── .env                        # API keys and config
│   ├── providers/                  # AI provider adapters
│   │   ├── pluralsight_provider.py # Pluralsight Prompt Sandbox
│   │   ├── openai_provider.py      # OpenAI GPT
│   │   ├── anthropic_provider.py   # Anthropic Claude
│   │   ├── gemini_provider.py      # Google Gemini
│   │   └── ollama_provider.py      # Ollama (local)
│   ├── routers/                    # API route handlers
│   │   ├── project.py              # /project/scan
│   │   ├── explain.py              # /explain
│   │   ├── chat.py                 # /chat
│   │   ├── git.py                  # /git/insights
│   │   ├── todos.py                # /todos/scan
│   │   └── activity.py             # /activity
│   ├── services/                   # Core logic
│   │   ├── scanner.py              # Project file scanner
│   │   ├── context_builder.py      # Builds AI context
│   │   ├── git_service.py          # Git history reader
│   │   ├── todo_service.py         # TODO finder
│   │   └── watcher.py              # File change watcher
│   └── models/                     # Pydantic models
│
└── extension/                      # VS Code extension (TypeScript)
    ├── src/
    │   ├── extension.ts            # Entry point, command registration
    │   ├── backendClient.ts        # HTTP communication with backend
    │   ├── serverManager.ts        # Auto-starts Python backend
    │   ├── panels/                 # Webview UI panels
    │   │   ├── OverviewPanel.ts    # Project overview UI
    │   │   ├── ChatPanel.ts        # Chat UI
    │   │   ├── ExplainPanel.ts     # Code explanation UI
    │   │   └── GitInsightsPanel.ts # Git insights UI
    │   └── providers/              # Sidebar tree providers
    │       ├── ActivityProvider.ts
    │       └── TodoProvider.ts
    ├── assets/
    │   └── icon.png                # Extension icon
    ├── package.json                # Extension manifest
    └── tsconfig.json               # TypeScript config
```

---

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

---

## Configuration

| Setting | Default | Description |
|---|---|---|
| `genai.provider` | `pluralsight` | Active AI provider |
| `genai.pluralsightApiKey` | `""` | Pluralsight Sandbox API key |
| `genai.pluralsightModel` | `chatgpt-4o` | Pluralsight model |
| `genai.openaiApiKey` | `""` | OpenAI API key |
| `genai.anthropicApiKey` | `""` | Anthropic API key |
| `genai.geminiApiKey` | `""` | Google Gemini API key |
| `genai.ollamaUrl` | `http://localhost:11434` | Ollama server URL |
| `genai.ollamaModel` | `llama3` | Ollama model name |
| `genai.backendPort` | `8765` | Python backend port |
| `genai.autoStartBackend` | `true` | Auto-start backend on VS Code open |
| `genai.pythonPath` | `""` | Custom Python path (leave empty to auto-detect) |

---

## Troubleshooting

**Backend not starting?**
- Check `View → Output → GenAI Insights Backend` for logs
- Make sure Python 3.10+ is installed: `python --version`
- Run manually: `cd backend && python -m uvicorn main:app --host 127.0.0.1 --port 8765`

**AI summary is blank or 401 error?**
- Your API key is missing or expired
- `Ctrl+,` → search **GenAI** → update `genai.pluralsightApiKey`
- Restart backend: `Ctrl+Shift+P` → `GenAI: Start Backend Server`

**Port conflict?**
- Change `genai.backendPort` to any free port (e.g. `8766`)
- Restart VS Code

---

## How it works

```
VS Code Extension (TypeScript)
        ↓
Python Backend (FastAPI — runs locally)
        ↓
AI Provider (Pluralsight / OpenAI / Anthropic / Gemini / Ollama)
        ↓
Response rendered in VS Code webview panel
```

---

## License

MIT — see [LICENSE](extension/LICENSE) for details.
