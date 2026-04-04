# GenAI Project Insights

> AI-powered project analysis directly inside VS Code. Understand any codebase in seconds.

---

## Features

### Project Scanner
Run **`GenAI: Scan & Summarize Project`** to get an AI-generated overview of your entire codebase — tech stack, architecture, key components, and entry points.

### Code Explainer
Select any code, right-click, and choose **`GenAI: Explain Selected Code`**. Get a plain-English explanation with complexity rating and improvement suggestions.

### Project Chat
Open **`GenAI: Open Project Chat`** to have a streaming conversation with AI that has full context of your project files. Ask questions, debug issues, or brainstorm ideas.

### Git Insights
Run **`GenAI: Show Git Insights`** to see an AI-powered summary of recent commits, active contributors, and development patterns.

### TODO Scanner
Run **`GenAI: Find & List TODOs`** to find every `TODO`, `FIXME`, `BUG`, and `HACK` across your workspace.

### Sidebar Views
- **File Activity** — live feed of file changes in your workspace
- **TODOs & FIXMEs** — tree view of all markers found in the project

---

## Supported AI Providers

| Provider | Model | API Key |
|---|---|---|
| **Groq** *(default)* | llama-3.3-70b-versatile | [console.groq.com](https://console.groq.com) |
| **Google Gemini** | Gemini 2.0 Flash | [aistudio.google.com](https://aistudio.google.com) |
| **Pluralsight** | ChatGPT-4o, Claude, Llama, Titan, Jamba | Pluralsight Sandbox key |

Switch providers anytime with **`GenAI: Switch AI Provider`** from the Command Palette.

---

## Getting Started

### 1. Install the extension
Search **"GenAI Project Insights"** in the VS Code Extensions view, or install from the [Marketplace](https://marketplace.visualstudio.com/).

### 2. Set your API key
On first use, you'll be prompted to enter an API key for the active provider.

You can also set or rotate keys anytime:
`Ctrl+Shift+P` → **`GenAI: Set / Rotate API Key`**

### 3. Open a project and start exploring
Open any workspace and run a command from the Command Palette (`Ctrl+Shift+P`):
- `GenAI: Scan & Summarize Project`
- `GenAI: Open Project Chat`
- `GenAI: Explain Selected Code` *(select code first)*
- `GenAI: Show Git Insights`
- `GenAI: Find & List TODOs`

The Python backend starts automatically in the background. No manual setup required.

---

## Requirements

- **VS Code** 1.85.0 or higher
- **Python** 3.10+ (auto-detected, or set `genai.pythonPath` in settings)

The extension automatically creates a virtual environment, installs dependencies, and starts the backend server on first activation.

---

## Commands

| Command | Description |
|---|---|
| `GenAI: Scan & Summarize Project` | AI summary of your codebase |
| `GenAI: Explain Selected Code` | Explain highlighted code |
| `GenAI: Open Project Chat` | Chat with AI about your project |
| `GenAI: Show Git Insights` | AI summary of recent git activity |
| `GenAI: Find & List TODOs` | Scan for TODO / FIXME / BUG / HACK |
| `GenAI: Switch AI Provider` | Switch between Groq, Gemini, Pluralsight |
| `GenAI: Set / Rotate API Key` | Store or update an API key securely |
| `GenAI: Start Backend Server` | Manually restart the Python backend |

---

## Settings

| Setting | Default | Description |
|---|---|---|
| `genai.provider` | `groq` | Active AI provider (`groq`, `gemini`, or `pluralsight`) |
| `genai.pluralsightModel` | `chatgpt-4o` | Model to use with the Pluralsight provider |
| `genai.backendPort` | `8765` | Port for the local Python backend |
| `genai.autoStartBackend` | `true` | Auto-start backend when VS Code opens |
| `genai.pythonPath` | `""` | Custom Python path (leave empty to auto-detect) |

---

## How It Works

```
VS Code Extension (TypeScript)
        |
Python Backend (FastAPI — runs locally on your machine)
        |
AI Provider (Groq / Gemini / Pluralsight)
        |
Response rendered in VS Code webview panel
```

All processing happens locally. Your code is sent only to the AI provider you choose. API keys are stored in VS Code's SecretStorage (OS keychain) and never written to disk.

---

## Troubleshooting

**Backend not starting?**
- Check `View` → `Output` → `GenAI Insights Backend` for logs
- Make sure Python 3.10+ is installed: `python --version`
- Try restarting: `Ctrl+Shift+P` → `GenAI: Start Backend Server`

**AI response is blank or returns an error?**
- Your API key may be missing or expired
- Run `GenAI: Set / Rotate API Key` to update it
- Restart the backend after updating keys

**Port conflict?**
- Change `genai.backendPort` in settings to a free port (e.g. `8766`)
- Restart VS Code

---

## Security

- **Strict Content Security Policy** on all webview panels
- **Nonce-based script-src** for the Chat panel
- **HTML escaping** on all AI-generated output before rendering
- **API keys** stored in OS keychain via VS Code SecretStorage — never in plaintext files
- **SSE streams** check for client disconnect to stop unnecessary token generation
- **No telemetry** — this extension does not collect or send any usage data

---

## License

MIT
