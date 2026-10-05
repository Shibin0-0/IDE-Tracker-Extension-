import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { UsageTrackerService } from "../services/tracker.js";
import { createHttpServer, handleRequest } from "./server.js";

function makeStubTracker(
  activeIde: "vscode" | "antigravity" | null = null,
  activeSessionId: number | null = null,
  activeSessionStartedAt: string | null = null,
): UsageTrackerService {
  return {
    start(): void {},
    async stop(): Promise<void> {},
    getActiveIde: () => activeIde,
    getActiveSessionId: () => activeSessionId,
    getActiveSessionStartedAt: () => activeSessionStartedAt,
    getTodayUsage: () => ({
      byIde: { vscode: 3600, antigravity: 1800 },
      totalSeconds: 5400,
    }),
    getSessionsForDate: () => [],
    async recordEvent() {
      return { success: false, receivedCount: 0 };
    },
    async getActiveSessions() {
      return [];
    },
    async getDailySummary() {
      return null;
    },
  };
}

function createFakeIncomingMessage(
  method: string,
  url: string,
): IncomingMessage {
  return { method, url } as unknown as IncomingMessage;
}

function createFakeServerResponse(): {
  res: ServerResponse;
  statusCode: () => number;
  body: () => string;
  header: (name: string) => string | undefined;
} {
  let code = 0;
  let payload = "";
  const headers: Record<string, string> = {};

  const res = {
    headersSent: false,
    writeHead(status: number, hdrs?: Record<string, string | number>) {
      code = status;
      if (hdrs) {
        for (const [k, v] of Object.entries(hdrs)) {
          headers[k.toLowerCase()] = String(v);
        }
      }
      (res as { headersSent: boolean }).headersSent = true;
    },
    end(data?: string) {
      payload = data ?? "";
    },
  } as unknown as ServerResponse;

  return {
    res,
    statusCode: () => code,
    body: () => payload,
    header: (name: string) => headers[name.toLowerCase()],
  };
}

describe("handleRequest (Unit Tests)", () => {
  describe("GET /health", () => {
    it("returns 200 and expected status: ok JSON", () => {
      const tracker = makeStubTracker();
      const fake = createFakeServerResponse();

      handleRequest(tracker, createFakeIncomingMessage("GET", "/health"), fake.res);

      assert.equal(fake.statusCode(), 200);
      assert.deepEqual(JSON.parse(fake.body()), { status: "ok" });
      assert.equal(fake.header("content-type"), "application/json");
    });

    it("returns 405 for unsupported method on /health (POST, PUT, DELETE)", () => {
      for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
        const fake = createFakeServerResponse();
        handleRequest(makeStubTracker(), createFakeIncomingMessage(method, "/health"), fake.res);
        assert.equal(fake.statusCode(), 405);
        assert.deepEqual(JSON.parse(fake.body()), { error: "Method Not Allowed" });
        assert.equal(fake.header("content-type"), "application/json");
      }
    });

    it("handles query parameters on /health safely", () => {
      const tracker = makeStubTracker();
      const fake = createFakeServerResponse();

      handleRequest(tracker, createFakeIncomingMessage("GET", "/health?verbose=true"), fake.res);

      assert.equal(fake.statusCode(), 200);
      assert.deepEqual(JSON.parse(fake.body()), { status: "ok" });
    });
  });

  describe("GET /status", () => {
    it("returns activeIde and activeSessionId as null when no session is active", () => {
      const tracker = makeStubTracker(null, null, null);
      const fake = createFakeServerResponse();

      handleRequest(tracker, createFakeIncomingMessage("GET", "/status"), fake.res);

      assert.equal(fake.statusCode(), 200);
      assert.deepEqual(JSON.parse(fake.body()), {
        activeIde: null,
        activeSessionId: null,
        activeSessionStartedAt: null,
      });
      assert.equal(fake.header("content-type"), "application/json");
    });

    it("returns activeIde='vscode' and activeSessionId when VS Code is active", () => {
      const startedAt = "2026-10-05T17:30:00.000Z";
      const tracker = makeStubTracker("vscode", 101, startedAt);
      const fake = createFakeServerResponse();

      handleRequest(tracker, createFakeIncomingMessage("GET", "/status"), fake.res);

      assert.equal(fake.statusCode(), 200);
      assert.deepEqual(JSON.parse(fake.body()), {
        activeIde: "vscode",
        activeSessionId: 101,
        activeSessionStartedAt: startedAt,
      });
    });

    it("returns activeIde='antigravity' and activeSessionId when Antigravity is active", () => {
      const startedAt = "2026-10-05T17:25:00.000Z";
      const tracker = makeStubTracker("antigravity", 202, startedAt);
      const fake = createFakeServerResponse();

      handleRequest(tracker, createFakeIncomingMessage("GET", "/status"), fake.res);

      assert.equal(fake.statusCode(), 200);
      assert.deepEqual(JSON.parse(fake.body()), {
        activeIde: "antigravity",
        activeSessionId: 202,
        activeSessionStartedAt: startedAt,
      });
    });

    it("returns 405 for unsupported method on /status", () => {
      const fake = createFakeServerResponse();
      handleRequest(makeStubTracker(), createFakeIncomingMessage("POST", "/status"), fake.res);
      assert.equal(fake.statusCode(), 405);
      assert.deepEqual(JSON.parse(fake.body()), { error: "Method Not Allowed" });
    });
  });

  describe("GET /usage", () => {
    it("returns 200 with today's usage summary", () => {
      const tracker = makeStubTracker();
      const fake = createFakeServerResponse();

      handleRequest(tracker, createFakeIncomingMessage("GET", "/usage"), fake.res);

      assert.equal(fake.statusCode(), 200);
      const response = JSON.parse(fake.body());
      const expectedDate = new Date().toISOString().split("T")[0];
      assert.equal(response.date, expectedDate);
      assert.deepEqual(response.byIde, { vscode: 3600, antigravity: 1800 });
      assert.equal(response.totalSeconds, 5400);
      assert.equal(fake.header("content-type"), "application/json");
    });

    it("returns 405 for unsupported methods on /usage", () => {
      for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
        const fake = createFakeServerResponse();
        handleRequest(makeStubTracker(), createFakeIncomingMessage(method, "/usage"), fake.res);
        assert.equal(fake.statusCode(), 405);
        assert.deepEqual(JSON.parse(fake.body()), { error: "Method Not Allowed" });
        assert.equal(fake.header("content-type"), "application/json");
      }
    });
  });

  describe("Unknown routes and 404 handling", () => {
    it("returns 404 for unknown API paths", () => {
      const fake = createFakeServerResponse();
      handleRequest(makeStubTracker(), createFakeIncomingMessage("GET", "/unknown-api-endpoint"), fake.res);

      assert.equal(fake.statusCode(), 404);
      assert.deepEqual(JSON.parse(fake.body()), { error: "Not Found" });
      assert.equal(fake.header("content-type"), "application/json");
    });

    it("returns 404 for random invalid paths", () => {
      const fake = createFakeServerResponse();
      handleRequest(makeStubTracker(), createFakeIncomingMessage("POST", "/api/v2/foo"), fake.res);

      assert.equal(fake.statusCode(), 404);
      assert.deepEqual(JSON.parse(fake.body()), { error: "Not Found" });
    });
  });
});

