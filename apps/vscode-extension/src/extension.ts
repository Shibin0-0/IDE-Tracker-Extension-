import * as vscode from "vscode";
import type { IdeSource } from "@ide-usage-monitor/shared";
import { createTrackerClient, type TrackerClient } from "./tracker-client.js";
import { StatusBarManager } from "./status-bar-manager.js";

export const SOURCE_ID: IdeSource = "vscode";

let trackerClient: TrackerClient | null = null;
let statusBarManager: StatusBarManager | null = null;

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

  // Create and start status bar manager
  statusBarManager = new StatusBarManager(trackerClient, 30000);
  statusBarManager.start();
  context.subscriptions.push(statusBarManager);
}

/**
 * Extension deactivation hook.
 * Cleans up resources without affecting the tracker service.
 */
export function deactivate(): void {
  if (statusBarManager) {
    statusBarManager.dispose();
    statusBarManager = null;
  }

  trackerClient = null;
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
