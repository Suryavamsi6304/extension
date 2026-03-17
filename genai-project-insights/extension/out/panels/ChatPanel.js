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
exports.ChatPanel = void 0;
const vscode = __importStar(require("vscode"));
class ChatPanel {
    constructor(panel, client, workspacePath) {
        this.disposables = [];
        this.history = [];
        this.panel = panel;
        this.client = client;
        this.workspacePath = workspacePath;
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        this.panel.webview.html = this.getHtml();
        // Handle messages from the webview
        this.panel.webview.onDidReceiveMessage((msg) => this.handleMessage(msg), null, this.disposables);
    }
    static createOrShow(client, workspacePath) {
        const column = vscode.ViewColumn.Beside;
        if (ChatPanel.currentPanel) {
            ChatPanel.currentPanel.panel.reveal(column);
            return ChatPanel.currentPanel;
        }
        const panel = vscode.window.createWebviewPanel("genai.chat", "Project Chat", column, { enableScripts: true, retainContextWhenHidden: true });
        ChatPanel.currentPanel = new ChatPanel(panel, client, workspacePath);
        return ChatPanel.currentPanel;
    }
    handleMessage(msg) {
        if (msg.type === "send" && msg.message) {
            this.sendMessage(msg.message);
        }
    }
    sendMessage(userMessage) {
        // Add user message to history and UI
        this.history.push({ role: "user", content: userMessage });
        this.panel.webview.postMessage({ type: "userMessage", text: userMessage });
        this.panel.webview.postMessage({ type: "assistantStart" });
        let fullResponse = "";
        this.client.chatStreamCallback(userMessage, this.workspacePath, this.history.slice(-10), (token) => {
            fullResponse += token;
            this.panel.webview.postMessage({ type: "token", text: token });
        }, () => {
            this.history.push({ role: "assistant", content: fullResponse });
            this.panel.webview.postMessage({ type: "done" });
        }, (err) => {
            this.panel.webview.postMessage({
                type: "error",
                message: err.message,
            });
        });
    }
    getHtml() {
        const workspaceShort = this.workspacePath.split(/[/\\]/).pop() || this.workspacePath;
        return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
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
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    .message.user {
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
        <button class="suggestion-btn" onclick="sendSuggestion(this)">What does this project do?</button>
        <button class="suggestion-btn" onclick="sendSuggestion(this)">What are the main entry points?</button>
        <button class="suggestion-btn" onclick="sendSuggestion(this)">What dependencies does this project use?</button>
        <button class="suggestion-btn" onclick="sendSuggestion(this)">Where should I look to understand the AI pipeline?</button>
      </div>
    </div>
  </div>

  <div class="input-area">
    <textarea id="input" placeholder="Ask about your project..." rows="1"></textarea>
    <button id="sendBtn" onclick="send()">Send</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const messagesEl = document.getElementById('messages');
    const input = document.getElementById('input');
    const sendBtn = document.getElementById('sendBtn');
    let currentAssistantEl = null;
    let isStreaming = false;

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
      if (!text || isStreaming) return;
      vscode.postMessage({ type: 'send', message: text });
      input.value = '';
      input.style.height = 'auto';
    }

    function sendSuggestion(btn) {
      if (isStreaming) return;
      const text = btn.textContent;
      vscode.postMessage({ type: 'send', message: text });
      document.getElementById('welcome').remove();
    }

    function scrollToBottom() {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    window.addEventListener('message', (event) => {
      const msg = event.data;

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
        const cursor = currentAssistantEl.querySelector('.cursor');
        const textNode = document.createTextNode(msg.text);
        if (cursor) {
          currentAssistantEl.insertBefore(textNode, cursor);
        } else {
          currentAssistantEl.appendChild(textNode);
        }
        scrollToBottom();
      }

      if (msg.type === 'done') {
        isStreaming = false;
        sendBtn.disabled = false;
        if (currentAssistantEl) {
          const cursor = currentAssistantEl.querySelector('.cursor');
          if (cursor) cursor.remove();
        }
        currentAssistantEl = null;
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
  </script>
</body>
</html>`;
    }
    dispose() {
        ChatPanel.currentPanel = undefined;
        this.panel.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}
exports.ChatPanel = ChatPanel;
//# sourceMappingURL=ChatPanel.js.map