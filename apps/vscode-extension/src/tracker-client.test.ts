/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createTrackerClient, type TrackerClient } from "./tracker-client.js";

describe("TrackerClient", () => {
  let testServer: Server;
  let testPort: number;
  let client: TrackerClient;

  beforeEach(async () => {
    // Use a random port for each test to avoid conflicts
    testPort = 41000 + Math.floor(Math.random() * 8000);

    testServer = createServer((req, res) => {
      const url = req.url ?? "/";
      const [pathname] = url.split("?");

      if (pathname === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }

      if (pathname === "/status") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            activeIde: "vscode",
            activeSessionId: 123,
          }),
        );
        return;
      }

      if (pathname === "/status-null") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            activeIde: null,
            activeSessionId: null,
          }),
        );
        return;
      }

      if (pathname === "/usage") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            date: "2026-10-04",
            byIde: { vscode: 3600, antigravity: 1800 },
            totalSeconds: 5400,
          }),
        );
        return;
      }

      if (pathname === "/usage-empty") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            date: "2026-10-04",
            byIde: { vscode: 0, antigravity: 0 },
            totalSeconds: 0,
          }),
        );
        return;
      }

      if (pathname === "/error") {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal Server Error" }));
        return;
      }

      if (pathname === "/not-found") {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not Found" }));
        return;
      }

      if (pathname === "/invalid-json") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("not valid json");
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not Found" }));
    });

    await new Promise<void>((resolve) => {
      testServer.listen(testPort, "127.0.0.1", resolve);
    });

    client = createTrackerClient({
      host: "127.0.0.1",
      port: testPort,
      timeout: 2000,
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      testServer.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  });

  describe("checkHealth", () => {
    it("returns success when tracker service is healthy", async () => {
      const result = await client.checkHealth();

      assert.equal(result.success, true);
      if (result.success) {
        assert.deepEqual(result.data, { status: "ok" });
      }
    });

    it("returns failure when connection fails", async () => {
      const badClient = createTrackerClient({
        host: "127.0.0.1",
        port: 65432, // Port with no server
        timeout: 1000,
      });

      const result = await badClient.checkHealth();

      assert.equal(result.success, false);
      if (!result.success) {
        assert.ok(result.error.includes("Connection failed"));
      }
    });

    it("returns failure with timeout", async () => {
      const timeoutServer = createServer((_req, res) => {
        // Never respond to cause timeout
        setTimeout(() => {
          res.writeHead(200);
          res.end();
        }, 10000);
      });

      const timeoutPort = testPort + 1;
      await new Promise<void>((resolve) => {
        timeoutServer.listen(timeoutPort, "127.0.0.1", resolve);
      });

      const timeoutClient = createTrackerClient({
        host: "127.0.0.1",
        port: timeoutPort,
        timeout: 500,
      });

      const result = await timeoutClient.checkHealth();

      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.error, "Request timeout");
      }

      await new Promise<void>((resolve, reject) => {
        timeoutServer.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  });

  describe("getStatus", () => {
    it("returns success with active IDE status", async () => {
      const result = await client.getStatus();

      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.data.activeIde, "vscode");
        assert.equal(result.data.activeSessionId, 123);
      }
    });

    it("returns success with null status when no IDE is active", async () => {
      // Make request to /status-null endpoint
      const customClient = createTrackerClient({
        host: "127.0.0.1",
        port: testPort,
        timeout: 2000,
      });

      // Access private method through type assertion for testing
      const result = await (customClient as any).makeRequest("/status-null");

      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.data.activeIde, null);
        assert.equal(result.data.activeSessionId, null);
      }
    });

    it("returns failure when server returns error status", async () => {
      const result = await (client as any).makeRequest("/error");

      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.error, "Internal Server Error");
      }
    });

    it("returns failure when endpoint not found", async () => {
      const result = await (client as any).makeRequest("/not-found");

      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.error, "Not Found");
      }
    });

    it("returns failure when response is invalid JSON", async () => {
      const result = await (client as any).makeRequest("/invalid-json");

      assert.equal(result.success, false);
      if (!result.success) {
        assert.ok(result.error.includes("Failed to parse response"));
      }
    });
  });

  describe("getUsage", () => {
    it("returns success with today's usage data", async () => {
      const result = await client.getUsage();

      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.data.date, "2026-10-04");
        assert.deepEqual(result.data.byIde, { vscode: 3600, antigravity: 1800 });
        assert.equal(result.data.totalSeconds, 5400);
      }
    });

    it("returns success with empty usage data when no sessions exist", async () => {
      const result = await (client as any).makeRequest("/usage-empty");

      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.data.date, "2026-10-04");
        assert.deepEqual(result.data.byIde, { vscode: 0, antigravity: 0 });
        assert.equal(result.data.totalSeconds, 0);
      }
    });

    it("returns failure when server returns error status", async () => {
      const result = await (client as any).makeRequest("/error");

      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.error, "Internal Server Error");
      }
    });

    it("returns failure when endpoint not found", async () => {
      const result = await (client as any).makeRequest("/not-found");

      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.error, "Not Found");
      }
    });

    it("returns failure when response is invalid JSON", async () => {
      const result = await (client as any).makeRequest("/invalid-json");

      assert.equal(result.success, false);
      if (!result.success) {
        assert.ok(result.error.includes("Failed to parse response"));
      }
    });
  });

  describe("constructor", () => {
    it("uses default values when no config provided", () => {
      const defaultClient = createTrackerClient();

      assert.ok(defaultClient);
      // Verify defaults through successful connection
      assert.equal((defaultClient as any).host, "127.0.0.1");
      assert.equal((defaultClient as any).port, 3210);
      assert.equal((defaultClient as any).timeout, 5000);
    });

    it("accepts custom configuration", () => {
      const customClient = createTrackerClient({
        host: "127.0.0.1",
        port: 9999,
        timeout: 3000,
      });

      assert.equal((customClient as any).host, "127.0.0.1");
      assert.equal((customClient as any).port, 9999);
      assert.equal((customClient as any).timeout, 3000);
    });
  });
});
