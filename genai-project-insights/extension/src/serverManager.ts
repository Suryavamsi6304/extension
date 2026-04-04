import * as vscode from "vscode";
import * as cp from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as http from "http";
import * as net from "net";

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

    // Refuse to spawn if something else is already bound to the port
    const portBusy = await this.isPortInUse();
    if (portBusy) {
      const msg = `Port ${this.port} is already in use by another process. Stop it or change the port in settings.`;
      this.outputChannel.appendLine(`[ServerManager] ERROR: ${msg}`);
      this.readyReject(new Error(msg));
      vscode.window.showErrorMessage(`GenAI Insights: ${msg}`);
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
      // On Windows SIGTERM is not a real signal — kill() without args calls TerminateProcess
      if (process.platform === "win32") {
        this.process.kill();
      } else {
        this.process.kill("SIGTERM");
      }
      this.process = null;
      await sleep(500);
    } else {
      // Kill any orphaned process on the port
      await this.killPortProcess();
    }

    await this.start();
  }

  /** Returns true if something is already listening on the port. */
  private isPortInUse(): Promise<boolean> {
    return new Promise((resolve) => {
      const probe = net.createServer();
      probe.once("error", (err: NodeJS.ErrnoException) => {
        resolve(err.code === "EADDRINUSE");
      });
      probe.once("listening", () => {
        probe.close(() => resolve(false));
      });
      probe.listen(this.port, "127.0.0.1");
    });
  }

  private killPortProcess(): Promise<void> {
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

  /** Verify that the resolved Python binary actually runs. */
  private verifyPython(pythonPath: string): boolean {
    try {
      cp.execFileSync(pythonPath, ["--version"], { stdio: "ignore", timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  private async start(): Promise<void> {
    const backendDir = path.join(this.extensionPath, "backend");

    if (!fs.existsSync(backendDir)) {
      const msg = `Backend directory not found: ${backendDir}`;
      this.outputChannel.appendLine(`[ServerManager] ERROR: ${msg}`);
      this.readyReject(new Error(msg));
      return;
    }

    // Ensure venv exists — create + install deps on first run
    await this.ensureVenv(backendDir);

    const pythonPath = this.resolvePython();

    if (!this.verifyPython(pythonPath)) {
      const msg = `Python not found (tried "${pythonPath}"). Install Python 3.9+ or set "genai.pythonPath" in VS Code settings.`;
      this.outputChannel.appendLine(`[ServerManager] ERROR: ${msg}`);
      this.readyReject(new Error(msg));
      vscode.window.showErrorMessage(`GenAI Insights: ${msg}`, "Open Settings").then(
        (choice) => {
          if (choice === "Open Settings") {
            vscode.commands.executeCommand(
              "workbench.action.openSettings",
              "genai.pythonPath"
            );
          }
        }
      );
      return;
    }

    this.outputChannel.appendLine(
      `[ServerManager] Starting backend: ${pythonPath} (port ${this.port})`
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
      this.outputChannel.appendLine(`[Backend Error] ${data.toString().trim()}`);
    });

    this.process.on("exit", (code) => {
      this.outputChannel.appendLine(
        `[ServerManager] Backend exited with code ${code}`
      );
      const wasReady = this._isReady;
      this._isReady = false;
      this.process = null;
      if (wasReady && code !== 0) {
        this.notifyUnexpectedExit(code);
      }
    });

    this.process.on("error", (err) => {
      this.outputChannel.appendLine(
        `[ServerManager] Failed to start: ${err.message}`
      );
      this.readyReject(err);
    });

    // Poll until healthy — exponential backoff, max 10 attempts
    await this.waitForHealthy(10);
  }

  private async waitForHealthy(maxAttempts: number): Promise<void> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Stop polling immediately if the process already died
      if (!this.process) {
        return;
      }

      const healthy = await this.checkHealth();
      if (healthy) {
        this._isReady = true;
        this.readyResolve();
        this.outputChannel.appendLine(
          `[ServerManager] Backend ready on port ${this.port}`
        );
        return;
      }

      if (attempt < maxAttempts - 1) {
        // Exponential backoff: 500 ms × 1.5^attempt, capped at 3 s
        const delay = Math.min(500 * Math.pow(1.5, attempt), 3000);
        this.outputChannel.appendLine(
          `[ServerManager] Health check ${attempt + 1}/${maxAttempts} failed — retrying in ${Math.round(delay)}ms`
        );
        await sleep(delay);
      }
    }

    // All attempts exhausted — kill the hung process and report
    if (this.process) {
      this.outputChannel.appendLine(
        `[ServerManager] Backend did not respond after ${maxAttempts} attempts — killing process`
      );
      this.process.kill();
      this.process = null;
      const err = new Error(
        `Backend did not become healthy after ${maxAttempts} attempts. Check the "GenAI Insights Backend" output channel.`
      );
      this.readyReject(err);
      vscode.window.showErrorMessage(`GenAI Insights: ${err.message}`);
    }
  }

  private notifyUnexpectedExit(code: number | null): void {
    const msg = `Backend process exited unexpectedly (code ${code ?? "unknown"}).`;
    this.outputChannel.appendLine(`[ServerManager] ${msg}`);
    vscode.window.showErrorMessage(`GenAI Insights: ${msg}`, "Show Logs").then(
      (choice) => {
        if (choice === "Show Logs") {
          this.outputChannel.show();
        }
      }
    );
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

  /**
   * Create a virtualenv and install requirements on first run.
   * Skips if .venv already exists or if the user configured a custom pythonPath.
   */
  private async ensureVenv(backendDir: string): Promise<void> {
    const configured = vscode.workspace
      .getConfiguration("genai")
      .get<string>("pythonPath", "");

    // If the user pointed to their own interpreter, don't create a venv
    if (configured && configured.trim()) {
      return;
    }

    const venvDir = path.join(backendDir, ".venv");
    if (fs.existsSync(venvDir)) {
      return;
    }

    const requirementsFile = path.join(backendDir, "requirements.txt");
    if (!fs.existsSync(requirementsFile)) {
      this.outputChannel.appendLine(
        "[ServerManager] No requirements.txt found — skipping venv creation"
      );
      return;
    }

    // Ask the user before installing
    const choice = await vscode.window.showInformationMessage(
      "GenAI Insights needs to install Python dependencies (one-time setup).",
      "Install Now",
      "Cancel"
    );
    if (choice !== "Install Now") {
      const msg =
        "Backend dependencies not installed. Install them manually or restart VS Code and accept the prompt.";
      this.outputChannel.appendLine(`[ServerManager] ${msg}`);
      this.readyReject(new Error(msg));
      return;
    }

    const systemPython = process.platform === "win32" ? "python" : "python3";

    // 1. Create venv
    this.outputChannel.appendLine(
      "[ServerManager] Creating virtual environment..."
    );
    try {
      await this.runCommand(systemPython, ["-m", "venv", venvDir]);
    } catch (err: any) {
      const msg = `Failed to create virtualenv: ${err.message}`;
      this.outputChannel.appendLine(`[ServerManager] ERROR: ${msg}`);
      this.readyReject(new Error(msg));
      return;
    }

    // 2. Install dependencies
    const pipPath =
      process.platform === "win32"
        ? path.join(venvDir, "Scripts", "pip.exe")
        : path.join(venvDir, "bin", "pip");

    this.outputChannel.appendLine(
      "[ServerManager] Installing dependencies — this may take a minute..."
    );
    try {
      await this.runCommand(pipPath, [
        "install",
        "-r",
        requirementsFile,
        "--quiet",
      ]);
      this.outputChannel.appendLine(
        "[ServerManager] Dependencies installed successfully"
      );
    } catch (err: any) {
      const msg = `Failed to install dependencies: ${err.message}`;
      this.outputChannel.appendLine(`[ServerManager] ERROR: ${msg}`);
      // Clean up partial venv so the next attempt retries from scratch
      fs.rmSync(venvDir, { recursive: true, force: true });
      this.readyReject(new Error(msg));
      return;
    }
  }

  /** Run a command and return a promise that resolves on success. */
  private runCommand(command: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = cp.spawn(command, args, {
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout?.on("data", (d: Buffer) =>
        this.outputChannel.appendLine(`[Setup] ${d.toString().trim()}`)
      );
      child.stderr?.on("data", (d: Buffer) =>
        this.outputChannel.appendLine(`[Setup] ${d.toString().trim()}`)
      );
      child.on("error", (err) => reject(err));
      child.on("close", (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`Command exited with code ${code}`))
      );
    });
  }

  private resolvePython(): string {
    const configured = vscode.workspace
      .getConfiguration("genai")
      .get<string>("pythonPath", "");

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

  dispose(): void {
    if (this.process) {
      this.outputChannel.appendLine("[ServerManager] Stopping backend...");
      if (process.platform === "win32") {
        this.process.kill();
      } else {
        this.process.kill("SIGTERM");
      }
      this.process = null;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
