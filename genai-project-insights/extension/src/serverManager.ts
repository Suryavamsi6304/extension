import * as vscode from "vscode";
import * as cp from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as http from "http";

export class ServerManager {
  private process: cp.ChildProcess | null = null;
  private outputChannel: vscode.OutputChannel;
  private port: number;
  private extensionPath: string;
  private _isReady = false;
  private readyPromise: Promise<void>;
  private readyResolve!: () => void;
  private readyReject!: (e: Error) => void;

  constructor(
    extensionPath: string,
    port: number,
    outputChannel: vscode.OutputChannel
  ) {
    this.extensionPath = extensionPath;
    this.port = port;
    this.outputChannel = outputChannel;
    this.readyPromise = new Promise((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
  }

  get isReady(): boolean {
    return this._isReady;
  }

  get onReady(): Promise<void> {
    return this.readyPromise;
  }

  async ensureRunning(): Promise<void> {
    // Check if already running (from a previous session)
    const alreadyUp = await this.checkHealth();
    if (alreadyUp) {
      this._isReady = true;
      this.readyResolve();
      this.outputChannel.appendLine(
        `[ServerManager] Backend already running on port ${this.port}`
      );
      return;
    }

    await this.start();
  }

  /** Kill existing backend and start fresh — picks up new .env settings */
  async restart(): Promise<void> {
    this.outputChannel.appendLine("[ServerManager] Restarting backend...");
    this._isReady = false;
    // Reset ready promise
    this.readyPromise = new Promise((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });

    // Kill existing process if we own it
    if (this.process) {
      this.process.kill("SIGTERM");
      this.process = null;
      await sleep(500);
    } else {
      // Kill any orphaned process on the port
      await this.killPortProcess();
    }

    await this.start();
  }

  private killPortProcess(): Promise<void> {
    return new Promise((resolve) => {
      // On Windows, find and kill process on our port
      const cmd = cp.spawn("cmd", [
        "/c",
        `for /f "tokens=5" %a in ('netstat -aon ^| findstr :${this.port}') do taskkill /F /PID %a`,
      ], { shell: true });
      cmd.on("close", () => resolve());
      setTimeout(resolve, 2000);
    });
  }

  private async start(): Promise<void> {
    const pythonPath = this.resolvePython();
    const backendDir = path.join(this.extensionPath, "backend");

    if (!fs.existsSync(backendDir)) {
      const msg = `Backend directory not found: ${backendDir}`;
      this.outputChannel.appendLine(`[ServerManager] ERROR: ${msg}`);
      this.readyReject(new Error(msg));
      return;
    }

    this.outputChannel.appendLine(
      `[ServerManager] Starting backend: ${pythonPath} main.py (port ${this.port})`
    );

    this.process = cp.spawn(
      pythonPath,
      [
        "-m", "uvicorn",
        "main:app",
        "--host", "127.0.0.1",
        "--port", String(this.port),
        "--log-level", "info",
      ],
      {
        cwd: backendDir,
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    this.process.stdout?.on("data", (data: Buffer) => {
      const text = data.toString().trim();
      this.outputChannel.appendLine(`[Backend] ${text}`);
    });

    this.process.stderr?.on("data", (data: Buffer) => {
      const text = data.toString().trim();
      this.outputChannel.appendLine(`[Backend] ${text}`);
    });

    this.process.on("exit", (code) => {
      this.outputChannel.appendLine(
        `[ServerManager] Backend exited with code ${code}`
      );
      this._isReady = false;
    });

    this.process.on("error", (err) => {
      this.outputChannel.appendLine(
        `[ServerManager] Failed to start: ${err.message}`
      );
      this.readyReject(err);
    });

    // Poll until healthy
    await this.waitForHealthy(30);
  }

  private async waitForHealthy(timeoutSeconds: number): Promise<void> {
    const deadline = Date.now() + timeoutSeconds * 1000;

    while (Date.now() < deadline) {
      await sleep(500);
      const healthy = await this.checkHealth();
      if (healthy) {
        this._isReady = true;
        this.readyResolve();
        this.outputChannel.appendLine(
          `[ServerManager] Backend ready on port ${this.port}`
        );
        return;
      }
    }

    const err = new Error(
      `Backend did not become healthy within ${timeoutSeconds}s. Check the "GenAI Insights Backend" output channel.`
    );
    this.readyReject(err);
    vscode.window.showErrorMessage(`GenAI Insights: ${err.message}`);
  }

  private checkHealth(): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get(
        `http://127.0.0.1:${this.port}/health`,
        { timeout: 2000 },
        (res) => {
          resolve(res.statusCode === 200);
        }
      );
      req.on("error", () => resolve(false));
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  private resolvePython(): string {
    const configured = vscode.workspace
      .getConfiguration("genai")
      .get<string>("pythonPath", "");

    if (configured && configured.trim()) {
      return configured.trim();
    }

    // Try common locations on Windows
    const candidates = [
      "python",
      "python3",
      "C:\\Python310\\python.exe",
      `C:\\Users\\${process.env.USERNAME}\\AppData\\Local\\Programs\\Python\\Python310\\python.exe`,
      `C:\\Users\\${process.env.USERNAME}\\AppData\\Local\\Programs\\Python\\Python311\\python.exe`,
      `C:\\Users\\${process.env.USERNAME}\\AppData\\Local\\Programs\\Python\\Python312\\python.exe`,
    ];

    // Return first found (we'll try 'python' and fall back)
    return "python";
  }

  dispose(): void {
    if (this.process) {
      this.outputChannel.appendLine("[ServerManager] Stopping backend...");
      this.process.kill("SIGTERM");
      this.process = null;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
