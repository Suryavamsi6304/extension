/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  moduleNameMapper: {
    // Stub vscode module — not available outside the extension host
    "^vscode$": "<rootDir>/src/__tests__/__mocks__/vscode.ts",
  },
};
