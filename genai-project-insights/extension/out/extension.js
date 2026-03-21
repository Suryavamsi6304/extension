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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const serverManager_1 = require("./serverManager");
const backendClient_1 = require("./backendClient");
const OverviewPanel_1 = require("./panels/OverviewPanel");
const ChatPanel_1 = require("./panels/ChatPanel");
const ExplainPanel_1 = require("./panels/ExplainPanel");
const GitInsightsPanel_1 = require("./panels/GitInsightsPanel");
const ActivityProvider_1 = require("./providers/ActivityProvider");
const TodoProvider_1 = require("./providers/TodoProvider");
let serverManager;
let client;
let activityProvider;
let todoProvider;
let statusBarItem;
async function activate(context) {
    const outputChannel = vscode.window.createOutputChannel("GenAI Insights Backend");
    context.subscriptions.push(outputChannel);
    // Read config
    const cfg = vscode.workspace.getConfiguration("genai");
    const port = cfg.get("backendPort", 8765);
    const autoStart = cfg.get("autoStartBackend", true);
    // Create client
    client = new backendClient_1.BackendClient(port, outputChannel);
    // Status bar
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = "genai.pickProvider";
    setStatusBar("starting");
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);
    // Server manager
    serverManager = new serverManager_1.ServerManager(context.extensionPath, port, outputChannel);
    context.subscriptions.push({ dispose: () => serverManager?.dispose() });
    if (autoStart) {
        serverManager.ensureRunning().then(() => {
            setStatusBar("ready");
            const workspacePath = getWorkspacePath();
            if (workspacePath) {
                client?.startWatching(workspacePath).catch(() => { });
                activityProvider?.startAutoRefresh();
            }
        }).catch((err) => {
            setStatusBar("error");
            outputChannel.appendLine(`[Extension] Backend start failed: ${err.message}`);
        });
    }
    else {
        setStatusBar("stopped");
    }
    // Tree view providers
    const workspacePath = getWorkspacePath();
    if (workspacePath && client) {
        activityProvider = new ActivityProvider_1.ActivityProvider(client);
        todoProvider = new TodoProvider_1.TodoProvider(client, workspacePath);
        context.subscriptions.push(vscode.window.registerTreeDataProvider("genai.activityView", activityProvider), vscode.window.registerTreeDataProvider("genai.todoView", todoProvider));
        context.subscriptions.push(activityProvider, todoProvider);
    }
    // ─── Commands ─────────────────────────────────────────────────────────────
    // 1. Scan & Summarize Project
    context.subscriptions.push(vscode.commands.registerCommand("genai.scanProject", async () => {
        if (!ensureClient())
            return;
        const wp = getWorkspacePath();
        if (!wp) {
            vscode.window.showErrorMessage("GenAI: No workspace folder open.");
            return;
        }
        await serverManager?.onReady.catch(() => { });
        const panel = OverviewPanel_1.OverviewPanel.createOrShow(context);
        await panel.loadData(client, wp);
    }));
    // 2. Explain Selected Code
    context.subscriptions.push(vscode.commands.registerCommand("genai.explainCode", async () => {
        if (!ensureClient())
            return;
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage("GenAI: Open a file and select code to explain.");
            return;
        }
        const selection = editor.selection;
        const code = editor.document.getText(selection.isEmpty ? undefined : selection);
        if (!code.trim()) {
            vscode.window.showInformationMessage("GenAI: Select some code to explain.");
            return;
        }
        await serverManager?.onReady.catch(() => { });
        const panel = ExplainPanel_1.ExplainPanel.createOrShow();
        await panel.loadExplanation(client, code, editor.document.languageId, editor.document.fileName);
    }));
    // 3. Open Chat
    context.subscriptions.push(vscode.commands.registerCommand("genai.openChat", async () => {
        if (!ensureClient())
            return;
        const wp = getWorkspacePath();
        if (!wp) {
            vscode.window.showErrorMessage("GenAI: No workspace folder open.");
            return;
        }
        await serverManager?.onReady.catch(() => { });
        ChatPanel_1.ChatPanel.createOrShow(client, wp);
    }));
    // 4. Git Insights
    context.subscriptions.push(vscode.commands.registerCommand("genai.gitInsights", async () => {
        if (!ensureClient())
            return;
        const wp = getWorkspacePath();
        if (!wp) {
            vscode.window.showErrorMessage("GenAI: No workspace folder open.");
            return;
        }
        await serverManager?.onReady.catch(() => { });
        const panel = GitInsightsPanel_1.GitInsightsPanel.createOrShow();
        await panel.loadData(client, wp);
    }));
    // 5. Find TODOs
    context.subscriptions.push(vscode.commands.registerCommand("genai.findTodos", async () => {
        if (!ensureClient())
            return;
        const wp = getWorkspacePath();
        if (!wp) {
            vscode.window.showErrorMessage("GenAI: No workspace folder open.");
            return;
        }
        await serverManager?.onReady.catch(() => { });
        vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "GenAI: Scanning for TODOs..." }, async () => {
            await todoProvider?.refresh();
            const count = todoProvider?.count ?? 0;
            vscode.window.showInformationMessage(`GenAI: Found ${count} TODO/FIXME items. Check the sidebar.`);
        });
    }));
    // 6. Switch Provider
    context.subscriptions.push(vscode.commands.registerCommand("genai.pickProvider", async () => {
        const providers = ["groq", "gemini", "pluralsight", "anthropic", "openai", "ollama"];
        const current = vscode.workspace.getConfiguration("genai").get("provider", "pluralsight");
        const picked = await vscode.window.showQuickPick(providers.map(p => ({
            label: p,
            description: p === current ? "(current)" : "",
            picked: p === current,
        })), { title: "Select AI Provider", placeHolder: "Choose your AI provider" });
        if (picked) {
            await vscode.workspace.getConfiguration("genai").update("provider", picked.label, vscode.ConfigurationTarget.Global);
            setStatusBar("ready");
            vscode.window.showInformationMessage(`GenAI: Switched to ${picked.label}`);
        }
    }));
    // 7. Start/Restart Backend (manual)
    context.subscriptions.push(vscode.commands.registerCommand("genai.startBackend", async () => {
        setStatusBar("starting");
        try {
            await serverManager?.restart();
            setStatusBar("ready");
            vscode.window.showInformationMessage("GenAI: Backend restarted successfully.");
        }
        catch (err) {
            setStatusBar("error");
            vscode.window.showErrorMessage(`GenAI: Failed to start backend: ${err}`);
        }
    }));
    outputChannel.appendLine("[Extension] GenAI Project Insights activated.");
}
function deactivate() {
    serverManager?.dispose();
    activityProvider?.dispose();
    todoProvider?.dispose();
}
function getWorkspacePath() {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}
function ensureClient() {
    if (!client) {
        vscode.window.showErrorMessage("GenAI: Extension not fully initialized.");
        return false;
    }
    return true;
}
function setStatusBar(state) {
    if (!statusBarItem)
        return;
    const cfg = vscode.workspace.getConfiguration("genai");
    const provider = cfg.get("provider", "anthropic");
    switch (state) {
        case "starting":
            statusBarItem.text = "$(loading~spin) GenAI: starting...";
            statusBarItem.tooltip = "GenAI Insights backend is starting";
            statusBarItem.backgroundColor = undefined;
            break;
        case "ready":
            statusBarItem.text = `$(sparkle) GenAI: ${provider}`;
            statusBarItem.tooltip = `GenAI Insights ready — provider: ${provider}\nClick to switch provider`;
            statusBarItem.backgroundColor = undefined;
            break;
        case "error":
            statusBarItem.text = "$(error) GenAI: error";
            statusBarItem.tooltip = "GenAI backend failed to start. Check output channel.";
            statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
            break;
        case "stopped":
            statusBarItem.text = "$(circle-slash) GenAI: stopped";
            statusBarItem.tooltip = "GenAI backend is not running. Run 'GenAI: Start Backend Server'.";
            statusBarItem.backgroundColor = undefined;
            break;
    }
}
//# sourceMappingURL=extension.js.map