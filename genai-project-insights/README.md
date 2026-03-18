# GenAI Project Insights

> AI-powered project analysis directly inside VS Code. Understand any codebase in seconds.

[![Version](https://img.shields.io/visual-studio-marketplace/v/genai-insights.genai-project-insights)](https://marketplace.visualstudio.com/items?itemName=genai-insights.genai-project-insights)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/genai-insights.genai-project-insights)](https://marketplace.visualstudio.com/items?itemName=genai-insights.genai-project-insights)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## What it does

GenAI Project Insights connects your VS Code workspace to an AI backend that understands your entire codebase. Ask questions, get explanations, scan for issues, and track activity — all without leaving your editor.

---

## Features

### Project Overview
Run `GenAI: Scan & Summarize Project` to get an instant AI-generated breakdown of:
- What the project does
- Tech stack and languages used
- Key components and their roles
- Current development focus

### Code Explainer
Select any code → right-click → `GenAI: Explain Selected Code`
- Plain-English explanation of what the code does
- Complexity rating (Low / Medium / High)
- Key points and improvement suggestions

### Project Chat
Run `GenAI: Open Project Chat` to open a chat panel with full project context.
Ask anything about your codebase — the AI knows every file.

### Git Insights
Run `GenAI: Show Git Insights` for an AI summary of:
- Recent commit history
- Current development focus
- Uncommitted changes

### TODO Scanner
Run `GenAI: Find & List TODOs` to scan the entire project for:
- `TODO`, `FIXME`, `BUG`, `HACK`, `NOTE` tags
- Grouped by type in the sidebar

### File Activity Monitor
The sidebar shows a live feed of every file change in your workspace in real time.

### Provider Switcher
Run `GenAI: Switch AI Provider` to switch between AI providers on the fly without restarting.

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

- **VS Code** 1.85.0 or higher
- **Python 3.10+** installed on your machine
- An API key for your chosen AI provider

---

## Setup

### Step 1 — Install the extension
Install from the VS Code Marketplace or via `.vsix`:
```
code --install-extension genai-project-insights-1.0.0.vsix
```

### Step 2 — Install Python backend dependencies
```bash
cd ~/.vscode/extensions/genai-insights.genai-project-insights-1.0.0/backend
pip install -r requirements.txt
```

### Step 3 — Configure your API key

Open VS Code Settings (`Ctrl+,`) and search for **GenAI**:

| Setting | Description |
|---|---|
| `genai.provider` | Choose your AI provider (default: `pluralsight`) |
| `genai.pluralsightApiKey` | Pluralsight Prompt Sandbox API key |
| `genai.openaiApiKey` | OpenAI API key |
| `genai.anthropicApiKey` | Anthropic API key |
| `genai.geminiApiKey` | Google Gemini API key |
| `genai.pythonPath` | Path to Python (leave empty to auto-detect) |

Or edit `backend/.env` directly:
```env
AI_PROVIDER=pluralsight
PLURALSIGHT_API_KEY=your_key_here
PLURALSIGHT_MODEL=chatgpt-4o
```

### Step 4 — Open a project and start using it
Open any project folder in VS Code. The backend starts automatically.
Press `Ctrl+Shift+P` and run any `GenAI:` command.

---

## Commands

| Command | Description |
|---|---|
| `GenAI: Scan & Summarize Project` | AI overview of your entire project |
| `GenAI: Explain Selected Code` | Explain highlighted code (also in right-click menu) |
| `GenAI: Open Project Chat` | Chat with AI about your project |
| `GenAI: Show Git Insights` | AI summary of recent git activity |
| `GenAI: Find & List TODOs` | Scan for TODOs and FIXMEs |
| `GenAI: Switch AI Provider` | Change AI provider on the fly |
| `GenAI: Start Backend Server` | Manually restart the Python backend |

---

## Extension Settings

| Setting | Type | Default | Description |
|---|---|---|---|
| `genai.provider` | string | `pluralsight` | Active AI provider |
| `genai.pluralsightApiKey` | string | `""` | Pluralsight Sandbox API key |
| `genai.pluralsightModel` | string | `chatgpt-4o` | Pluralsight model selection |
| `genai.openaiApiKey` | string | `""` | OpenAI API key |
| `genai.anthropicApiKey` | string | `""` | Anthropic API key |
| `genai.geminiApiKey` | string | `""` | Google Gemini API key |
| `genai.ollamaUrl` | string | `http://localhost:11434` | Ollama server URL |
| `genai.ollamaModel` | string | `llama3` | Ollama model name |
| `genai.backendPort` | number | `8765` | Python backend port |
| `genai.autoStartBackend` | boolean | `true` | Auto-start backend on VS Code open |
| `genai.pythonPath` | string | `""` | Custom Python interpreter path |

---

## Architecture

```
genai-project-insights/
├── backend/                  # Python FastAPI server (auto-started)
│   ├── main.py               # Server entry point
│   ├── config.py             # Settings loader
│   ├── providers/            # AI provider adapters
│   │   ├── pluralsight_provider.py
│   │   ├── openai_provider.py
│   │   ├── anthropic_provider.py
│   │   ├── gemini_provider.py
│   │   └── ollama_provider.py
│   ├── routers/              # API route handlers
│   └── services/             # Scanner, git, watcher, TODO finder
│
└── extension/                # VS Code extension (TypeScript)
    └── src/
        ├── extension.ts      # Command registration
        ├── backendClient.ts  # HTTP communication with backend
        ├── serverManager.ts  # Auto-starts Python backend
        └── panels/           # Webview UI panels
```

---

## Troubleshooting

**Backend not starting?**
- Check View → Output → `GenAI Insights Backend` for error logs
- Make sure Python 3.10+ is installed: `python --version`
- Set `genai.pythonPath` to your Python executable path
- Run manually: `cd backend && pip install -r requirements.txt && python main.py`

**AI summary is blank?**
- Verify your API key is set correctly in settings
- Check the backend output channel for API errors
- Try switching to a different provider via `GenAI: Switch AI Provider`

**Port conflict?**
- Change `genai.backendPort` to any free port (e.g. `8766`)
- Restart VS Code after changing the port

---

## Known Limitations

- The Python backend must be running for all AI features to work
- Pluralsight Prompt Sandbox does not support streaming — responses appear all at once
- Large projects (1000+ files) may take longer to scan

---

## Release Notes

### 1.0.0
- Initial release
- Project scan & AI summary
- Code explainer with complexity rating
- Project chat with full codebase context
- Git insights with AI commit summary
- TODO/FIXME scanner
- File activity monitor
- Support for Pluralsight, OpenAI, Anthropic, Gemini, and Ollama

---

## License

MIT — see [LICENSE](LICENSE) for details.
