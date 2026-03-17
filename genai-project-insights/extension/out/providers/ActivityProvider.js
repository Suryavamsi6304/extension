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
exports.ActivityProvider = void 0;
const vscode = __importStar(require("vscode"));
const EVENT_ICONS = {
    created: new vscode.ThemeIcon("diff-added", new vscode.ThemeColor("gitDecoration.addedResourceForeground")),
    modified: new vscode.ThemeIcon("edit", new vscode.ThemeColor("gitDecoration.modifiedResourceForeground")),
    deleted: new vscode.ThemeIcon("diff-removed", new vscode.ThemeColor("gitDecoration.deletedResourceForeground")),
    moved: new vscode.ThemeIcon("diff-renamed"),
};
class ActivityTreeItem extends vscode.TreeItem {
    constructor(item) {
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
class ActivityProvider {
    constructor(client) {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.items = [];
        this.refreshInterval = null;
        this.client = client;
    }
    getTreeItem(element) {
        return element;
    }
    getChildren() {
        return this.items.slice().reverse().map(item => new ActivityTreeItem(item));
    }
    startAutoRefresh(intervalMs = 5000) {
        this.refreshInterval = setInterval(() => this.refresh(), intervalMs);
    }
    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }
    async refresh() {
        try {
            this.items = await this.client.getActivity(50);
            this._onDidChangeTreeData.fire();
        }
        catch {
            // Silently fail if backend is not ready
        }
    }
    dispose() {
        this.stopAutoRefresh();
        this._onDidChangeTreeData.dispose();
    }
}
exports.ActivityProvider = ActivityProvider;
function getTimeAgo(timestamp) {
    const diff = Date.now() - new Date(timestamp).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1)
        return "just now";
    if (mins < 60)
        return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24)
        return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}
//# sourceMappingURL=ActivityProvider.js.map