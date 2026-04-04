/**
 * Minimal vscode module stub for unit tests running outside the extension host.
 * Only the surfaces actually used by backendClient / panels are stubbed here.
 */

export const workspace = {
  getConfiguration: jest.fn().mockReturnValue({
    get: jest.fn().mockReturnValue(""),
  }),
};

export const window = {
  showErrorMessage: jest.fn().mockResolvedValue(undefined),
  showInformationMessage: jest.fn().mockResolvedValue(undefined),
  showWarningMessage: jest.fn().mockResolvedValue(undefined),
  createWebviewPanel: jest.fn(),
  createOutputChannel: jest.fn().mockReturnValue({
    appendLine: jest.fn(),
    show: jest.fn(),
    dispose: jest.fn(),
  }),
};

export const commands = {
  executeCommand: jest.fn(),
};

export const Uri = {
  file: jest.fn((f: string) => ({ fsPath: f, scheme: "file" })),
  parse: jest.fn((s: string) => ({ fsPath: s, scheme: "file" })),
};

export enum ViewColumn {
  One = 1,
  Two = 2,
  Beside = -2,
}

export class Disposable {
  dispose = jest.fn();
}
