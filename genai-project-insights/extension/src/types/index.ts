export interface ProjectOverview {
  summary: string;
  tree: string;
  file_count: number;
  language_breakdown: Record<string, number>;
  dependencies: Record<string, string[]>;
  readme_preview: string;
}

export interface ExplainResult {
  explanation: string;
  complexity: "Low" | "Medium" | "High";
  key_points: string[];
  suggestions: string[];
}

export interface ActivityItem {
  event_type: string;
  path: string;
  timestamp: string;
}

export interface TodoItem {
  tag: string;
  text: string;
  file: string;
  line: number;
  context: string;
}

export interface CommitInfo {
  hash: string;
  author: string;
  date: string;
  message: string;
  files_changed: string[];
}

export interface GitInsights {
  branch: string;
  commits: CommitInfo[];
  uncommitted_changes: string[];
  ai_summary: string;
  error?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface HealthResponse {
  status: string;
  version: string;
  provider: string;
  watching: string | null;
}

export interface ProvidersResponse {
  current: string;
  available: Record<string, boolean>;
}

// Messages from extension to webview
export type ExtensionMessage =
  | { type: "overview"; data: ProjectOverview }
  | { type: "explain"; data: ExplainResult }
  | { type: "gitInsights"; data: GitInsights }
  | { type: "token"; text: string }
  | { type: "done" }
  | { type: "error"; message: string }
  | { type: "loading"; message: string };

// Messages from webview to extension
export type WebviewMessage =
  | { type: "scan"; workspacePath: string }
  | { type: "chat"; message: string; history: ChatMessage[] }
  | { type: "openFile"; path: string; line?: number }
  | { type: "refresh" };
