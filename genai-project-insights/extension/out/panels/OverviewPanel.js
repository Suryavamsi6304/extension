"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.OverviewPanel = void 0;
const vscode = __importStar(require("vscode"));
class OverviewPanel {
    constructor(panel) {
        this.disposables = [];
        this.panel = panel;
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        this.panel.webview.html = this.getLoadingHtml();
    }
    static createOrShow(context) {
        const column = vscode.ViewColumn.One;
        if (OverviewPanel.currentPanel) {
            OverviewPanel.currentPanel.panel.reveal(column);
            return OverviewPanel.currentPanel;
        }
        const panel = vscode.window.createWebviewPanel("genai.overview", "Project Overview", column, {
            enableScripts: true,
            retainContextWhenHidden: true,
        });
        OverviewPanel.currentPanel = new OverviewPanel(panel);
        return OverviewPanel.currentPanel;
    }
    async loadData(client, workspacePath) {
        this.panel.webview.html = this.getLoadingHtml("Analyzing project...");
        try {
            const data = await client.scanProject(workspacePath);
            this.panel.webview.html = this.getContentHtml(data, workspacePath);
        }
        catch (err) {
            this.panel.webview.html = this.getErrorHtml(String(err));
        }
    }
    getLoadingHtml(message = "Loading...") {
        return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: var(--vscode-font-family);
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      display: flex; align-items: center; justify-content: center;
      height: 100vh; margin: 0;
    }
    .loading { text-align: center; }
    .spinner {
      width: 40px; height: 40px;
      border: 3px solid var(--vscode-progressBar-background);
      border-top-color: var(--vscode-button-background);
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 16px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="loading">
    <div class="spinner"></div>
    <p>${message}</p>
  </div>
</body>
</html>`;
    }
    getErrorHtml(error) {
        return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: var(--vscode-font-family); background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); padding: 20px; }
    .error { background: var(--vscode-inputValidation-errorBackground); border: 1px solid var(--vscode-inputValidation-errorBorder); padding: 16px; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="error">
    <h3>Error loading project overview</h3>
    <pre>${escapeHtml(error)}</pre>
  </div>
</body>
</html>`;
    }
    getContentHtml(data, workspacePath) {
        const langs = Object.entries(data.language_breakdown)
            .sort((a, b) => b[1] - a[1])
            .map(([lang, count]) => `<div class="lang-item"><span class="lang-name">${escapeHtml(lang)}</span><span class="lang-count">${count}</span></div>`)
            .join("");
        const deps = Object.entries(data.dependencies)
            .map(([eco, pkgs]) => `
        <div class="dep-section">
          <h4>${escapeHtml(eco)}</h4>
          <div class="dep-list">${pkgs.slice(0, 15).map(p => `<span class="dep-badge">${escapeHtml(p)}</span>`).join("")}</div>
        </div>`)
            .join("");
        const summaryHtml = renderMarkdown(data.summary);
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
    h1 { color: var(--vscode-titleBar-activeForeground); font-size: 1.4em; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 8px; }
    h2 { font-size: 1.1em; color: var(--vscode-textLink-foreground); margin-top: 24px; }
    h3 { font-size: 1em; margin: 12px 0 4px; color: var(--vscode-textLink-foreground); }
    h4 { font-size: 0.95em; margin: 10px 0 4px; }
    .meta { color: var(--vscode-descriptionForeground); font-size: 0.9em; margin-bottom: 16px; }
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
    .summary-box h3 { margin-top: 14px; }
    .summary-box code { background: var(--vscode-textCodeBlock-background); padding: 1px 4px; border-radius: 3px; font-family: monospace; font-size: 0.9em; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 16px; }
    .card {
      background: var(--vscode-sideBar-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 16px;
    }
    .lang-item { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid var(--vscode-panel-border); }
    .lang-count { font-weight: bold; color: var(--vscode-textLink-foreground); }
    .dep-badge {
      display: inline-block;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 0.85em;
      margin: 2px;
    }
    .dep-section { margin-bottom: 12px; }
    .dep-section h4 { margin: 0 0 6px; text-transform: capitalize; }
    .tree-box {
      background: var(--vscode-terminal-background);
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.85em;
      padding: 12px;
      border-radius: 4px;
      overflow-x: auto;
      max-height: 300px;
      overflow-y: auto;
      white-space: pre;
    }
    .readme-box {
      background: var(--vscode-textBlockQuote-background);
      padding: 16px;
      border-radius: 4px;
      max-height: 200px;
      overflow-y: auto;
      font-size: 0.9em;
      white-space: pre-wrap;
    }
    li { margin: 3px 0; }
  </style>
</head>
<body>
  <h1>Project Overview</h1>
  <p class="meta">${escapeHtml(workspacePath)} &nbsp;•&nbsp; ${data.file_count} code files</p>

  <h2>AI Summary</h2>
  <div class="summary-box">${summaryHtml}</div>

  <div class="grid">
    <div class="card">
      <h2>Languages</h2>
      ${langs || '<p style="color:var(--vscode-descriptionForeground)">No code files found</p>'}
    </div>
    <div class="card">
      <h2>Dependencies</h2>
      ${deps || '<p style="color:var(--vscode-descriptionForeground)">No dependency files found</p>'}
    </div>
  </div>

  ${data.tree ? `
  <h2>Project Structure</h2>
  <div class="tree-box">${escapeHtml(data.tree.split('\n').slice(0, 80).join('\n'))}</div>
  ` : ""}

  ${data.readme_preview ? `
  <h2>README</h2>
  <div class="readme-box">${escapeHtml(data.readme_preview)}</div>
  ` : ""}
</body>
</html>`;
    }
    dispose() {
        OverviewPanel.currentPanel = undefined;
        this.panel.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}
exports.OverviewPanel = OverviewPanel;
function escapeHtml(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
function renderMarkdown(text) {
    const lines = text.split("\n");
    const html = [];
    let inList = false;
    for (const raw of lines) {
        const line = raw.trimEnd();
        // H2
        if (/^## (.+)/.test(line)) {
            if (inList) {
                html.push("</ul>");
                inList = false;
            }
            html.push(`<h3>${inlineFormat(line.replace(/^## /, ""))}</h3>`);
        }
        // H3
        else if (/^### (.+)/.test(line)) {
            if (inList) {
                html.push("</ul>");
                inList = false;
            }
            html.push(`<h4>${inlineFormat(line.replace(/^### /, ""))}</h4>`);
        }
        // Bullet
        else if (/^[-*] (.+)/.test(line)) {
            if (!inList) {
                html.push("<ul>");
                inList = true;
            }
            html.push(`<li>${inlineFormat(line.replace(/^[-*] /, ""))}</li>`);
        }
        // Numbered list
        else if (/^\d+\. (.+)/.test(line)) {
            if (!inList) {
                html.push("<ol>");
                inList = true;
            }
            html.push(`<li>${inlineFormat(line.replace(/^\d+\. /, ""))}</li>`);
        }
        // Blank line
        else if (line.trim() === "") {
            if (inList) {
                html.push(inList ? "</ul>" : "</ol>");
                inList = false;
            }
            html.push("<br>");
        }
        // Normal paragraph line
        else {
            if (inList) {
                html.push("</ul>");
                inList = false;
            }
            html.push(`<p>${inlineFormat(line)}</p>`);
        }
    }
    if (inList)
        html.push("</ul>");
    return html.join("\n");
}
function inlineFormat(text) {
    return escapeHtml(text)
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/`(.+?)`/g, "<code>$1</code>");
}
//# sourceMappingURL=OverviewPanel.js.map