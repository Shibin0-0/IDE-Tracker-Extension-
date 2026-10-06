// Mock VS Code API is provided by the mock vscode module in node_modules/vscode
// This import will use that mock instead of the real vscode module

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { StatusResponse, UsageResponse } from "@ide-usage-monitor/shared";
import type { ClientResult, TrackerClient } from "./tracker-client.js";
import { StatusBarManager } from "./status-bar-manager.js";

// Import the mock helper to access created status bar items
// eslint-disable-next-line @typescript-eslint/no-require-imports
const vscode = require("vscode");

/**
 * Creates a mock TrackerClient for testing.
 */
function createMockTrackerClient(
  statusResult: ClientResult<StatusResponse>,
  usageResult?: ClientResult<UsageResponse>,
): TrackerClient {
  return {
    getStatus: async () => statusResult,
    getUsage: async () =>
      usageResult ?? {
        success: true,
        data: {
          date: "2026-10-04",
          byIde: { vscode: 0, antigravity: 0 },
          totalSeconds: 0,
        },
      },
    checkHealth: async () => ({ success: true, data: { status: "ok" } }),
  } as TrackerClient;
}

describe("StatusBarManager", () => {
  let manager: StatusBarManager | null = null;

  afterEach(() => {
    if (manager) {
      manager.dispose();
      manager = null;
    }
  });

  function getMockStatusBarItem() {
    return vscode.getLastStatusBarItem();
  }

  describe("constructor and lifecycle", () => {
    it("creates status bar item on construction", () => {
      const client = createMockTrackerClient({
        success: true,
        data: { activeIde: null, activeSessionId: null },
      });

      manager = new StatusBarManager(client, 1000);

      // Verify status bar item was created and shown
      assert.ok(manager);
    });

    it("starts polling when start() is called", async () => {
      const client = createMockTrackerClient({
        success: true,
        data: { activeIde: "vscode", activeSessionId: 1 },
      });

      manager = new StatusBarManager(client, 100);
      manager.start();

      // Wait for initial update
      await new Promise((resolve) => setTimeout(resolve, 50));

      const item = getMockStatusBarItem();
      assert.ok(item.text.includes("VS Code"));
    });

    it("stops polling when dispose() is called", async () => {
      let callCount = 0;
      const client = {
        getStatus: async () => {
          callCount++;
          return {
            success: true,
            data: { activeIde: "vscode", activeSessionId: 1 },
          } as ClientResult<StatusResponse>;
        },
        getUsage: async () => ({
          success: true,
          data: {
            date: "2026-10-04",
            byIde: { vscode: 0, antigravity: 0 },
            totalSeconds: 0,
          },
        }),
        checkHealth: async () => ({ success: true, data: { status: "ok" } }),
      } as TrackerClient;

      manager = new StatusBarManager(client, 50);
      manager.start();

      // Wait for a few polls
      await new Promise((resolve) => setTimeout(resolve, 150));
      const countBeforeDispose = callCount;

      manager.dispose();
      manager = null;

      // Wait and verify no more calls
      await new Promise((resolve) => setTimeout(resolve, 150));
      assert.equal(callCount, countBeforeDispose);
    });
  });

  describe("status display", () => {
    it("shows active session with IDE name and session ID", async () => {
      const client = createMockTrackerClient({
        success: true,
        data: { activeIde: "vscode", activeSessionId: 42 },
      });

      manager = new StatusBarManager(client, 1000);
      manager.start();

      await new Promise((resolve) => setTimeout(resolve, 50));

      const item = getMockStatusBarItem();
      assert.match(item.text, /VS Code/);
      assert.match(item.tooltip, /Session 42/);
      assert.equal(item.backgroundColor, undefined);
    });

    it("shows idle state when no active session", async () => {
      const client = createMockTrackerClient({
        success: true,
        data: { activeIde: null, activeSessionId: null },
      });

      manager = new StatusBarManager(client, 1000);
      manager.start();

      await new Promise((resolve) => setTimeout(resolve, 50));

      assert.match(getMockStatusBarItem().text, /VS Code Idle/);
      assert.match(getMockStatusBarItem().tooltip, /VS Code is idle/);
      assert.equal(getMockStatusBarItem().backgroundColor, undefined);
    });

    it("shows offline state when tracker is unavailable", async () => {
      const client = createMockTrackerClient({
        success: false,
        error: "Connection failed: ECONNREFUSED",
      });

      manager = new StatusBarManager(client, 1000);
      manager.start();

      await new Promise((resolve) => setTimeout(resolve, 50));

      assert.match(getMockStatusBarItem().text, /VS Code Offline/);
      assert.match(getMockStatusBarItem().tooltip, /Tracker service unavailable/);
      assert.ok(getMockStatusBarItem().backgroundColor);
    });

    it("shows VS Code as active when vscode is the active IDE", async () => {
      const client = createMockTrackerClient({
        success: true,
        data: { activeIde: "vscode", activeSessionId: 1 },
      });

      manager = new StatusBarManager(client, 1000);
      manager.start();

      await new Promise((resolve) => setTimeout(resolve, 50));

      assert.match(getMockStatusBarItem().text, /VS Code · /);
      assert.match(getMockStatusBarItem().text, /\$\(circle-filled\)/);
    });

    it("shows VS Code as idle when another IDE is active", async () => {
      const client = createMockTrackerClient({
        success: true,
        data: { activeIde: "antigravity", activeSessionId: 1 },
      });

      manager = new StatusBarManager(client, 1000);
      manager.start();

      await new Promise((resolve) => setTimeout(resolve, 50));

      assert.match(getMockStatusBarItem().text, /VS Code Idle/);
      assert.match(getMockStatusBarItem().tooltip, /Active: Antigravity/);
    });
  });

  describe("polling behavior", () => {
    it("polls at specified interval", async () => {
      let callCount = 0;
      const client = {
        getStatus: async () => {
          callCount++;
          return {
            success: true,
            data: { activeIde: "vscode", activeSessionId: 1 },
          } as ClientResult<StatusResponse>;
        },
        getUsage: async () => ({
          success: true,
          data: {
            date: "2026-10-04",
            byIde: { vscode: 0, antigravity: 0 },
            totalSeconds: 0,
          },
        }),
        checkHealth: async () => ({ success: true, data: { status: "ok" } }),
      } as TrackerClient;

      manager = new StatusBarManager(client, 100);
      manager.start();

      // Initial call happens immediately
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.equal(callCount, 1);

      // Wait for 2 more poll intervals
      await new Promise((resolve) => setTimeout(resolve, 250));
      assert.ok(callCount >= 3);
    });

    it("updates display when status changes", async () => {
      let statusResponse: ClientResult<StatusResponse> = {
        success: true,
        data: { activeIde: null, activeSessionId: null },
      };

      const client = {
        getStatus: async () => statusResponse,
        getUsage: async () => ({
          success: true,
          data: {
            date: "2026-10-04",
            byIde: { vscode: 0, antigravity: 0 },
            totalSeconds: 0,
          },
        }),
        checkHealth: async () => ({ success: true, data: { status: "ok" } }),
      } as TrackerClient;

      manager = new StatusBarManager(client, 100);
      manager.start();

      // Wait for initial update
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.match(getMockStatusBarItem().text, /Idle/);

      // Change status
      statusResponse = {
        success: true,
        data: { activeIde: "vscode", activeSessionId: 10 },
      };

      // Wait for next poll
      await new Promise((resolve) => setTimeout(resolve, 150));
      assert.match(getMockStatusBarItem().text, /VS Code/);
    });
  });

  describe("error handling", () => {
    it("handles tracker going offline after being online", async () => {
      let statusResponse: ClientResult<StatusResponse> = {
        success: true,
        data: { activeIde: "vscode", activeSessionId: 1 },
      };

      const client = {
        getStatus: async () => statusResponse,
        getUsage: async () => ({
          success: true,
          data: {
            date: "2026-10-04",
            byIde: { vscode: 0, antigravity: 0 },
            totalSeconds: 0,
          },
        }),
        checkHealth: async () => ({ success: true, data: { status: "ok" } }),
      } as TrackerClient;

      manager = new StatusBarManager(client, 100);
      manager.start();

      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.match(getMockStatusBarItem().text, /VS Code/);

      // Tracker goes offline
      statusResponse = {
        success: false,
        error: "Connection refused",
      };

      await new Promise((resolve) => setTimeout(resolve, 150));
      assert.match(getMockStatusBarItem().text, /Offline/);
      assert.ok(getMockStatusBarItem().backgroundColor);
    });

    it("recovers when tracker comes back online", async () => {
      let statusResponse: ClientResult<StatusResponse> = {
        success: false,
        error: "Connection refused",
      };

      const client = {
        getStatus: async () => statusResponse,
        getUsage: async () => ({
          success: true,
          data: {
            date: "2026-10-04",
            byIde: { vscode: 0, antigravity: 0 },
            totalSeconds: 0,
          },
        }),
        checkHealth: async () => ({ success: true, data: { status: "ok" } }),
      } as TrackerClient;

      manager = new StatusBarManager(client, 100);
      manager.start();

      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.match(getMockStatusBarItem().text, /Offline/);

      // Tracker comes back online with another IDE active
      statusResponse = {
        success: true,
        data: { activeIde: "antigravity", activeSessionId: 5 },
      };

      await new Promise((resolve) => setTimeout(resolve, 150));
      assert.match(getMockStatusBarItem().text, /VS Code Idle/);
      assert.match(getMockStatusBarItem().tooltip, /Active: Antigravity/);
      assert.equal(getMockStatusBarItem().backgroundColor, undefined);
    });
  });

  describe("usage display", () => {
    it("shows zero usage as '0m'", async () => {
      const client = createMockTrackerClient(
        {
          success: true,
          data: { activeIde: "vscode", activeSessionId: 1 },
        },
        {
          success: true,
          data: {
            date: "2026-10-04",
            byIde: { vscode: 0, antigravity: 0 },
            totalSeconds: 0,
          },
        },
      );

      manager = new StatusBarManager(client, 1000);
      manager.start();

      await new Promise((resolve) => setTimeout(resolve, 50));

      assert.match(getMockStatusBarItem().text, /VS Code · 0m/);
    });

    it("shows minutes only for usage under an hour", async () => {
      const client = createMockTrackerClient(
        {
          success: true,
          data: { activeIde: "vscode", activeSessionId: 1 },
        },
        {
          success: true,
          data: {
            date: "2026-10-04",
            byIde: { vscode: 2700, antigravity: 0 }, // 45 minutes
            totalSeconds: 2700,
          },
        },
      );

      manager = new StatusBarManager(client, 1000);
      manager.start();

      await new Promise((resolve) => setTimeout(resolve, 50));

      assert.match(getMockStatusBarItem().text, /VS Code · 45m/);
    });

    it("shows hours and minutes for usage over an hour", async () => {
      const client = createMockTrackerClient(
        {
          success: true,
          data: { activeIde: "vscode", activeSessionId: 1 },
        },
        {
          success: true,
          data: {
            date: "2026-10-04",
            byIde: { vscode: 8040, antigravity: 0 }, // 2h 14m
            totalSeconds: 8040,
          },
        },
      );

      manager = new StatusBarManager(client, 1000);
      manager.start();

      await new Promise((resolve) => setTimeout(resolve, 50));

      assert.match(getMockStatusBarItem().text, /VS Code · 2h 14m/);
    });

    it("shows hours only when minutes are zero", async () => {
      const client = createMockTrackerClient(
        {
          success: true,
          data: { activeIde: "vscode", activeSessionId: 1 },
        },
        {
          success: true,
          data: {
            date: "2026-10-04",
            byIde: { vscode: 7200, antigravity: 0 }, // 2h exactly
            totalSeconds: 7200,
          },
        },
      );

      manager = new StatusBarManager(client, 1000);
      manager.start();

      await new Promise((resolve) => setTimeout(resolve, 50));

      assert.match(getMockStatusBarItem().text, /VS Code · 2h$/);
    });

    it("shows usage even when VS Code is idle", async () => {
      const client = createMockTrackerClient(
        {
          success: true,
          data: { activeIde: null, activeSessionId: null },
        },
        {
          success: true,
          data: {
            date: "2026-10-04",
            byIde: { vscode: 3600, antigravity: 0 }, // 1h
            totalSeconds: 3600,
          },
        },
      );

      manager = new StatusBarManager(client, 1000);
      manager.start();

      await new Promise((resolve) => setTimeout(resolve, 50));

      assert.match(getMockStatusBarItem().text, /Idle · 1h$/);
    });

    it("shows zero usage when usage fetch fails", async () => {
      const client = createMockTrackerClient(
        {
          success: true,
          data: { activeIde: "vscode", activeSessionId: 1 },
        },
        {
          success: false,
          error: "Failed to fetch usage",
        },
      );

      manager = new StatusBarManager(client, 1000);
      manager.start();

      await new Promise((resolve) => setTimeout(resolve, 50));

      assert.match(getMockStatusBarItem().text, /VS Code · 0m/);
    });
  });
});
