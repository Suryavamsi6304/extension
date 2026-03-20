import * as vscode from "vscode";
import * as http from "http";
import * as https from "https";
import type {
  ProjectOverview,
  ExplainResult,
  GitInsights,
  ActivityItem,
  HealthResponse,
  ProvidersResponse,
  ChatMessage,
} from "./types";

export class BackendClient {
  private baseUrl: string;
  private outputChannel: vscode.OutputChannel;

  constructor(port: number, outputChannel: vscode.OutputChannel) {
    this.baseUrl = `http://127.0.0.1:${port}`;
    this.outputChannel = outputChannel;
  }

  private getConfig() {
    const cfg = vscode.workspace.getConfiguration("genai");
    return {
      provider: cfg.get<string>("provider", ""),
      geminiKey: cfg.get<string>("geminiApiKey", ""),
      pluralsightKey: cfg.get<string>("pluralsightApiKey", ""),
    };
  }

  private getApiKey(provider: string): string {
    const cfg = this.getConfig();
    switch (provider) {
      case "gemini": return cfg.geminiKey;
      case "pluralsight": return cfg.pluralsightKey;
      default: return "";
    }
  }

  private async fetchJson<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const bodyStr = body ? JSON.stringify(body) : undefined;
      const url = new URL(this.baseUrl + path);

      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          ...(bodyStr ? { "Content-Length": Buffer.byteLength(bodyStr) } : {}),
        },
      };

      const req = http.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data) as T);
          } catch {
            reject(new Error(`Invalid JSON response: ${data.slice(0, 200)}`));
          }
        });
      });

      req.on("error", reject);
      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  }

  async health(): Promise<HealthResponse> {
    return this.fetchJson<HealthResponse>("GET", "/health");
  }

  async getProviders(): Promise<ProvidersResponse> {
    return this.fetchJson<ProvidersResponse>("GET", "/providers");
  }

  async scanProject(workspacePath: string): Promise<ProjectOverview> {
    const cfg = this.getConfig();
    const provider = cfg.provider || null;
    const api_key = provider ? this.getApiKey(provider) || null : null;
    return this.fetchJson<ProjectOverview>("POST", "/project/scan", {
      workspace_path: workspacePath,
      provider,
      api_key,
    });
  }

  async explainCode(
    code: string,
    language: string,
    filePath: string
  ): Promise<ExplainResult> {
    const cfg = this.getConfig();
    const provider = cfg.provider || null;
    const api_key = provider ? this.getApiKey(provider) || null : null;
    return this.fetchJson<ExplainResult>("POST", "/explain", {
      code,
      language,
      file_path: filePath,
      provider,
      api_key,
    });
  }

  async getGitInsights(workspacePath: string): Promise<GitInsights> {
    const cfg = this.getConfig();
    const provider = cfg.provider || null;
    const api_key = provider ? this.getApiKey(provider) || null : null;
    return this.fetchJson<GitInsights>("POST", "/git/insights", {
      workspace_path: workspacePath,
      provider,
      api_key,
    });
  }

  async getActivity(limit = 50): Promise<ActivityItem[]> {
    return this.fetchJson<ActivityItem[]>("GET", `/activity/recent?limit=${limit}`);
  }

  async startWatching(workspacePath: string): Promise<void> {
    await this.fetchJson("POST", `/activity/watch?workspace_path=${encodeURIComponent(workspacePath)}`);
  }

  async getTodos(workspacePath: string): Promise<{
    total: number;
    by_tag: Record<string, unknown[]>;
    all: unknown[];
  }> {
    return this.fetchJson("POST", "/todos/scan", {
      workspace_path: workspacePath,
    });
  }

  /**
   * Stream chat via SSE — yields tokens as they arrive.
   * Returns an async generator that must be consumed.
   */
  async *chatStream(
    message: string,
    workspacePath: string,
    history: ChatMessage[]
  ): AsyncGenerator<string> {
    const cfg = this.getConfig();
    const provider = cfg.provider || null;
    const api_key = provider ? this.getApiKey(provider) || null : null;
    const body = JSON.stringify({
      message,
      workspace_path: workspacePath,
      history,
      provider,
      api_key,
    });

    const buffer = await new Promise<string>((resolve, reject) => {
      const url = new URL(this.baseUrl + "/chat");
      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "text/event-stream",
          "Content-Length": Buffer.byteLength(body),
        },
      };

      let fullBuffer = "";
      const req = http.request(options, (res) => {
        res.on("data", (chunk: Buffer) => {
          fullBuffer += chunk.toString();
        });
        res.on("end", () => resolve(fullBuffer));
        res.on("error", reject);
      });
      req.on("error", reject);
      req.write(body);
      req.end();
    });

    // Parse SSE events from buffer
    const lines = buffer.split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6).trim();
        if (data === "[DONE]") break;
        try {
          const parsed = JSON.parse(data);
          if (parsed.token) {
            yield parsed.token as string;
          } else if (parsed.error) {
            throw new Error(parsed.error);
          }
        } catch {
          // Skip malformed lines
        }
      }
    }
  }

  /**
   * True streaming chat using EventSource-compatible approach.
   * Calls onToken for each token, onDone when complete.
   */
  chatStreamCallback(
    message: string,
    workspacePath: string,
    history: ChatMessage[],
    onToken: (token: string) => void,
    onDone: () => void,
    onError: (error: Error) => void
  ): void {
    const cfg = this.getConfig();
    const provider = cfg.provider || null;
    const api_key = provider ? this.getApiKey(provider) || null : null;
    const body = JSON.stringify({
      message,
      workspace_path: workspacePath,
      history,
      provider,
      api_key,
    });

    const url = new URL(this.baseUrl + "/chat");
    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    let doneCalled = false;
    const callDoneOnce = () => { if (!doneCalled) { doneCalled = true; onDone(); } };

    const req = http.request(options, (res) => {
      let partial = "";

      res.on("data", (chunk: Buffer) => {
        partial += chunk.toString();
        const lines = partial.split("\n");
        partial = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") {
              callDoneOnce();
              return;
            }
            try {
              const parsed = JSON.parse(data);
              if (parsed.token) {
                onToken(parsed.token);
              } else if (parsed.error) {
                onError(new Error(parsed.error));
              }
            } catch {
              // Skip malformed lines
            }
          }
        }
      });

      res.on("end", callDoneOnce);
      res.on("error", onError);
    });

    req.on("error", onError);
    req.write(body);
    req.end();
  }
}
