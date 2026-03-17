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
exports.TodoProvider = void 0;
const vscode = __importStar(require("vscode"));
const TAG_ICONS = {
    TODO: "$(circle-outline)",
    FIXME: "$(warning)",
    HACK: "$(tools)",
    BUG: "$(bug)",
    NOTE: "$(note)",
    XXX: "$(alert)",
};
const TAG_COLORS = {
    TODO: new vscode.ThemeColor("gitDecoration.modifiedResourceForeground"),
    FIXME: new vscode.ThemeColor("editorError.foreground"),
    HACK: new vscode.ThemeColor("editorWarning.foreground"),
    BUG: new vscode.ThemeColor("editorError.foreground"),
    NOTE: new vscode.ThemeColor("gitDecoration.addedResourceForeground"),
    XXX: new vscode.ThemeColor("editorWarning.foreground"),
};
class TagGroupItem extends vscode.TreeItem {
    constructor(tag, children) {
        super(`${tag} (${children.length})`, vscode.TreeItemCollapsibleState.Expanded);
        this.tag = tag;
        this.children = children;
        this.iconPath = new vscode.ThemeIcon("symbol-constant", TAG_COLORS[tag]);
        this.contextValue = "tagGroup";
    }
}
class TodoItem extends vscode.TreeItem {
    constructor(raw, workspacePath) {
        const label = raw.text || raw.file;
        super(label || `line ${raw.line}`, vscode.TreeItemCollapsibleState.None);
        this.raw = raw;
        this.workspacePath = workspacePath;
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
class TodoProvider {
    constructor(client, workspacePath) {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.groups = [];
        this.totalCount = 0;
        this.client = client;
        this.workspacePath = workspacePath;
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (!element)
            return this.groups;
        if (element instanceof TagGroupItem)
            return element.children;
        return [];
    }
    async refresh() {
        try {
            const result = await this.client.getTodos(this.workspacePath);
            const byTag = result.by_tag;
            this.totalCount = result.total;
            this.groups = Object.entries(byTag)
                .sort((a, b) => b[1].length - a[1].length)
                .map(([tag, todos]) => {
                const items = todos.map(t => new TodoItem(t, this.workspacePath));
                return new TagGroupItem(tag, items);
            });
            this._onDidChangeTreeData.fire();
        }
        catch {
            // Silently fail
        }
    }
    get count() {
        return this.totalCount;
    }
    dispose() {
        this._onDidChangeTreeData.dispose();
    }
}
exports.TodoProvider = TodoProvider;
//# sourceMappingURL=TodoProvider.js.map