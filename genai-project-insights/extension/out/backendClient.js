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
exports.BackendClient = void 0;
const vscode = __importStar(require("vscode"));
const http = __importStar(require("http"));
class BackendClient {
    constructor(port, outputChannel) {
        this.baseUrl = `http://127.0.0.1:${port}`;
        this.outputChannel = outputChannel;
    }
    getConfig() {
        const cfg = vscode.workspace.getConfiguration("genai");
        return {
            provider: cfg.get("provider", "anthropic"),
            anthropicKey: cfg.get("anthropicApiKey", ""),
            openaiKey: cfg.get("openaiApiKey", ""),
            geminiKey: cfg.get("geminiApiKey", ""),
        };
    }
    getApiKey(provider) {
        const cfg = this.getConfig();
        switch (provider) {
            case "anthropic": return cfg.anthropicKey;
            case "openai": return cfg.openaiKey;
            case "gemini": return cfg.geminiKey;
            default: return "";
        }
    }
    async fetchJson(method, path, body) {
        return new Promise((resolve, reject) => {
            const bodyStr = body ? JSON.stringify(body) : undefined;
            const url = new URL(this.baseUrl + path);
            const options = {
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
                        resolve(JSON.parse(data));
                    }
                    catch {
                        reject(new Error(`Invalid JSON response: ${data.slice(0, 200)}`));
                    }
                });
            });
            req.on("error", reject);
            if (bodyStr)
                req.write(bodyStr);
            req.end();
        });
    }
    async health() {
        return this.fetchJson("GET", "/health");
    }
    async getProviders() {
        return this.fetchJson("GET", "/providers");
    }
    async scanProject(workspacePath) {
        const cfg = this.getConfig();
        return this.fetchJson("POST", "/project/scan", {
            workspace_path: workspacePath,
            provider: cfg.provider,
            api_key: this.getApiKey(cfg.provider),
        });
    }
    async explainCode(code, language, filePath) {
        const cfg = this.getConfig();
        return this.fetchJson("POST", "/explain", {
            code,
            language,
            file_path: filePath,
            provider: cfg.provider,
            api_key: this.getApiKey(cfg.provider),
        });
    }
    async getGitInsights(workspacePath) {
        const cfg = this.getConfig();
        return this.fetchJson("POST", "/git/insights", {
            workspace_path: workspacePath,
            provider: cfg.provider,
            api_key: this.getApiKey(cfg.provider),
        });
    }
    async getActivity(limit = 50) {
        return this.fetchJson("GET", `/activity/recent?limit=${limit}`);
    }
    async startWatching(workspacePath) {
        await this.fetchJson("POST", `/activity/watch?workspace_path=${encodeURIComponent(workspacePath)}`);
    }
    async getTodos(workspacePath) {
        return this.fetchJson("POST", "/todos/scan", {
            workspace_path: workspacePath,
        });
    }
    /**
     * Stream chat via SSE — yields tokens as they arrive.
     * Returns an async generator that must be consumed.
     */
    async *chatStream(message, workspacePath, history) {
        const cfg = this.getConfig();
        const body = JSON.stringify({
            message,
            workspace_path: workspacePath,
            history,
            provider: cfg.provider,
            api_key: this.getApiKey(cfg.provider),
        });
        const buffer = await new Promise((resolve, reject) => {
            const url = new URL(this.baseUrl + "/chat");
            const options = {
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
                res.on("data", (chunk) => {
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
                if (data === "[DONE]")
                    break;
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.token) {
                        yield parsed.token;
                    }
                    else if (parsed.error) {
                        throw new Error(parsed.error);
                    }
                }
                catch {
                    // Skip malformed lines
                }
            }
        }
    }
    /**
     * True streaming chat using EventSource-compatible approach.
     * Calls onToken for each token, onDone when complete.
     */
    chatStreamCallback(message, workspacePath, history, onToken, onDone, onError) {
        const cfg = this.getConfig();
        const body = JSON.stringify({
            message,
            workspace_path: workspacePath,
            history,
            provider: cfg.provider,
            api_key: this.getApiKey(cfg.provider),
        });
        const url = new URL(this.baseUrl + "/chat");
        const options = {
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
        const req = http.request(options, (res) => {
            let partial = "";
            res.on("data", (chunk) => {
                partial += chunk.toString();
                const lines = partial.split("\n");
                partial = lines.pop() || "";
                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        const data = line.slice(6).trim();
                        if (data === "[DONE]") {
                            onDone();
                            return;
                        }
                        try {
                            const parsed = JSON.parse(data);
                            if (parsed.token) {
                                onToken(parsed.token);
                            }
                            else if (parsed.error) {
                                onError(new Error(parsed.error));
                            }
                        }
                        catch {
                            // Skip malformed lines
                        }
                    }
                }
            });
            res.on("end", onDone);
            res.on("error", onError);
        });
        req.on("error", onError);
        req.write(body);
        req.end();
    }
}
exports.BackendClient = BackendClient;
//# sourceMappingURL=backendClient.js.map