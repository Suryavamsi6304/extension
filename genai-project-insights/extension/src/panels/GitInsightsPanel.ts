import * as vscode from "vscode";
import { BackendClient } from "../backendClient";
import type { GitInsights } from "../types";

export class GitInsightsPanel {
  public static currentPanel: GitInsightsPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel) {
    this.panel = panel;
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  static createOrShow(): GitInsightsPanel {
    const column = vscode.ViewColumn.One;

    if (GitInsightsPanel.currentPanel) {
      GitInsightsPanel.currentPanel.panel.reveal(column);
      return GitInsightsPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      "genai.git",
      "Git Insights",
      column,
      { enableScripts: false, retainContextWhenHidden: true }
    );

    GitInsightsPanel.currentPanel = new GitInsightsPanel(panel);
    return GitInsightsPanel.currentPanel;
  }

  async loadData(client: BackendClient, workspacePath: string): Promise<void> {
    this.panel.webview.html = this.getLoadingHtml();

    try {
      const data = await client.getGitInsights(workspacePath);
      this.panel.webview.html = this.getContentHtml(data);
    } catch (err) {
      this.panel.webview.html = this.getErrorHtml(String(err));
    }
  }

  private getLoadingHtml(): string {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>body { font-family: var(--vscode-font-family); background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); display: flex; align-items: center; justify-content: center; height: 100vh; }
.spinner { width: 32px; height: 32px; border: 3px solid var(--vscode-panel-border); border-top-color: var(--vscode-button-background); border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 12px; }
@keyframes spin { to { transform: rotate(360deg); } }
.loading { text-align: center; }</style></head>
<body><div class="loading"><div class="spinner"></div><p>Loading git insights...</p></div></body></html>`;
  }

  private getErrorHtml(error: string): string {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>body { font-family: var(--vscode-font-family); background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); padding: 20px; } .error { background: var(--vscode-inputValidation-errorBackground); padding: 16px; border-radius: 4px; }</style>
</head><body><div class="error"><h3>Error</h3><pre>${escapeHtml(error)}</pre></div></body></html>`;
  }

  private getContentHtml(data: GitInsights): string {
    if (data.error) {
      return this.getErrorHtml(data.error);
    }

    const commitsHtml = data.commits.slice(0, 15).map(c => {
      const filesHtml = c.files_changed.slice(0, 5)
        .map(f => `<span class="file-badge">${escapeHtml(f)}</span>`)
        .join("");
      return `
      <div class="commit">
        <div class="commit-header">
          <span class="commit-hash">${escapeHtml(c.hash)}</span>
          <span class="commit-msg">${escapeHtml(c.message.split('\n')[0])}</span>
        </div>
        <div class="commit-meta">
          <span>${escapeHtml(c.author)}</span>
          <span>${new Date(c.date).toLocaleDateString()}</span>
        </div>
        ${filesHtml ? `<div class="commit-files">${filesHtml}</div>` : ""}
      </div>`;
    }).join("");

    const uncommittedHtml = data.uncommitted_changes.slice(0, 10)
      .map(f => `<div class="uncommitted-item">• ${escapeHtml(f)}</div>`)
      .join("");

    const summaryHtml = data.ai_summary
      ? renderMarkdown(data.ai_summary)
      : "";

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
      max-width: 900px;
    }
    h1 { font-size: 1.2em; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 8px; }
    h2 { font-size: 1em; color: var(--vscode-textLink-foreground); margin: 20px 0 8px; }
    .branch-badge {
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 3px 10px;
      border-radius: 10px;
      font-size: 0.9em;
      font-family: monospace;
    }
    .summary-box {
      background: var(--vscode-textBlockQuote-background);
      border-left: 3px solid var(--vscode-textLink-foreground);
      padding: 16px 20px;
      border-radius: 0 4px 4px 0;
      line-height: 1.7;
    }
    .summary-box p { margin: 4px 0; }
    .summary-box ul, .summary-box ol { padding-left: 20px; margin: 4px 0 8px; }
    .summary-box li { margin: 3px 0; }
    .summary-box h3 { margin-top: 14px; color: var(--vscode-textLink-foreground); }
    .summary-box code { background: var(--vscode-textCodeBlock-background); padding: 1px 4px; border-radius: 3px; font-family: monospace; font-size: 0.9em; }
    .commit {
      background: var(--vscode-sideBar-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 8px;
    }
    .commit-header { display: flex; gap: 10px; align-items: baseline; margin-bottom: 4px; }
    .commit-hash { font-family: monospace; color: var(--vscode-terminal-ansiCyan); font-size: 0.85em; flex-shrink: 0; }
    .commit-msg { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .commit-meta { color: var(--vscode-descriptionForeground); font-size: 0.85em; display: flex; gap: 16px; }
    .commit-files { margin-top: 6px; }
    .file-badge {
      display: inline-block;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 1px 6px;
      border-radius: 3px;
      font-size: 0.8em;
      font-family: monospace;
      margin: 2px;
    }
    .uncommitted-item { font-family: monospace; font-size: 0.9em; color: var(--vscode-terminal-ansiYellow); margin: 3px 0; }
  </style>
</head>
<body>
  <h1>Git Insights &nbsp;<span class="branch-badge">${escapeHtml(data.branch)}</span></h1>

  ${data.uncommitted_changes.length > 0 ? `
  <h2>Uncommitted Changes (${data.uncommitted_changes.length})</h2>
  <div>${uncommittedHtml}</div>
  ` : ""}

  ${summaryHtml ? `
  <h2>AI Summary</h2>
  <div class="summary-box">${summaryHtml}</div>
  ` : ""}

  <h2>Recent Commits (${data.commits.length})</h2>
  ${commitsHtml || '<p style="color:var(--vscode-descriptionForeground)">No commits found</p>'}
</body>
</html>`;
  }

  dispose(): void {
    GitInsightsPanel.currentPanel = undefined;
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

function renderMarkdown(text: string): string {
  const lines = text.split("\n");
  const html: string[] = [];
  let inList = false;

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^## (.+)/.test(line)) {
      if (inList) { html.push("</ul>"); inList = false; }
      html.push(`<h3>${inlineFormat(line.replace(/^## /, ""))}</h3>`);
    } else if (/^### (.+)/.test(line)) {
      if (inList) { html.push("</ul>"); inList = false; }
      html.push(`<h4>${inlineFormat(line.replace(/^### /, ""))}</h4>`);
    } else if (/^[-*] (.+)/.test(line)) {
      if (!inList) { html.push("<ul>"); inList = true; }
      html.push(`<li>${inlineFormat(line.replace(/^[-*] /, ""))}</li>`);
    } else if (/^\d+\. (.+)/.test(line)) {
      if (!inList) { html.push("<ol>"); inList = true; }
      html.push(`<li>${inlineFormat(line.replace(/^\d+\. /, ""))}</li>`);
    } else if (line.trim() === "") {
      if (inList) { html.push("</ul>"); inList = false; }
      html.push("<br>");
    } else {
      if (inList) { html.push("</ul>"); inList = false; }
      html.push(`<p>${inlineFormat(line)}</p>`);
    }
  }

  if (inList) html.push("</ul>");
  return html.join("\n");
}

function inlineFormat(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}
