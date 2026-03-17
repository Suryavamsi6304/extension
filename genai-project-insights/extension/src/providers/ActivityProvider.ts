import * as vscode from "vscode";
import { BackendClient } from "../backendClient";
import type { ActivityItem } from "../types";

const EVENT_ICONS: Record<string, vscode.ThemeIcon> = {
  created: new vscode.ThemeIcon("diff-added", new vscode.ThemeColor("gitDecoration.addedResourceForeground")),
  modified: new vscode.ThemeIcon("edit", new vscode.ThemeColor("gitDecoration.modifiedResourceForeground")),
  deleted: new vscode.ThemeIcon("diff-removed", new vscode.ThemeColor("gitDecoration.deletedResourceForeground")),
  moved: new vscode.ThemeIcon("diff-renamed"),
};

class ActivityTreeItem extends vscode.TreeItem {
  constructor(item: ActivityItem) {
    const fileName = item.path.split(/[/\\]/).pop() || item.path;
    const timeAgo = getTimeAgo(item.timestamp);
    super(`${fileName}`, vscode.TreeItemCollapsibleState.None);

    this.description = timeAgo;
    this.tooltip = `${item.event_type}: ${item.path}\n${new Date(item.timestamp).toLocaleTimeString()}`;
    this.iconPath = EVENT_ICONS[item.event_type] || new vscode.ThemeIcon("file");

    // Click to open file
    this.command = {
      command: "vscode.open",
      title: "Open File",
      arguments: [vscode.Uri.file(item.path)],
    };
  }
}

export class ActivityProvider implements vscode.TreeDataProvider<ActivityTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ActivityTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private items: ActivityItem[] = [];
  private client: BackendClient;
  private refreshInterval: NodeJS.Timer | null = null;

  constructor(client: BackendClient) {
    this.client = client;
  }

  getTreeItem(element: ActivityTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): ActivityTreeItem[] {
    return this.items.slice().reverse().map(item => new ActivityTreeItem(item));
  }

  startAutoRefresh(intervalMs = 5000): void {
    this.refreshInterval = setInterval(() => this.refresh(), intervalMs);
  }

  stopAutoRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval as NodeJS.Timeout);
      this.refreshInterval = null;
    }
  }

  async refresh(): Promise<void> {
    try {
      this.items = await this.client.getActivity(50);
      this._onDidChangeTreeData.fire();
    } catch {
      // Silently fail if backend is not ready
    }
  }

  dispose(): void {
    this.stopAutoRefresh();
    this._onDidChangeTreeData.dispose();
  }
}

function getTimeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
