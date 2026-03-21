import * as vscode from "vscode";
import { BackendClient } from "../backendClient";
import type { ChatMessage } from "../types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getNonce(): string {
  let text = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

// ─── WebView assets (module-level so they are never nested inside another
//     template literal — avoids backtick-escaping issues at compile time) ──────

const STYLES = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
  background: var(--vscode-editor-background);
  color: var(--vscode-editor-foreground);
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.header {
  padding: 10px 16px;
  background: var(--vscode-titleBar-activeBackground, var(--vscode-sideBarSectionHeader-background));
  color: var(--vscode-titleBar-activeForeground, var(--vscode-foreground));
  border-bottom: 1px solid var(--vscode-panel-border);
  flex-shrink: 0;
}
.header h2 { font-size: 0.95em; font-weight: 600; }
.header small { font-size: 0.8em; opacity: 0.7; }
.messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.message {
  max-width: 90%;
  padding: 10px 14px;
  border-radius: 8px;
  line-height: 1.55;
  word-wrap: break-word;
}
.message.user {
  white-space: pre-wrap;
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  align-self: flex-end;
  border-radius: 8px 8px 2px 8px;
}
.message.assistant {
  background: var(--vscode-sideBar-background, var(--vscode-editor-background));
  border: 1px solid var(--vscode-panel-border);
  align-self: flex-start;
  border-radius: 2px 8px 8px 8px;
}
.message.assistant p { margin: 4px 0; }
.message.assistant ul, .message.assistant ol { padding-left: 20px; margin: 4px 0 8px; }
.message.assistant li { margin: 3px 0; }
.message.assistant h3 { font-size: 1em; margin: 10px 0 4px; color: var(--vscode-textLink-foreground); }
.message.assistant h4 { font-size: 0.95em; margin: 8px 0 4px; }
.message.assistant code {
  background: var(--vscode-textCodeBlock-background);
  padding: 1px 4px; border-radius: 3px;
  font-family: monospace; font-size: 0.88em;
}
.message.assistant pre {
  background: var(--vscode-terminal-background, #1e1e1e);
  padding: 10px 12px; border-radius: 4px;
  overflow-x: auto; margin: 8px 0;
}
.message.assistant pre code { background: none; padding: 0; font-size: 0.85em; }
.message.error {
  background: var(--vscode-inputValidation-errorBackground);
  border: 1px solid var(--vscode-inputValidation-errorBorder);
  color: var(--vscode-inputValidation-errorForeground);
  align-self: flex-start;
}
.cursor {
  display: inline-block; width: 2px; height: 1em;
  background: currentColor; vertical-align: text-bottom;
  animation: blink 1s step-end infinite;
}
@keyframes blink { 50% { opacity: 0; } }
.welcome {
  text-align: center;
  color: var(--vscode-descriptionForeground);
  margin: auto;
  padding: 32px 24px;
}
.welcome h3 { margin-bottom: 8px; font-size: 1.05em; }
.welcome p { margin-bottom: 16px; font-size: 0.9em; }
.suggestions { display: flex; flex-direction: column; gap: 8px; }
.sbtn {
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
  border: 1px solid var(--vscode-button-border, var(--vscode-panel-border));
  padding: 8px 12px; border-radius: 4px;
  cursor: pointer; text-align: left;
  font-size: 0.88em; font-family: inherit;
}
.sbtn:hover { background: var(--vscode-button-secondaryHoverBackground); }
.input-area {
  padding: 10px 16px;
  border-top: 1px solid var(--vscode-panel-border);
  display: flex; gap: 8px; flex-shrink: 0;
  background: var(--vscode-editor-background);
}
#inp {
  flex: 1;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
  border-radius: 4px; padding: 7px 10px;
  font-family: inherit; font-size: inherit;
  resize: none; outline: none;
  min-height: 36px; max-height: 120px; line-height: 1.4;
}
#inp:focus { border-color: var(--vscode-focusBorder); }
#sendBtn {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border: none; border-radius: 4px;
  padding: 7px 14px; cursor: pointer;
  font-size: 0.9em; font-family: inherit;
  align-self: flex-end; white-space: nowrap;
}
#sendBtn:hover { background: var(--vscode-button-hoverBackground); }
#sendBtn:disabled { opacity: 0.45; cursor: not-allowed; }
`;

// NOTE: backtick characters inside this template literal are escaped as \`
// so they survive TypeScript compilation into correct JS for the WebView.
const SCRIPT = `
(function () {
  const vscode = acquireVsCodeApi();
  const msgList  = document.getElementById('messages');
  const inp      = document.getElementById('inp');
  const sendBtn  = document.getElementById('sendBtn');

  let current   = null;
  let streaming = false;
  let response  = '';

  function scrollEnd() { msgList.scrollTop = msgList.scrollHeight; }

  function hideWelcome() {
    const w = document.getElementById('welcome');
    if (w) w.remove();
  }

  function send() {
    const text = inp.value.trim();
    if (!text || streaming) return;
    vscode.postMessage({ type: 'send', text: text });
    inp.value = '';
    inp.style.height = 'auto';
  }

  inp.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });

  inp.addEventListener('input', function () {
    inp.style.height = 'auto';
    inp.style.height = Math.min(inp.scrollHeight, 120) + 'px';
  });

  sendBtn.addEventListener('click', send);

  document.querySelectorAll('.sbtn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (streaming) return;
      var text = btn.textContent.trim();
      if (text) { vscode.postMessage({ type: 'send', text: text }); hideWelcome(); }
    });
  });

  window.addEventListener('message', function (ev) {
    var msg = ev.data;
    switch (msg.type) {

      case 'userMessage':
        hideWelcome();
        var uEl = document.createElement('div');
        uEl.className = 'message user';
        uEl.textContent = msg.text;
        msgList.appendChild(uEl);
        scrollEnd();
        break;

      case 'assistantStart':
        streaming = true;
        response  = '';
        sendBtn.disabled = true;
        current = document.createElement('div');
        current.className = 'message assistant';
        current.innerHTML = '<span class="cursor"></span>';
        msgList.appendChild(current);
        scrollEnd();
        break;

      case 'token':
        if (!current) break;
        response += msg.text;
        var cursor = current.querySelector('.cursor');
        if (cursor) cursor.insertAdjacentText('beforebegin', msg.text);
        else current.insertAdjacentText('beforeend', msg.text);
        scrollEnd();
        break;

      case 'done':
        streaming = false;
        sendBtn.disabled = false;
        if (current) current.innerHTML = renderMarkdown(response);
        response = '';
        current  = null;
        scrollEnd();
        break;

      case 'error':
        streaming = false;
        sendBtn.disabled = false;
        current = null;
        var eEl = document.createElement('div');
        eEl.className = 'message error';
        eEl.textContent = 'Error: ' + (msg.text || 'unknown error');
        msgList.appendChild(eEl);
        scrollEnd();
        break;
    }
  });

  // ── Markdown renderer ────────────────────────────────────────────────────
  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;')
            .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function inline(text) {
    return escHtml(text)
      .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
      .replace(/\\*(.+?)\\*/g, '<em>$1</em>')
      .replace(/\`([^\`]+)\`/g, '<code>$1</code>');
  }

  function renderMarkdown(text) {
    var lines    = text.split('\\n');
    var out      = [];
    var inList   = false, listTag = 'ul';
    var inCode   = false, codeLines = [];

    function closeList() {
      if (inList) { out.push('</' + listTag + '>'); inList = false; }
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].replace(/\\s+$/, '');

      if (line.indexOf('\`\`\`') === 0) {
        if (!inCode) { closeList(); inCode = true; codeLines = []; }
        else {
          out.push('<pre><code>' + codeLines.map(escHtml).join('\\n') + '</code></pre>');
          inCode = false;
        }
        continue;
      }
      if (inCode) { codeLines.push(line); continue; }

      if (/^## ./.test(line))       { closeList(); out.push('<h3>'  + inline(line.slice(3))  + '</h3>'); }
      else if (/^### ./.test(line)) { closeList(); out.push('<h4>'  + inline(line.slice(4))  + '</h4>'); }
      else if (/^[-*] ./.test(line)) {
        if (!inList || listTag !== 'ul') { closeList(); out.push('<ul>'); inList = true; listTag = 'ul'; }
        out.push('<li>' + inline(line.slice(2)) + '</li>');
      } else if (/^\\d+\\. ./.test(line)) {
        if (!inList || listTag !== 'ol') { closeList(); out.push('<ol>'); inList = true; listTag = 'ol'; }
        out.push('<li>' + inline(line.replace(/^\\d+\\. /, '')) + '</li>');
      } else if (!line.trim()) {
        closeList();
      } else {
        closeList();
        out.push('<p>' + inline(line) + '</p>');
      }
    }
    if (inCode) out.push('<pre><code>' + codeLines.map(escHtml).join('\\n') + '</code></pre>');
    if (inList) out.push('</' + listTag + '>');
    return out.join('\\n');
  }
})();
`;

// ─── ChatPanel ────────────────────────────────────────────────────────────────

export class ChatPanel {
  public static currentPanel: ChatPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private _history: ChatMessage[] = [];
  private _client: BackendClient;
  private _workspacePath: string;

  private constructor(
    panel: vscode.WebviewPanel,
    client: BackendClient,
    workspacePath: string,
  ) {
    this._panel = panel;
    this._client = client;
    this._workspacePath = workspacePath;

    this._panel.webview.html = this._buildHtml();
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      (msg) => this._onMessage(msg),
      null,
      this._disposables,
    );
  }

  public static createOrShow(client: BackendClient, workspacePath: string): ChatPanel {
    const column = vscode.ViewColumn.Beside;

    if (ChatPanel.currentPanel) {
      // Refresh client/path in case of extension reload, then reveal.
      ChatPanel.currentPanel._client = client;
      ChatPanel.currentPanel._workspacePath = workspacePath;
      ChatPanel.currentPanel._panel.reveal(column);
      return ChatPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      "genai.chat",
      "GenAI Chat",
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [],
      },
    );

    ChatPanel.currentPanel = new ChatPanel(panel, client, workspacePath);
    return ChatPanel.currentPanel;
  }

  // ── Message handling ────────────────────────────────────────────────────

  private _onMessage(msg: Record<string, string>): void {
    try {
      if (msg.type === "send" && msg.text?.trim()) {
        this._chat(msg.text.trim());
      }
    } catch (err) {
      this._post({ type: "error", text: String(err) });
    }
  }

  private _chat(userMessage: string): void {
    this._history.push({ role: "user", content: userMessage });
    this._post({ type: "userMessage", text: userMessage });
    this._post({ type: "assistantStart" });

    let fullResponse = "";

    this._client.chatStreamCallback(
      userMessage,
      this._workspacePath,
      this._history.slice(-10),
      (token) => {
        fullResponse += token;
        this._post({ type: "token", text: token });
      },
      () => {
        this._history.push({ role: "assistant", content: fullResponse });
        this._post({ type: "done" });
      },
      (err: Error) => {
        this._post({ type: "error", text: err.message });
      },
    );
  }

  private _post(msg: Record<string, string | undefined>): void {
    this._panel.webview.postMessage(msg);
  }

  // ── HTML ────────────────────────────────────────────────────────────────

  private _buildHtml(): string {
    const nonce = getNonce();
    const w = this._workspacePath.split(/[/\\]/).pop() ?? this._workspacePath;

    // Dynamic values only — STYLES and SCRIPT are module-level constants
    // and are never nested inside this template literal at authoring time,
    // so there is no backtick-escaping mismatch.
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <style>${STYLES}</style>
</head>
<body>
  <div class="header">
    <h2>Project Chat</h2>
    <small>${w}</small>
  </div>

  <div class="messages" id="messages">
    <div class="welcome" id="welcome">
      <h3>Ask anything about your project</h3>
      <p>I have full context of <strong>${w}</strong></p>
      <div class="suggestions">
        <button class="sbtn">What does this project do?</button>
        <button class="sbtn">What are the main entry points?</button>
        <button class="sbtn">What dependencies does this project use?</button>
        <button class="sbtn">Where should I look to understand the AI pipeline?</button>
      </div>
    </div>
  </div>

  <div class="input-area">
    <textarea id="inp" placeholder="Ask about your project..." rows="1"></textarea>
    <button id="sendBtn">Send</button>
  </div>

  <script nonce="${nonce}">${SCRIPT}</script>
</body>
</html>`;
  }

  // ── Disposal ────────────────────────────────────────────────────────────

  public dispose(): void {
    ChatPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      if (d) { d.dispose(); }
    }
  }
}
