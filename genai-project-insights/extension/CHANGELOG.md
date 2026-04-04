# Changelog

All notable changes to the **GenAI Project Insights** extension will be documented in this file.

## [1.0.0] — 2026-04-03

### Added
- **Project Scanner** — Scan & summarize entire codebases with AI-generated overviews.
- **Code Explanation** — Select code and get instant AI-powered explanations with complexity ratings.
- **Project Chat** — SSE-streamed conversational chat grounded in project context.
- **Git Insights** — View recent commits, file changes, and uncommitted work at a glance.
- **TODO Scanner** — Find and list all TODO / FIXME / HACK markers across the workspace.
- **Multi-provider support** — Groq, Google Gemini, and Pluralsight.
- **Secure key storage** — API keys stored in VS Code SecretStorage (OS keychain), never in plaintext.
- **Auto venv provisioning** — Backend virtual environment created and dependencies installed on first run.
- **Structured JSON logging** — Machine-parseable logs with per-request latency and per-provider token usage.
- **Sidebar views** — File Activity and TODOs & FIXMEs tree views in the activity bar.
- **Content Security Policy** — Strict CSP on all webview panels; nonce-based script-src for Chat.
- **AI output sanitization** — All AI-generated content HTML-escaped before rendering.
- **esbuild bundling** — Single 50 KB minified extension bundle for fast activation.

### Security
- CSP headers on every webview panel (Chat, Explain, Git Insights, Overview).
- API keys never written to workspace settings or `.env` at runtime.
- SSE streams check `request.is_disconnected()` to stop token generation on client close.
- Backend global exception handler prevents stack trace leakage to clients.
