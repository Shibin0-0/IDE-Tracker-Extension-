import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { Server } from "node:http";
import path from "node:path";
import os from "node:os";
import { describe, it, beforeEach, afterEach } from "node:test";
import { TrackerManager, resolveDbPath } from "./tracker-manager.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns an unused TCP port by binding to :0 and immediately releasing it. */
function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (!addr || typeof addr === "string") {
        srv.close(() => reject(new Error("Could not determine port")));
        return;
      }
      const { port } = addr;
      srv.close(() => resolve(port));
    });
  });
}

/** Starts a minimal HTTP server to occupy a port (simulates an already-running tracker). */
function occupyPort(port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const srv = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
    });
    srv.once("error", reject);
    srv.listen(port, "127.0.0.1", () => {
      srv.off("error", reject);
      resolve(srv);
    });
  });
}

function closeServer(srv: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    srv.close((err) => (err ? reject(err) : resolve()));
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TrackerManager", () => {
  let port: number;
  let manager: TrackerManager;

  beforeEach(async () => {
    port = await getFreePort();
    manager = new TrackerManager({
      host: "127.0.0.1",
      port,
      databasePath: ":memory:", // Use in-memory SQLite so tests are isolated and fast
    });
  });

  afterEach(async () => {
    // Always stop, even if the test failed mid-way.
    await manager.stop();
  });

  it("starts successfully and reports status=started", async () => {
    const result = await manager.start();
    assert.equal(result.status, "started");
    if (result.status === "started") {
      assert.equal(result.port, port);
    }
    assert.equal(manager.isRunning, true);
  });

  it("returns already_running when called twice on same manager", async () => {
    const first = await manager.start();
    assert.equal(first.status, "started");

    const second = await manager.start();
    assert.equal(second.status, "already_running");
    if (second.status === "already_running") {
      assert.equal(second.port, port);
    }
    // Only one instance should be running.
    assert.equal(manager.isRunning, true);
  });

  it("returns already_running when port is already occupied", async () => {
    // Simulate an existing tracker by occupying the port with a plain HTTP server.
    const blocker = await occupyPort(port);
    try {
      const result = await manager.start();
      assert.equal(result.status, "already_running");
      if (result.status === "already_running") {
        assert.equal(result.port, port);
      }
      // The manager must NOT count itself as the owner.
      assert.equal(manager.isRunning, false);
    } finally {
      await closeServer(blocker);
    }
  });

  it("stops cleanly after starting", async () => {
    await manager.start();
    assert.equal(manager.isRunning, true);

    await manager.stop();
    assert.equal(manager.isRunning, false);
  });

  it("stop() is safe to call multiple times", async () => {
    await manager.start();
    await manager.stop();
    // Second stop should not throw.
    await assert.doesNotReject(() => manager.stop());
    assert.equal(manager.isRunning, false);
  });

  it("stop() is safe to call without ever starting", async () => {
    await assert.doesNotReject(() => manager.stop());
    assert.equal(manager.isRunning, false);
  });

  it("can restart after stop", async () => {
    const first = await manager.start();
    assert.equal(first.status, "started");
    await manager.stop();

    const second = await manager.start();
    assert.equal(second.status, "started");
    assert.equal(manager.isRunning, true);
  });

  it("HTTP /health endpoint is reachable while running", async () => {
    await manager.start();

    const response = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { status: string };
    assert.equal(body.status, "ok");
  });

  it("HTTP endpoint is not reachable after stop", async () => {
    await manager.start();
    await manager.stop();

    await assert.rejects(
      () => fetch(`http://127.0.0.1:${port}/health`),
      /fetch failed|ECONNREFUSED/i,
    );
  });
});

// ---------------------------------------------------------------------------
// resolveDbPath
// ---------------------------------------------------------------------------

describe("resolveDbPath", () => {
  it("returns a path ending in ide-usage.db inside the given directory", () => {
    const mockUri = { fsPath: path.join(os.tmpdir(), "test-storage") };
    const result = resolveDbPath(mockUri);
    assert.ok(result.endsWith("ide-usage.db"));
    assert.ok(result.startsWith(mockUri.fsPath));
  });
});
