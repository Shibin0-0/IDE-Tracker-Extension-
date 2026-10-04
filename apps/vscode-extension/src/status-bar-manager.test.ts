// Mock VS Code API BEFORE any imports
const mockStatusBarItem = {
  text: "",
  tooltip: "",
  backgroundColor: undefined as any,
  show: () => {},
  dispose: () => {},
};

const mockVscode = {
  window: {
    createStatusBarItem: () => mockStatusBarItem,
  },
  StatusBarAlignment: {
    Right: 2,
  },
  ThemeColor: class ThemeColor {
    constructor(public id: string) {}
  },
};

// Inject mock into global scope BEFORE importing modules that use vscode
(globalThis as any).vscode = mockVscode;

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { StatusResponse } from "@ide-usage-monitor/shared";
import type { ClientResult, TrackerClient } from "./tracker-client.js";
import { StatusBarManager } from "./status-bar-manager.js";

/**
 * Creates a mock TrackerClient for testing.
 */
function createMockTrackerClient(
  statusResult: ClientResult<StatusResponse>,
): TrackerClient {
  return {
    getStatus: async () => statusResult,
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
    // Reset mock state
    mockStatusBarItem.text = "";
    mockStatusBarItem.tooltip = "";
    mockStatusBarItem.backgroundColor = undefined;
  });

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

      assert.ok(mockStatusBarItem.text.includes("VS Code"));
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

      assert.match(mockStatusBarItem.text, /VS Code/);
      assert.match(mockStatusBarItem.tooltip, /Session 42/);
      assert.equal(mockStatusBarItem.backgroundColor, undefined);
    });

    it("shows idle state when no active session", async () => {
      const client = createMockTrackerClient({
        success: true,
        data: { activeIde: null, activeSessionId: null },
      });

      manager = new StatusBarManager(client, 1000);
      manager.start();

      await new Promise((resolve) => setTimeout(resolve, 50));

      assert.match(mockStatusBarItem.text, /Tracker Idle/);
      assert.match(mockStatusBarItem.tooltip, /No active IDE session/);
      assert.equal(mockStatusBarItem.backgroundColor, undefined);
    });

    it("shows offline state when tracker is unavailable", async () => {
      const client = createMockTrackerClient({
        success: false,
        error: "Connection failed: ECONNREFUSED",
      });

      manager = new StatusBarManager(client, 1000);
      manager.start();

      await new Promise((resolve) => setTimeout(resolve, 50));

      assert.match(mockStatusBarItem.text, /Tracker Offline/);
      assert.match(mockStatusBarItem.tooltip, /ECONNREFUSED/);
      assert.ok(mockStatusBarItem.backgroundColor);
    });

    it("formats different IDE names correctly", async () => {
      const testCases: Array<{
        ide: "vscode" | "antigravity";
        expected: string;
      }> = [
        { ide: "vscode", expected: "VS Code" },
        { ide: "antigravity", expected: "Antigravity" },
      ];

      for (const { ide, expected } of testCases) {
        const client = createMockTrackerClient({
          success: true,
          data: { activeIde: ide, activeSessionId: 1 },
        });

        manager = new StatusBarManager(client, 1000);
        manager.start();

        await new Promise((resolve) => setTimeout(resolve, 50));

        assert.match(mockStatusBarItem.text, new RegExp(expected));

        manager.dispose();
        manager = null;
      }
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
        checkHealth: async () => ({ success: true, data: { status: "ok" } }),
      } as TrackerClient;

      manager = new StatusBarManager(client, 100);
      manager.start();

      // Wait for initial update
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.match(mockStatusBarItem.text, /Idle/);

      // Change status
      statusResponse = {
        success: true,
        data: { activeIde: "vscode", activeSessionId: 10 },
      };

      // Wait for next poll
      await new Promise((resolve) => setTimeout(resolve, 150));
      assert.match(mockStatusBarItem.text, /VS Code/);
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
        checkHealth: async () => ({ success: true, data: { status: "ok" } }),
      } as TrackerClient;

      manager = new StatusBarManager(client, 100);
      manager.start();

      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.match(mockStatusBarItem.text, /VS Code/);

      // Tracker goes offline
      statusResponse = {
        success: false,
        error: "Connection refused",
      };

      await new Promise((resolve) => setTimeout(resolve, 150));
      assert.match(mockStatusBarItem.text, /Offline/);
      assert.ok(mockStatusBarItem.backgroundColor);
    });

    it("recovers when tracker comes back online", async () => {
      let statusResponse: ClientResult<StatusResponse> = {
        success: false,
        error: "Connection refused",
      };

      const client = {
        getStatus: async () => statusResponse,
        checkHealth: async () => ({ success: true, data: { status: "ok" } }),
      } as TrackerClient;

      manager = new StatusBarManager(client, 100);
      manager.start();

      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.match(mockStatusBarItem.text, /Offline/);

      // Tracker comes back online
      statusResponse = {
        success: true,
        data: { activeIde: "antigravity", activeSessionId: 5 },
      };

      await new Promise((resolve) => setTimeout(resolve, 150));
      assert.match(mockStatusBarItem.text, /Antigravity/);
      assert.equal(mockStatusBarItem.backgroundColor, undefined);
    });
  });
});
