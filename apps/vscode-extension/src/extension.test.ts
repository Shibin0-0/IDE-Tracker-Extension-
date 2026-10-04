import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, it } from "node:test";
import type * as vscode from "vscode";
import { activate, deactivate, getTrackerStatus, SOURCE_ID } from "./extension.js";

/**
 * Mock status bar item for testing.
 */
class MockStatusBarItem {
  text = "";
  tooltip = "";
  private disposed = false;

  show(): void {
    // Mock implementation
  }

  dispose(): void {
    this.disposed = true;
  }

  isDisposed(): boolean {
    return this.disposed;
  }
}

/**
 * Mock VS Code API for testing.
 */
function createMockVSCode(): {
  context: vscode.ExtensionContext;
  statusBarItem: MockStatusBarItem;
  disposables: Array<{ dispose: () => void }>;
} {
  const disposables: Array<{ dispose: () => void }> = [];

  const statusBarItem = new MockStatusBarItem();

  const context: vscode.ExtensionContext = {
    subscriptions: disposables,
  } as unknown as vscode.ExtensionContext;

  // Mock vscode.window.createStatusBarItem
  (globalThis as any).vscode = {
    window: {
      createStatusBarItem: () => statusBarItem,
    },
    StatusBarAlignment: {
      Right: 2,
    },
  };

  return { context, statusBarItem, disposables };
}

describe("Extension", () => {
  let testServer: Server;
  let testPort: number;

  beforeEach(async () => {
    testPort = 3210; // Use default tracker port

    testServer = createServer((_req, res) => {
      const url = _req.url ?? "/";

      if (url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }

      if (url === "/status") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            activeIde: "vscode",
            activeSessionId: 456,
          }),
        );
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not Found" }));
    });

    await new Promise<void>((resolve) => {
      testServer.listen(testPort, "127.0.0.1", resolve);
    });
  });

  afterEach(async () => {
    deactivate();

    await new Promise<void>((resolve, reject) => {
      testServer.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    // Clean up mock
    delete (globalThis as any).vscode;
  });

  describe("SOURCE_ID", () => {
    it("is set to vscode", () => {
      assert.equal(SOURCE_ID, "vscode");
    });
  });

  describe("activate", () => {
    it("creates and shows status bar item", async () => {
      const mock = createMockVSCode();

      activate(mock.context);

      // Allow async health check to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      assert.ok(mock.statusBarItem.text.length > 0);
      assert.ok(mock.statusBarItem.tooltip.length > 0);
    });

    it("registers disposables in context", () => {
      const mock = createMockVSCode();

      activate(mock.context);

      assert.ok(mock.disposables.length > 0);
    });

    it("updates status bar on successful health check", async () => {
      const mock = createMockVSCode();

      activate(mock.context);

      // Wait for health check to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      assert.ok(
        mock.statusBarItem.text.includes("IDE Tracker"),
        `Expected status bar text to include 'IDE Tracker', got: ${mock.statusBarItem.text}`,
      );
      assert.ok(
        mock.statusBarItem.tooltip.length > 0,
        "Expected tooltip to be set",
      );
    });
  });

  describe("deactivate", () => {
    it("cleans up resources without errors", () => {
      const mock = createMockVSCode();

      activate(mock.context);
      deactivate();

      // Should not throw
      assert.ok(true);
    });

    it("can be called multiple times safely", () => {
      const mock = createMockVSCode();

      activate(mock.context);
      deactivate();
      deactivate();
      deactivate();

      // Should not throw
      assert.ok(true);
    });
  });

  describe("getTrackerStatus", () => {
    it("returns tracker status when activated", async () => {
      const mock = createMockVSCode();

      activate(mock.context);

      const status = await getTrackerStatus();

      assert.ok(status !== null);
      if (status) {
        assert.equal(status.activeIde, "vscode");
        assert.equal(status.activeSessionId, 456);
      }

      deactivate();
    });

    it("returns null when not activated", async () => {
      const status = await getTrackerStatus();

      assert.equal(status, null);
    });

    it("returns null after deactivation", async () => {
      const mock = createMockVSCode();

      activate(mock.context);
      deactivate();

      const status = await getTrackerStatus();

      assert.equal(status, null);
    });
  });

  describe("tracker unavailable scenario", () => {
    it("handles tracker service unavailable gracefully", async () => {
      // Close the test server to simulate unavailable tracker
      await new Promise<void>((resolve, reject) => {
        testServer.close((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });

      const mock = createMockVSCode();

      // Should not throw even when tracker is unavailable
      activate(mock.context);

      // Wait for failed health check
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Status bar should show warning
      assert.ok(
        mock.statusBarItem.text.includes("warning") ||
          mock.statusBarItem.tooltip.includes("unavailable"),
        "Expected status bar to indicate unavailability",
      );

      deactivate();

      // Restart server for afterEach cleanup
      testServer = createServer((_req, res) => {
        res.writeHead(404);
        res.end();
      });
      await new Promise<void>((resolve) => {
        testServer.listen(testPort, "127.0.0.1", resolve);
      });
    });
  });
});
