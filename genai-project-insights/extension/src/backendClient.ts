import * as vscode from "vscode";
import * as http from "http";
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
  private secrets: vscode.SecretStorage;
  private _activeStreamReq: http.ClientRequest | null = null;
  private static readonly REQUEST_TIMEOUT_MS = 30_000;

  constructor(port: number, outputChannel: vscode.OutputChannel, secrets: vscode.SecretStorage) {
    this.baseUrl = `http://127.0.0.1:${port}`;
    this.outputChannel = outputChannel;
    this.secrets = secrets;
  }

  private getProvider(): string {
    return vscode.workspace.getConfiguration("genai").get<string>("provider", "groq");
  }

  private async resolveApiKey(provider: string): Promise<string> {
    return (await this.secrets.get(`${provider}-api-key`)) ?? "";
  }

  private async fetchJson<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const bodyStr = body ? JSON.stringify(body) : undefined;
      const url = new URL(this.baseUrl + path);

      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        timeout: BackendClient.REQUEST_TIMEOUT_MS,
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
            const parsed = JSON.parse(data);
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(parsed?.error ?? parsed?.detail ?? `HTTP ${res.statusCode}`));
            } else {
              resolve(parsed as T);
            }
          } catch {
            reject(new Error(`Invalid JSON response: ${data.slice(0, 200)}`));
          }
        });
      });

      req.on("timeout", () => {
        req.destroy();
        reject(new Error(`Request to ${method} ${path} timed out after ${BackendClient.REQUEST_TIMEOUT_MS / 1000}s`));
      });
      req.on("error", reject);
      if (bodyStr) req.write(bodyStr);
      req.end();
    }).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.outputChannel.appendLine(`[BackendClient] ${method} ${path} failed: ${msg}`);
      vscode.window.showErrorMessage(`GenAI Insights: ${msg}`);
      throw err;
    });
  }

  async health(): Promise<HealthResponse> {
    return this.fetchJson<HealthResponse>("GET", "/health");
  }

  async getProviders(): Promise<ProvidersResponse> {
    return this.fetchJson<ProvidersResponse>("GET", "/providers");
  }

  async scanProject(workspacePath: string): Promise<ProjectOverview> {
    const provider = this.getProvider() || null;
    const api_key = provider ? await this.resolveApiKey(provider) || null : null;
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
    const provider = this.getProvider() || null;
    const api_key = provider ? await this.resolveApiKey(provider) || null : null;
    return this.fetchJson<ExplainResult>("POST", "/explain", {
      code,
      language,
      file_path: filePath,
      provider,
      api_key,
    });
  }

  async getGitInsights(workspacePath: string): Promise<GitInsights> {
    const provider = this.getProvider() || null;
    const api_key = provider ? await this.resolveApiKey(provider) || null : null;
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
   * Stream chat via SSE — yields tokens as they arrive (true streaming).
   * Returns an async generator that must be consumed.
   */
  async *chatStream(
    message: string,
    workspacePath: string,
    history: ChatMessage[]
  ): AsyncGenerator<string> {
    const provider = this.getProvider() || null;
    const api_key = provider ? await this.resolveApiKey(provider) || null : null;
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

    // Get the response stream without waiting for it to complete
    const res = await new Promise<http.IncomingMessage>((resolve, reject) => {
      const req = http.request(options, resolve);
      req.setTimeout(BackendClient.REQUEST_TIMEOUT_MS, () => {
        req.destroy();
        reject(new Error("Chat stream connection timed out"));
      });
      req.on("error", reject);
      req.write(body);
      req.end();
    });

    // Process chunks as they arrive — true streaming
    let partial = "";
    for await (const chunk of res as AsyncIterable<Buffer>) {
      partial += chunk.toString();
      const lines = partial.split("\n");
      partial = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6).trim();
          if (data === "[DONE]") return;
          // Separate JSON parse errors from application errors
          let parsed: { token?: string; error?: string } | null = null;
          try {
            parsed = JSON.parse(data);
          } catch {
            continue; // Skip malformed SSE lines
          }
          if (parsed?.error) {
            throw new Error(parsed.error); // Propagate backend errors
          }
          if (parsed?.token) {
            yield parsed.token;
          }
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
    this._doStream(message, workspacePath, history, onToken, onDone, onError).catch(onError);
  }

  /** Cancel the active SSE stream (e.g. when the chat panel is disposed). */
  cancelChatStream(): void {
    if (this._activeStreamReq) {
      this._activeStreamReq.destroy();
      this._activeStreamReq = null;
    }
  }

  private async _doStream(
    message: string,
    workspacePath: string,
    history: ChatMessage[],
    onToken: (token: string) => void,
    onDone: () => void,
    onError: (error: Error) => void
  ): Promise<void> {
    const provider = this.getProvider() || null;
    const api_key = provider ? await this.resolveApiKey(provider) || null : null;
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
    const callDoneOnce = () => { if (!doneCalled) { doneCalled = true; this._activeStreamReq = null; onDone(); } };

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
      res.on("error", (err) => {
        this._activeStreamReq = null;
        onError(err);
      });
    });

    req.on("error", (err) => {
      this._activeStreamReq = null;
      onError(err);
    });

    this._activeStreamReq = req;
    req.write(body);
    req.end();
  }
}
