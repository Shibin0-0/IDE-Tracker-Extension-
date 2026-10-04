import * as vscode from "vscode";
import type { IdeSource } from "@ide-usage-monitor/shared";
import type { TrackerClient } from "./tracker-client.js";

/**
 * Manages the VS Code status bar item to display tracker service status.
 *
 * This manager:
 * - Polls the /status endpoint every 30 seconds
 * - Displays the active IDE and session state
 * - Shows clear offline/error states when tracker is unavailable
 * - Does NOT calculate usage, track time, or collect activity
 */
export class StatusBarManager {
  private readonly statusBarItem: vscode.StatusBarItem;
  private readonly trackerClient: TrackerClient;
  private pollInterval: NodeJS.Timeout | null = null;
  private readonly pollIntervalMs: number;

  constructor(
    trackerClient: TrackerClient,
    pollIntervalMs: number = 30000,
  ) {
    this.trackerClient = trackerClient;
    this.pollIntervalMs = pollIntervalMs;

    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100,
    );
    this.statusBarItem.show();
  }

  /**
   * Starts polling the tracker service status.
   */
  start(): void {
    // Initial status check
    void this.updateStatus();

    // Set up periodic polling
    this.pollInterval = setInterval(() => {
      void this.updateStatus();
    }, this.pollIntervalMs);
  }

  /**
   * Stops polling and cleans up resources.
   */
  dispose(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.statusBarItem.dispose();
  }

  /**
   * Fetches status from tracker service and updates the status bar.
   */
  private async updateStatus(): Promise<void> {
    const result = await this.trackerClient.getStatus();

    if (!result.success) {
      // Tracker service is offline or errored
      this.statusBarItem.text = "$(error) Tracker Offline";
      this.statusBarItem.tooltip = `Tracker service unavailable: ${result.error}`;
      this.statusBarItem.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.errorBackground",
      );
      return;
    }

    const { activeIde, activeSessionId } = result.data;

    if (activeIde === null || activeSessionId === null) {
      // Tracker is online but no active session
      this.statusBarItem.text = "$(circle-outline) Tracker Idle";
      this.statusBarItem.tooltip = "No active IDE session";
      this.statusBarItem.backgroundColor = undefined;
      return;
    }

    // Active session detected
    this.statusBarItem.text = `$(circle-filled) ${this.formatIdeName(activeIde)}`;
    this.statusBarItem.tooltip = `Active: ${activeIde} (Session ${activeSessionId})`;
    this.statusBarItem.backgroundColor = undefined;
  }

  /**
   * Formats IDE source name for display.
   */
  private formatIdeName(ide: IdeSource): string {
    const nameMap: Record<IdeSource, string> = {
      vscode: "VS Code",
      antigravity: "Antigravity",
    };
    return nameMap[ide] ?? ide;
  }
}
