import * as vscode from "vscode";
import { BackendClient } from "../backendClient";
import type { ExplainResult } from "../types";

export class ExplainPanel {
  public static currentPanel: ExplainPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel) {
    this.panel = panel;
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  static createOrShow(): ExplainPanel {
    const column = vscode.ViewColumn.Beside;

    if (ExplainPanel.currentPanel) {
      ExplainPanel.currentPanel.panel.reveal(column);
      return ExplainPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      "genai.explain",
      "Code Explanation",
      column,
      { enableScripts: false, retainContextWhenHidden: true }
    );

    ExplainPanel.currentPanel = new ExplainPanel(panel);
    return ExplainPanel.currentPanel;
  }

  async loadExplanation(
    client: BackendClient,
    code: string,
    language: string,
    filePath: string
  ): Promise<void> {
    this.panel.webview.html = this.getLoadingHtml(language, filePath);

    try {
      const data = await client.explainCode(code, language, filePath);
      this.panel.webview.html = this.getContentHtml(data, code, language, filePath);
    } catch (err) {
      this.panel.webview.html = this.getErrorHtml(String(err));
    }
  }

  private getLoadingHtml(language: string, filePath: string): string {
    const fileName = filePath.split(/[/\\]/).pop() || filePath;
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  body { font-family: var(--vscode-font-family); background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); display: flex; align-items: center; justify-content: center; height: 100vh; }
  .spinner { width: 32px; height: 32px; border: 3px solid var(--vscode-panel-border); border-top-color: var(--vscode-button-background); border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 12px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .loading { text-align: center; }
</style></head>
<body><div class="loading"><div class="spinner"></div><p>Explaining ${escapeHtml(language)} code in ${escapeHtml(fileName)}...</p></div></body></html>`;
  }

  private getErrorHtml(error: string): string {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>body { font-family: var(--vscode-font-family); background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); padding: 20px; } .error { background: var(--vscode-inputValidation-errorBackground); padding: 16px; border-radius: 4px; }</style>
</head><body><div class="error"><h3>Error</h3><pre>${escapeHtml(error)}</pre></div></body></html>`;
  }

  private getContentHtml(
    data: ExplainResult,
    code: string,
    language: string,
    filePath: string
  ): string {
    const fileName = filePath.split(/[/\\]/).pop() || filePath;
    const complexityColor = {
      Low: "var(--vscode-terminal-ansiGreen)",
      Medium: "var(--vscode-terminal-ansiYellow)",
      High: "var(--vscode-terminal-ansiRed)",
    }[data.complexity] || "var(--vscode-editor-foreground)";

    const keyPoints = data.key_points
      .map(p => `<li>${escapeHtml(p)}</li>`)
      .join("");

    const suggestions = data.suggestions
      .map(s => `<li>${escapeHtml(s)}</li>`)
      .join("");

    const codePreview = code.split("\n").slice(0, 30).join("\n");

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      padding: 20px;
      max-width: 800px;
    }
    h1 { font-size: 1.2em; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 8px; }
    h2 { font-size: 1em; color: var(--vscode-textLink-foreground); margin: 20px 0 8px; }
    .meta { color: var(--vscode-descriptionForeground); font-size: 0.9em; margin-bottom: 16px; }
    .complexity {
      display: inline-block;
      color: ${complexityColor};
      font-weight: bold;
      padding: 2px 8px;
      border: 1px solid ${complexityColor};
      border-radius: 10px;
      font-size: 0.85em;
    }
    .explanation {
      background: var(--vscode-textBlockQuote-background);
      border-left: 3px solid var(--vscode-textLink-foreground);
      padding: 16px;
      border-radius: 0 4px 4px 0;
      line-height: 1.6;
      white-space: pre-wrap;
    }
    .code-preview {
      background: var(--vscode-terminal-background);
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.85em;
      padding: 12px;
      border-radius: 4px;
      overflow-x: auto;
      white-space: pre;
      max-height: 200px;
      overflow-y: auto;
    }
    ul { padding-left: 20px; }
    li { margin: 6px 0; line-height: 1.4; }
    .suggestions li { color: var(--vscode-terminal-ansiYellow); }
  </style>
</head>
<body>
  <h1>Code Explanation</h1>
  <p class="meta">
    <strong>${escapeHtml(fileName)}</strong> &nbsp;•&nbsp; ${escapeHtml(language)}
    &nbsp;•&nbsp; Complexity: <span class="complexity">${data.complexity}</span>
  </p>

  <h2>Code</h2>
  <div class="code-preview">${escapeHtml(codePreview)}${code.split("\n").length > 30 ? "\n... (truncated)" : ""}</div>

  <h2>Explanation</h2>
  <div class="explanation">${escapeHtml(data.explanation)}</div>

  ${keyPoints ? `
  <h2>Key Points</h2>
  <ul>${keyPoints}</ul>
  ` : ""}

  ${suggestions ? `
  <h2>Suggestions</h2>
  <ul class="suggestions">${suggestions}</ul>
  ` : ""}
</body>
</html>`;
  }

  dispose(): void {
    ExplainPanel.currentPanel = undefined;
    this.panel.dispose();
    this.disposables.forEach(d => d.dispose());
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
