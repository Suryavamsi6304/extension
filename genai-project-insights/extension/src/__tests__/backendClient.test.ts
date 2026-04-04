/**
 * Step 22 — Frontend: unit tests for BackendClient with mocked HTTP.
 *
 * Run:
 *   npm install --save-dev jest ts-jest @types/jest
 *   npx jest
 */
import * as http from "http";
import { BackendClient } from "../backendClient";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Spin up a tiny HTTP server that returns canned responses. */
function createMockServer(handler: http.RequestListener): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      resolve({ server, port: addr.port });
    });
  });
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

// ── Stub secrets / outputChannel ─────────────────────────────────────────────

const mockSecrets = {
  get: jest.fn().mockResolvedValue("test-key"),
  store: jest.fn(),
  delete: jest.fn(),
  onDidChange: jest.fn(),
} as any;

const mockOutput = {
  appendLine: jest.fn(),
  show: jest.fn(),
  dispose: jest.fn(),
} as any;

// ── Tests ────────────────────────────────────────────────────────────────────

describe("BackendClient", () => {
  let server: http.Server;
  let client: BackendClient;

  afterEach(async () => {
    client?.cancelChatStream();
    if (server) await closeServer(server);
  });

  test("health() returns parsed JSON", async () => {
    const body = { status: "ok", version: "1.0.0", provider: "groq", watching: null };
    ({ server, port: (undefined as any) } = await createMockServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    }));
    const port = (server.address() as any).port;
    client = new BackendClient(port, mockOutput, mockSecrets);

    const result = await client.health();
    expect(result).toEqual(body);
  });

  test("fetchJson rejects on HTTP 4xx with error message", async () => {
    ({ server } = await createMockServer((_req, res) => {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ detail: "Bad request" }));
    }));
    const port = (server.address() as any).port;
    client = new BackendClient(port, mockOutput, mockSecrets);

    await expect(client.health()).rejects.toThrow("Bad request");
  });

  test("fetchJson rejects on HTTP 500 with error field", async () => {
    ({ server } = await createMockServer((_req, res) => {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }));
    const port = (server.address() as any).port;
    client = new BackendClient(port, mockOutput, mockSecrets);

    await expect(client.health()).rejects.toThrow("Internal server error");
  });

  test("chatStreamCallback yields SSE tokens", (done) => {
    createMockServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write('data: {"token":"Hello"}\n\n');
      res.write('data: {"token":" World"}\n\n');
      res.write("data: [DONE]\n\n");
      res.end();
    }).then(({ server: s, port }) => {
      server = s;
      client = new BackendClient(port, mockOutput, mockSecrets);

      const tokens: string[] = [];
      client.chatStreamCallback(
        "hi",
        "/fake/path",
        [],
        (token) => tokens.push(token),
        () => {
          expect(tokens).toEqual(["Hello", " World"]);
          done();
        },
        (err) => done(err),
      );
    });
  });

  test("chatStreamCallback propagates SSE error", (done) => {
    createMockServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write('data: {"error":"Provider quota exceeded"}\n\n');
      res.end();
    }).then(({ server: s, port }) => {
      server = s;
      client = new BackendClient(port, mockOutput, mockSecrets);

      client.chatStreamCallback(
        "hi",
        "/fake/path",
        [],
        () => {},
        () => {},
        (err) => {
          expect(err.message).toBe("Provider quota exceeded");
          done();
        },
      );
    });
  });

  test("cancelChatStream aborts active request", (done) => {
    createMockServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      // Send one token then hang — simulates slow stream
      res.write('data: {"token":"partial"}\n\n');
      // Don't end — wait for client to abort
    }).then(({ server: s, port }) => {
      server = s;
      client = new BackendClient(port, mockOutput, mockSecrets);

      const tokens: string[] = [];
      client.chatStreamCallback(
        "hi",
        "/fake/path",
        [],
        (token) => {
          tokens.push(token);
          // Cancel after receiving the first token
          client.cancelChatStream();
        },
        () => done(),
        () => done(), // error on cancel is expected
      );
    });
  });
});
