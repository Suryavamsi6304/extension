import * as vscode from "vscode";
import { BackendClient } from "../backendClient";
import type { ChatMessage } from "../types";

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}


export class ChatPanel {
  public static currentPanel: ChatPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private history: ChatMessage[] = [];
  private workspacePath: string;
  private client: BackendClient;

  private constructor(
    panel: vscode.WebviewPanel,
    client: BackendClient,
    workspacePath: string
  ) {
    this.panel = panel;
    this.client = client;
    this.workspacePath = workspacePath;

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.html = this.getHtml();

    // Handle messages from the webview
    this.panel.webview.onDidReceiveMessage(
      (msg) => this.handleMessage(msg),
      null,
      this.disposables
    );
  }

  static createOrShow(
    client: BackendClient,
    workspacePath: string
  ): ChatPanel {
    const column = vscode.ViewColumn.Beside;

    if (ChatPanel.currentPanel) {
      ChatPanel.currentPanel.panel.reveal(column);
      return ChatPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      "genai.chat",
      "Project Chat",
      column,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    ChatPanel.currentPanel = new ChatPanel(panel, client, workspacePath);
    return ChatPanel.currentPanel;
  }

  private handleMessage(msg: { type: string; message?: string }): void {
    console.log('[ChatPanel] handleMessage received:', msg.type, msg.message);
    if (msg.type === "send" && msg.message) {
      this.sendMessage(msg.message);
    }
  }

  private sendMessage(userMessage: string): void {
    // Add user message to history and UI
    this.history.push({ role: "user", content: userMessage });
    this.panel.webview.postMessage({ type: "userMessage", text: userMessage });
    this.panel.webview.postMessage({ type: "assistantStart" });

    let fullResponse = "";

    this.client.chatStreamCallback(
      userMessage,
      this.workspacePath,
      this.history.slice(-10),
      (token) => {
        fullResponse += token;
        this.panel.webview.postMessage({ type: "token", text: token });
      },
      () => {
        this.history.push({ role: "assistant", content: fullResponse });
        this.panel.webview.postMessage({ type: "done" });
      },
      (err) => {
        this.panel.webview.postMessage({
          type: "error",
          message: err.message,
        });
      }
    );
  }

  private getHtml(): string {
    const workspaceShort = this.workspacePath.split(/[/\\]/).pop() || this.workspacePath;
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .header {
      padding: 12px 16px;
      background: var(--vscode-titleBar-activeBackground);
      color: var(--vscode-titleBar-activeForeground);
      border-bottom: 1px solid var(--vscode-panel-border);
      flex-shrink: 0;
    }
    .header h2 { font-size: 1em; }
    .header small { opacity: 0.7; }
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
      line-height: 1.5;
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
      background: var(--vscode-sideBar-background);
      border: 1px solid var(--vscode-panel-border);
      align-self: flex-start;
      border-radius: 8px 8px 8px 2px;
    }
    .message.assistant p { margin: 4px 0; }
    .message.assistant ul, .message.assistant ol { padding-left: 20px; margin: 4px 0 8px; }
    .message.assistant li { margin: 3px 0; }
    .message.assistant h3 { font-size: 1em; margin: 10px 0 4px; color: var(--vscode-textLink-foreground); }
    .message.assistant h4 { font-size: 0.95em; margin: 8px 0 4px; }
    .message.assistant code { background: var(--vscode-textCodeBlock-background); padding: 1px 4px; border-radius: 3px; font-family: monospace; font-size: 0.9em; }
    .message.assistant pre { background: var(--vscode-terminal-background); padding: 10px 12px; border-radius: 4px; overflow-x: auto; margin: 8px 0; }
    .message.assistant pre code { background: none; padding: 0; font-size: 0.85em; }
    .message.error {
      background: var(--vscode-inputValidation-errorBackground);
      border: 1px solid var(--vscode-inputValidation-errorBorder);
      color: var(--vscode-inputValidation-errorForeground);
      align-self: flex-start;
    }
    .cursor { display: inline-block; width: 2px; height: 1em; background: currentColor; animation: blink 1s step-end infinite; vertical-align: middle; }
    @keyframes blink { 50% { opacity: 0; } }
    .welcome {
      text-align: center;
      color: var(--vscode-descriptionForeground);
      margin: auto;
      padding: 40px;
    }
    .welcome h3 { margin-bottom: 8px; }
    .suggestions { display: flex; flex-direction: column; gap: 8px; margin-top: 16px; }
    .suggestion-btn {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: 1px solid var(--vscode-button-border, var(--vscode-panel-border));
      padding: 8px 12px;
      border-radius: 4px;
      cursor: pointer;
      text-align: left;
      font-size: 0.9em;
    }
    .suggestion-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .input-area {
      padding: 12px 16px;
      border-top: 1px solid var(--vscode-panel-border);
      display: flex;
      gap: 8px;
      flex-shrink: 0;
    }
    textarea {
      flex: 1;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      border-radius: 4px;
      padding: 8px 12px;
      font-family: inherit;
      font-size: inherit;
      resize: none;
      outline: none;
      min-height: 40px;
      max-height: 120px;
    }
    textarea:focus { border-color: var(--vscode-focusBorder); }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      padding: 8px 14px;
      cursor: pointer;
      font-size: 1em;
      align-self: flex-end;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
  </style>
</head>
<body>
  <div class="header">
    <h2>Project Chat</h2>
    <small>${workspaceShort}</small>
  </div>

  <div class="messages" id="messages">
    <div class="welcome" id="welcome">
      <h3>Ask anything about your project</h3>
      <p>I have full context of <strong>${workspaceShort}</strong></p>
      <div class="suggestions">
        <button class="suggestion-btn">What does this project do?</button>
        <button class="suggestion-btn">What are the main entry points?</button>
        <button class="suggestion-btn">What dependencies does this project use?</button>
        <button class="suggestion-btn">Where should I look to understand the AI pipeline?</button>
      </div>
    </div>
  </div>

  <div class="input-area">
    <textarea id="input" placeholder="Ask about your project..." rows="1"></textarea>
    <button id="sendBtn">Send</button>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const messagesEl = document.getElementById('messages');
    const input = document.getElementById('input');
    const sendBtn = document.getElementById('sendBtn');
    let currentAssistantEl = null;
    let isStreaming = false;
    let fullResponse = '';

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });

    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });

    function send() {
      const text = input.value.trim();
      console.log('[chat] send() called, text=', text, 'isStreaming=', isStreaming);
      if (!text || isStreaming) return;
      console.log('[chat] posting message to extension host');
      vscode.postMessage({ type: 'send', message: text });
      input.value = '';
      input.style.height = 'auto';
    }

    sendBtn.addEventListener('click', () => { console.log('[chat] sendBtn clicked'); send(); });

    document.querySelectorAll('.suggestion-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (isStreaming) return;
        const text = btn.textContent;
        vscode.postMessage({ type: 'send', message: text });
        const welcome = document.getElementById('welcome');
        if (welcome) welcome.remove();
      });
    });

    function scrollToBottom() {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    window.addEventListener('message', (event) => {
      const msg = event.data;
      console.log('[chat] received message from host:', msg.type);

      if (msg.type === 'userMessage') {
        const welcome = document.getElementById('welcome');
        if (welcome) welcome.remove();
        const el = document.createElement('div');
        el.className = 'message user';
        el.textContent = msg.text;
        messagesEl.appendChild(el);
        scrollToBottom();
      }

      if (msg.type === 'assistantStart') {
        isStreaming = true;
        sendBtn.disabled = true;
        currentAssistantEl = document.createElement('div');
        currentAssistantEl.className = 'message assistant';
        currentAssistantEl.innerHTML = '<span class="cursor"></span>';
        messagesEl.appendChild(currentAssistantEl);
        scrollToBottom();
      }

      if (msg.type === 'token' && currentAssistantEl) {
        fullResponse += msg.text;
        // Show raw text while streaming so user sees progress
        const cursor = currentAssistantEl.querySelector('.cursor');
        if (cursor) {
          cursor.insertAdjacentText('beforebegin', msg.text);
        } else {
          currentAssistantEl.appendChild(document.createTextNode(msg.text));
        }
        scrollToBottom();
      }

      if (msg.type === 'done') {
        isStreaming = false;
        sendBtn.disabled = false;
        if (currentAssistantEl) {
          // Replace raw streamed text with rendered markdown
          currentAssistantEl.innerHTML = renderMarkdown(fullResponse);
        }
        fullResponse = '';
        currentAssistantEl = null;
        scrollToBottom();
      }

      if (msg.type === 'error') {
        isStreaming = false;
        sendBtn.disabled = false;
        const el = document.createElement('div');
        el.className = 'message error';
        el.textContent = 'Error: ' + msg.message;
        messagesEl.appendChild(el);
        scrollToBottom();
      }
    });
    function escapeHtml(str) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function inlineFormat(text) {
      return escapeHtml(text)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/\`([^\`]+)\`/g, '<code>$1</code>');
    }

    function renderMarkdown(text) {
      const lines = text.split('\n');
      const html = [];
      let inList = false;
      let listTag = 'ul';
      let inCode = false;
      let codeLang = '';
      let codeLines = [];

      for (const raw of lines) {
        const line = raw.trimEnd();

        // Code fence open/close
        if (/^\`\`\`/.test(line)) {
          if (!inCode) {
            if (inList) { html.push('</' + listTag + '>'); inList = false; }
            inCode = true;
            codeLang = line.slice(3).trim();
            codeLines = [];
          } else {
            html.push('<pre><code>' + codeLines.map(escapeHtml).join('\n') + '</code></pre>');
            inCode = false;
            codeLines = [];
          }
          continue;
        }
        if (inCode) { codeLines.push(line); continue; }

        if (/^## (.+)/.test(line)) {
          if (inList) { html.push('</' + listTag + '>'); inList = false; }
          html.push('<h3>' + inlineFormat(line.replace(/^## /, '')) + '</h3>');
        } else if (/^### (.+)/.test(line)) {
          if (inList) { html.push('</' + listTag + '>'); inList = false; }
          html.push('<h4>' + inlineFormat(line.replace(/^### /, '')) + '</h4>');
        } else if (/^[-*] (.+)/.test(line)) {
          if (!inList || listTag !== 'ul') { if (inList) html.push('</' + listTag + '>'); html.push('<ul>'); inList = true; listTag = 'ul'; }
          html.push('<li>' + inlineFormat(line.replace(/^[-*] /, '')) + '</li>');
        } else if (/^\d+\. (.+)/.test(line)) {
          if (!inList || listTag !== 'ol') { if (inList) html.push('</' + listTag + '>'); html.push('<ol>'); inList = true; listTag = 'ol'; }
          html.push('<li>' + inlineFormat(line.replace(/^\d+\. /, '')) + '</li>');
        } else if (line.trim() === '') {
          if (inList) { html.push('</' + listTag + '>'); inList = false; }
        } else {
          if (inList) { html.push('</' + listTag + '>'); inList = false; }
          html.push('<p>' + inlineFormat(line) + '</p>');
        }
      }
      if (inCode) html.push('<pre><code>' + codeLines.map(escapeHtml).join('\n') + '</code></pre>');
      if (inList) html.push('</' + listTag + '>');
      return html.join('\n');
    }
  </script>
</body>
</html>`;
  }

  dispose(): void {
    ChatPanel.currentPanel = undefined;
    this.panel.dispose();
    this.disposables.forEach(d => d.dispose());
  }
}
