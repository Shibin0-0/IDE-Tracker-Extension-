import * as vscode from "vscode";
import type { IdeSource } from "@ide-usage-monitor/shared";
import { createTrackerClient, type TrackerClient } from "./tracker-client.js";

export const SOURCE_ID: IdeSource = "vscode";

let trackerClient: TrackerClient | null = null;
let statusBarItem: vscode.StatusBarItem | null = null;
let healthCheckInterval: NodeJS.Timeout | null = null;

/**
 * Extension activation hook for Visual Studio Code.
 *
 * Creates a thin HTTP client that communicates with the local tracker service.
 * Does NOT calculate usage, detect foreground windows, manage sessions, or collect user data.
 * The tracker service remains the single source of truth.
 */
export function activate(context: vscode.ExtensionContext): void {
  // Create HTTP client for local tracker service
  trackerClient = createTrackerClient({
    host: "127.0.0.1",
    port: 3210,
    timeout: 5000,
  });

  // Create status bar item to show tracker connection status
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBarItem.text = "$(pulse) IDE Tracker";
  statusBarItem.tooltip = "Connecting to tracker service...";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Check initial connection
  void checkTrackerHealth();

  // Periodic health check every 30 seconds
  healthCheckInterval = setInterval(() => {
    void checkTrackerHealth();
  }, 30000);

  context.subscriptions.push({
    dispose: () => {
      if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
        healthCheckInterval = null;
      }
    },
  });
}

/**
 * Extension deactivation hook.
 * Cleans up resources without affecting the tracker service.
 */
export function deactivate(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }

  if (statusBarItem) {
    statusBarItem.dispose();
    statusBarItem = null;
  }

  trackerClient = null;
}

/**
 * Checks the health of the tracker service and updates the status bar.
 */
async function checkTrackerHealth(): Promise<void> {
  if (!trackerClient || !statusBarItem) {
    return;
  }

  const result = await trackerClient.checkHealth();

  if (result.success) {
    statusBarItem.text = "$(check) IDE Tracker";
    statusBarItem.tooltip = "Tracker service connected";
  } else {
    statusBarItem.text = "$(warning) IDE Tracker";
    statusBarItem.tooltip = `Tracker service unavailable: ${result.error}`;
  }
}

/**
 * Retrieves the current tracker status.
 * Exported for testing purposes.
 */
export async function getTrackerStatus(): Promise<{
  activeIde: IdeSource | null;
  activeSessionId: number | null;
} | null> {
  if (!trackerClient) {
    return null;
  }

  const result = await trackerClient.getStatus();

  if (result.success) {
    return {
      activeIde: result.data.activeIde,
      activeSessionId: result.data.activeSessionId,
    };
  }

  return null;
}
