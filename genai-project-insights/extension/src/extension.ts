import * as vscode from "vscode";
import { ServerManager } from "./serverManager";
import { BackendClient } from "./backendClient";
import { OverviewPanel } from "./panels/OverviewPanel";
import { ChatPanel } from "./panels/ChatPanel";
import { ExplainPanel } from "./panels/ExplainPanel";
import { GitInsightsPanel } from "./panels/GitInsightsPanel";
import { ActivityProvider } from "./providers/ActivityProvider";
import { TodoProvider } from "./providers/TodoProvider";

let serverManager: ServerManager | undefined;
let client: BackendClient | undefined;
let activityProvider: ActivityProvider | undefined;
let todoProvider: TodoProvider | undefined;
let statusBarItem: vscode.StatusBarItem | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel("GenAI Insights Backend");
  context.subscriptions.push(outputChannel);

  // Read config
  const cfg = vscode.workspace.getConfiguration("genai");
  const port = cfg.get<number>("backendPort", 8765);
  const autoStart = cfg.get<boolean>("autoStartBackend", true);

  // Create client
  client = new BackendClient(port, outputChannel);

  // Status bar
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = "genai.pickProvider";
  setStatusBar("starting");
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Server manager
  serverManager = new ServerManager(context.extensionPath, port, outputChannel);
  context.subscriptions.push({ dispose: () => serverManager?.dispose() });

  if (autoStart) {
    serverManager.ensureRunning().then(() => {
      setStatusBar("ready");
      const workspacePath = getWorkspacePath();
      if (workspacePath) {
        client?.startWatching(workspacePath).catch(() => {});
        activityProvider?.startAutoRefresh();
      }
    }).catch((err) => {
      setStatusBar("error");
      outputChannel.appendLine(`[Extension] Backend start failed: ${err.message}`);
    });
  } else {
    setStatusBar("stopped");
  }

  // Tree view providers
  const workspacePath = getWorkspacePath();
  if (workspacePath && client) {
    activityProvider = new ActivityProvider(client);
    todoProvider = new TodoProvider(client, workspacePath);

    context.subscriptions.push(
      vscode.window.registerTreeDataProvider("genai.activityView", activityProvider),
      vscode.window.registerTreeDataProvider("genai.todoView", todoProvider)
    );

    context.subscriptions.push(activityProvider, todoProvider);
  }

  // ─── Commands ─────────────────────────────────────────────────────────────

  // 1. Scan & Summarize Project
  context.subscriptions.push(
    vscode.commands.registerCommand("genai.scanProject", async () => {
      if (!ensureClient()) return;
      const wp = getWorkspacePath();
      if (!wp) {
        vscode.window.showErrorMessage("GenAI: No workspace folder open.");
        return;
      }

      await serverManager?.onReady.catch(() => {});
      const panel = OverviewPanel.createOrShow(context);
      await panel.loadData(client!, wp);
    })
  );

  // 2. Explain Selected Code
  context.subscriptions.push(
    vscode.commands.registerCommand("genai.explainCode", async () => {
      if (!ensureClient()) return;
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage("GenAI: Open a file and select code to explain.");
        return;
      }

      const selection = editor.selection;
      const code = editor.document.getText(
        selection.isEmpty ? undefined : selection
      );

      if (!code.trim()) {
        vscode.window.showInformationMessage("GenAI: Select some code to explain.");
        return;
      }

      await serverManager?.onReady.catch(() => {});
      const panel = ExplainPanel.createOrShow();
      await panel.loadExplanation(
        client!,
        code,
        editor.document.languageId,
        editor.document.fileName
      );
    })
  );

  // 3. Open Chat
  context.subscriptions.push(
    vscode.commands.registerCommand("genai.openChat", async () => {
      if (!ensureClient()) return;
      const wp = getWorkspacePath();
      if (!wp) {
        vscode.window.showErrorMessage("GenAI: No workspace folder open.");
        return;
      }
      await serverManager?.onReady.catch(() => {});
      ChatPanel.createOrShow(client!, wp);
    })
  );

  // 4. Git Insights
  context.subscriptions.push(
    vscode.commands.registerCommand("genai.gitInsights", async () => {
      if (!ensureClient()) return;
      const wp = getWorkspacePath();
      if (!wp) {
        vscode.window.showErrorMessage("GenAI: No workspace folder open.");
        return;
      }
      await serverManager?.onReady.catch(() => {});
      const panel = GitInsightsPanel.createOrShow();
      await panel.loadData(client!, wp);
    })
  );

  // 5. Find TODOs
  context.subscriptions.push(
    vscode.commands.registerCommand("genai.findTodos", async () => {
      if (!ensureClient()) return;
      const wp = getWorkspacePath();
      if (!wp) {
        vscode.window.showErrorMessage("GenAI: No workspace folder open.");
        return;
      }
      await serverManager?.onReady.catch(() => {});

      vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "GenAI: Scanning for TODOs..." },
        async () => {
          await todoProvider?.refresh();
          const count = todoProvider?.count ?? 0;
          vscode.window.showInformationMessage(
            `GenAI: Found ${count} TODO/FIXME items. Check the sidebar.`
          );
        }
      );
    })
  );

  // 6. Switch Provider
  context.subscriptions.push(
    vscode.commands.registerCommand("genai.pickProvider", async () => {
      const providers = ["anthropic", "openai", "gemini", "ollama", "pluralsight"];
      const current = vscode.workspace.getConfiguration("genai").get<string>("provider", "pluralsight");

      const picked = await vscode.window.showQuickPick(
        providers.map(p => ({
          label: p,
          description: p === current ? "(current)" : "",
          picked: p === current,
        })),
        { title: "Select AI Provider", placeHolder: "Choose your AI provider" }
      );

      if (picked) {
        await vscode.workspace.getConfiguration("genai").update(
          "provider",
          picked.label,
          vscode.ConfigurationTarget.Global
        );
        setStatusBar("ready");
        vscode.window.showInformationMessage(
          `GenAI: Switched to ${picked.label}`
        );
      }
    })
  );

  // 7. Start/Restart Backend (manual)
  context.subscriptions.push(
    vscode.commands.registerCommand("genai.startBackend", async () => {
      setStatusBar("starting");
      try {
        await serverManager?.restart();
        setStatusBar("ready");
        vscode.window.showInformationMessage("GenAI: Backend restarted successfully.");
      } catch (err) {
        setStatusBar("error");
        vscode.window.showErrorMessage(`GenAI: Failed to start backend: ${err}`);
      }
    })
  );

  outputChannel.appendLine("[Extension] GenAI Project Insights activated.");
}

export function deactivate(): void {
  serverManager?.dispose();
  activityProvider?.dispose();
  todoProvider?.dispose();
}

function getWorkspacePath(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function ensureClient(): boolean {
  if (!client) {
    vscode.window.showErrorMessage("GenAI: Extension not fully initialized.");
    return false;
  }
  return true;
}

function setStatusBar(state: "starting" | "ready" | "error" | "stopped"): void {
  if (!statusBarItem) return;
  const cfg = vscode.workspace.getConfiguration("genai");
  const provider = cfg.get<string>("provider", "anthropic");

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
