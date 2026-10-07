import * as vscode from "vscode";
import type { IdeSource } from "@ide-usage-monitor/shared";
import { LOCAL_NETWORK } from "@ide-usage-monitor/shared";
import { createTrackerClient, type TrackerClient } from "./tracker-client.js";
import { StatusBarManager } from "./status-bar-manager.js";
import { DashboardProvider } from "./dashboard-provider.js";
import { TrackerManager, resolveDbPath } from "./tracker-manager.js";

export const SOURCE_ID: IdeSource = "vscode";

const TRACKER_PORT = LOCAL_NETWORK.DEFAULT_PORT; // 3210
const TRACKER_HOST = LOCAL_NETWORK.DEFAULT_HOST; // 127.0.0.1

let trackerManager: TrackerManager | null = null;
let trackerClient: TrackerClient | null = null;
let statusBarManager: StatusBarManager | null = null;
let dashboardProvider: DashboardProvider | null = null;

/**
 * Extension activation hook for Visual Studio Code.
 *
 * Starts the local tracker service in-process (SQLite + HTTP on 127.0.0.1).
 * If the tracker port is already occupied (another instance running), the
 * extension adopts it and connects the status bar / dashboard as normal.
 *
 * The tracker service remains the single source of truth.
 * The extension host does NOT duplicate tracking logic.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Resolve persistent DB path inside VS Code's global storage (survives reinstalls).
  const dbPath = resolveDbPath(context.globalStorageUri);

  // Ensure the storage directory exists (VS Code does not auto-create it).
  await vscode.workspace.fs.createDirectory(context.globalStorageUri);

  // Create and start the in-process tracker.
  trackerManager = new TrackerManager({
    host: TRACKER_HOST,
    port: TRACKER_PORT,
    databasePath: dbPath,
  });

  const startResult = await trackerManager.start();

  if (startResult.status === "failed") {
    // Show a warning but keep going — status bar will show Offline, dashboard
    // will show the error state. User is still informed.
    void vscode.window.showWarningMessage(
      `IDE Usage Monitor: tracker failed to start — ${startResult.error}`,
    );
  }
  // "started" and "already_running" are both fine: the HTTP API is reachable.

  // Create HTTP client pointed at the tracker (owned by this extension or an
  // existing instance — either way it serves the same API on the same port).
  trackerClient = createTrackerClient({
    host: TRACKER_HOST,
    port: TRACKER_PORT,
    timeout: 5000,
  });

  // Create and start status bar manager (polls /status every 30 s).
  statusBarManager = new StatusBarManager(trackerClient, 30000);
  statusBarManager.start();
  context.subscriptions.push(statusBarManager);

  // Create dashboard provider.
  dashboardProvider = new DashboardProvider(trackerClient, context.extensionUri);

  // Register dashboard command.
  const dashboardCommand = vscode.commands.registerCommand(
    "ide-usage-monitor.openDashboard",
    () => {
      if (dashboardProvider) {
        dashboardProvider.show();
      }
    },
  );
  context.subscriptions.push(dashboardCommand);
}

/**
 * Extension deactivation hook.
 *
 * Stops the in-process tracker (HTTP server + session polling + DB) only if
 * this extension instance owns it. Does not affect external tracker processes.
 */
export async function deactivate(): Promise<void> {
  if (statusBarManager) {
    statusBarManager.dispose();
    statusBarManager = null;
  }

  trackerClient = null;
  dashboardProvider = null;

  if (trackerManager) {
    await trackerManager.stop();
    trackerManager = null;
  }
}

/**
 * Retrieves the current tracker status.
 * Exported for testing purposes only.
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