describe("createHttpServer (Integration Tests over 127.0.0.1)", () => {
  let server: ReturnType<typeof createHttpServer>;
  let testPort: number;

  function makeClientRequest(
    method: string,
    path: string,
  ): Promise<{ statusCode: number; headers: Record<string, string | string[] | undefined>; body: string }> {
    return new Promise((resolve, reject) => {
      const req = httpRequest(
        {
          host: "127.0.0.1",
          port: testPort,
          path,
          method,
        },
        (res) => {
          let data = "";
          res.on("data", (chunk: Buffer) => {
            data += chunk.toString();
          });
          res.on("end", () => {
            resolve({
              statusCode: res.statusCode ?? 0,
              headers: res.headers,
              body: data,
            });
          });
        },
      );
      req.on("error", reject);
      req.end();
    });
  }

  beforeEach(async () => {
    testPort = 41000 + Math.floor(Math.random() * 8000);
    const tracker = makeStubTracker("vscode", 42);
    server = createHttpServer("127.0.0.1", testPort, tracker);
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  it("GET /health returns 200 and expected JSON", async () => {
    const res = await makeClientRequest("GET", "/health");
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["content-type"], "application/json");
    assert.deepEqual(JSON.parse(res.body), { status: "ok" });
  });

  it("GET /status returns current tracker state", async () => {
    const res = await makeClientRequest("GET", "/status");
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["content-type"], "application/json");
    assert.deepEqual(JSON.parse(res.body), {
      activeIde: "vscode",
      activeSessionId: 42,
    });
  });

  it("unknown route returns 404", async () => {
    const res = await makeClientRequest("GET", "/non-existent");
    assert.equal(res.statusCode, 404);
    assert.deepEqual(JSON.parse(res.body), { error: "Not Found" });
  });

  it("unsupported method returns 405", async () => {
    const res = await makeClientRequest("POST", "/health");
    assert.equal(res.statusCode, 405);
    assert.deepEqual(JSON.parse(res.body), { error: "Method Not Allowed" });
  });

  it("GET /usage returns 200 with today's usage data", async () => {
    const res = await makeClientRequest("GET", "/usage");
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["content-type"], "application/json");
    const body = JSON.parse(res.body);
    const expectedDate = new Date().toISOString().split("T")[0];
    assert.equal(body.date, expectedDate);
    assert.deepEqual(body.byIde, { vscode: 3600, antigravity: 1800 });
    assert.equal(body.totalSeconds, 5400);
  });

  it("POST /usage returns 405", async () => {
    const res = await makeClientRequest("POST", "/usage");
    assert.equal(res.statusCode, 405);
    assert.deepEqual(JSON.parse(res.body), { error: "Method Not Allowed" });
  });
});

