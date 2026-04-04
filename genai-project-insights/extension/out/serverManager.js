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
exports.ServerManager = void 0;
const vscode = __importStar(require("vscode"));
const cp = __importStar(require("child_process"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const http = __importStar(require("http"));
class ServerManager {
    constructor(extensionPath, port, outputChannel) {
        this.process = null;
        this._isReady = false;
        this.extensionPath = extensionPath;
        this.port = port;
        this.outputChannel = outputChannel;
        this.readyPromise = new Promise((resolve, reject) => {
            this.readyResolve = resolve;
            this.readyReject = reject;
        });
    }
    get isReady() {
        return this._isReady;
    }
    get onReady() {
        return this.readyPromise;
    }
    async ensureRunning() {
        // Check if already running (from a previous session)
        const alreadyUp = await this.checkHealth();
        if (alreadyUp) {
            this._isReady = true;
            this.readyResolve();
            this.outputChannel.appendLine(`[ServerManager] Backend already running on port ${this.port}`);
            return;
        }
        await this.start();
    }
    /** Kill existing backend and start fresh — picks up new .env settings */
    async restart() {
        this.outputChannel.appendLine("[ServerManager] Restarting backend...");
        this._isReady = false;
        // Reset ready promise
        this.readyPromise = new Promise((resolve, reject) => {
            this.readyResolve = resolve;
            this.readyReject = reject;
        });
        // Kill existing process if we own it
        if (this.process) {
            // On Windows SIGTERM is not a real signal — kill() without args calls TerminateProcess
            if (process.platform === "win32") {
                this.process.kill();
            }
            else {
                this.process.kill("SIGTERM");
            }
            this.process = null;
            await sleep(500);
        }
        else {
            // Kill any orphaned process on the port
            await this.killPortProcess();
        }
        await this.start();
    }
    killPortProcess() {
        return new Promise((resolve) => {
            // On Windows, find and kill process on our port.
            // Do NOT pass shell:true — we are already spawning cmd /c explicitly.
            const cmd = cp.spawn("cmd", [
                "/c",
                `for /f "tokens=5" %a in ('netstat -aon ^| findstr :${this.port}') do taskkill /F /PID %a`,
            ]);
            const timer = setTimeout(resolve, 2000);
            cmd.on("close", () => {
                clearTimeout(timer);
                resolve();
            });
        });
    }
    async start() {
        const pythonPath = this.resolvePython();
        const backendDir = path.join(this.extensionPath, "backend");
        if (!fs.existsSync(backendDir)) {
            const msg = `Backend directory not found: ${backendDir}`;
            this.outputChannel.appendLine(`[ServerManager] ERROR: ${msg}`);
            this.readyReject(new Error(msg));
            return;
        }
        this.outputChannel.appendLine(`[ServerManager] Starting backend: ${pythonPath} main.py (port ${this.port})`);
        this.process = cp.spawn(pythonPath, [
            "-m", "uvicorn",
            "main:app",
            "--host", "127.0.0.1",
            "--port", String(this.port),
            "--log-level", "info",
        ], {
            cwd: backendDir,
            env: { ...process.env },
            stdio: ["ignore", "pipe", "pipe"],
        });
        this.process.stdout?.on("data", (data) => {
            const text = data.toString().trim();
            this.outputChannel.appendLine(`[Backend] ${text}`);
        });
        this.process.stderr?.on("data", (data) => {
            const text = data.toString().trim();
            this.outputChannel.appendLine(`[Backend] ${text}`);
        });
        this.process.on("exit", (code) => {
            this.outputChannel.appendLine(`[ServerManager] Backend exited with code ${code}`);
            this._isReady = false;
            this.process = null;
        });
        this.process.on("error", (err) => {
            this.outputChannel.appendLine(`[ServerManager] Failed to start: ${err.message}`);
            this.readyReject(err);
        });
        // Poll until healthy
        await this.waitForHealthy(30);
    }
    async waitForHealthy(timeoutSeconds) {
        const deadline = Date.now() + timeoutSeconds * 1000;
        while (Date.now() < deadline) {
            await sleep(500);
            // If the process already exited (exit handler sets this.process = null),
            // stop polling immediately — readyReject was already called by "error" handler.
            if (!this.process) {
                return;
            }
            const healthy = await this.checkHealth();
            if (healthy) {
                this._isReady = true;
                this.readyResolve();
                this.outputChannel.appendLine(`[ServerManager] Backend ready on port ${this.port}`);
                return;
            }
        }
        // Only reject if the process is still running (i.e. the "error" handler
        // hasn't already rejected the promise and shown its own message).
        if (this.process) {
            const err = new Error(`Backend did not become healthy within ${timeoutSeconds}s. Check the "GenAI Insights Backend" output channel.`);
            this.readyReject(err);
            vscode.window.showErrorMessage(`GenAI Insights: ${err.message}`);
        }
    }
    checkHealth() {
        return new Promise((resolve) => {
            const req = http.get(`http://127.0.0.1:${this.port}/health`, { timeout: 2000 }, (res) => {
                resolve(res.statusCode === 200);
            });
            req.on("error", () => resolve(false));
            req.on("timeout", () => {
                req.destroy();
                resolve(false);
            });
        });
    }
    resolvePython() {
        const configured = vscode.workspace
            .getConfiguration("genai")
            .get("pythonPath", "");
        if (configured && configured.trim()) {
            return configured.trim();
        }
        // Prefer the venv bundled with the backend — it has all dependencies
        const backendDir = path.join(this.extensionPath, "backend");
        const venvPython = process.platform === "win32"
            ? path.join(backendDir, ".venv", "Scripts", "python.exe")
            : path.join(backendDir, ".venv", "bin", "python");
        if (fs.existsSync(venvPython)) {
            return venvPython;
        }
        // Fall back to system Python
        return process.platform === "win32" ? "python" : "python3";
    }
    dispose() {
        if (this.process) {
            this.outputChannel.appendLine("[ServerManager] Stopping backend...");
            if (process.platform === "win32") {
                this.process.kill();
            }
            else {
                this.process.kill("SIGTERM");
            }
            this.process = null;
        }
    }
}
exports.ServerManager = ServerManager;
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
//# sourceMappingURL=serverManager.js.map