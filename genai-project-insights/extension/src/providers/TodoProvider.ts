import * as vscode from "vscode";
import { BackendClient } from "../backendClient";

const TAG_ICONS: Record<string, string> = {
  TODO: "$(circle-outline)",
  FIXME: "$(warning)",
  HACK: "$(tools)",
  BUG: "$(bug)",
  NOTE: "$(note)",
  XXX: "$(alert)",
};

const TAG_COLORS: Record<string, vscode.ThemeColor> = {
  TODO: new vscode.ThemeColor("gitDecoration.modifiedResourceForeground"),
  FIXME: new vscode.ThemeColor("editorError.foreground"),
  HACK: new vscode.ThemeColor("editorWarning.foreground"),
  BUG: new vscode.ThemeColor("editorError.foreground"),
  NOTE: new vscode.ThemeColor("gitDecoration.addedResourceForeground"),
  XXX: new vscode.ThemeColor("editorWarning.foreground"),
};

interface RawTodo {
  tag: string;
  text: string;
  file: string;
  line: number;
  context: string;
}

class TagGroupItem extends vscode.TreeItem {
  constructor(
    public readonly tag: string,
    public readonly children: TodoItem[]
  ) {
    super(`${tag} (${children.length})`, vscode.TreeItemCollapsibleState.Expanded);
    this.iconPath = new vscode.ThemeIcon("symbol-constant", TAG_COLORS[tag]);
    this.contextValue = "tagGroup";
  }
}

class TodoItem extends vscode.TreeItem {
  constructor(
    private readonly raw: RawTodo,
    private readonly workspacePath: string
  ) {
    const label = raw.text || raw.file;
    super(label || `line ${raw.line}`, vscode.TreeItemCollapsibleState.None);

    this.description = `${raw.file}:${raw.line}`;
    this.tooltip = raw.context;
    this.iconPath = new vscode.ThemeIcon("circle-small-filled", TAG_COLORS[raw.tag]);
    this.contextValue = "todoItem";

    // Click to jump to location
    const fullPath = vscode.Uri.file(`${workspacePath}/${raw.file}`);
    this.command = {
      command: "vscode.open",
      title: "Open",
      arguments: [
        fullPath,
        { selection: new vscode.Range(raw.line - 1, 0, raw.line - 1, 0) },
      ],
    };
  }
}

type TreeNode = TagGroupItem | TodoItem;

export class TodoProvider implements vscode.TreeDataProvider<TreeNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private groups: TagGroupItem[] = [];
  private totalCount = 0;
  private client: BackendClient;
  private workspacePath: string;

  constructor(client: BackendClient, workspacePath: string) {
    this.client = client;
    this.workspacePath = workspacePath;
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (!element) return this.groups;
    if (element instanceof TagGroupItem) return element.children;
    return [];
  }

  async refresh(): Promise<void> {
    try {
      const result = await this.client.getTodos(this.workspacePath);
      const byTag = result.by_tag as Record<string, RawTodo[]>;

      this.totalCount = result.total as number;
      this.groups = Object.entries(byTag)
        .sort((a, b) => b[1].length - a[1].length)
        .map(([tag, todos]) => {
          const items = todos.map(t => new TodoItem(t, this.workspacePath));
          return new TagGroupItem(tag, items);
        });

      this._onDidChangeTreeData.fire();
    } catch {
      // Silently fail
    }
  }

  get count(): number {
    return this.totalCount;
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}
