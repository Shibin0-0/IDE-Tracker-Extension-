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

  start(): void {
    void this.updateStatus();

    this.pollInterval = setInterval(() => {
      void this.updateStatus();
    }, this.pollIntervalMs);
  }

  dispose(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    this.statusBarItem.dispose();
  }

  private async updateStatus(): Promise<void> {
    const result = await this.trackerClient.getStatus();

    if (!result.success) {
      // Tracker service unavailable or errored
      this.statusBarItem.color = undefined;
      this.statusBarItem.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.errorBackground",
      );
      return;
    }

    const { activeIde, activeSessionId } = result.data;

    if (activeIde === null || activeSessionId === null) {
      // Tracker is running but no IDE is active
      this.statusBarItem.text = "$(circle-outline) VS Code Idle";
      this.statusBarItem.tooltip = "VS Code is idle";
      this.statusBarItem.color = undefined;
      this.statusBarItem.backgroundColor = undefined;
      return;
    }

    // Active IDE session
this.statusBarItem.text = `$(circle-filled) ${this.formatIdeName(activeIde)}`;
this.statusBarItem.tooltip = `Active: ${activeIde} (Session ${activeSessionId})`;
this.statusBarItem.color = new vscode.ThemeColor("charts.green");
this.statusBarItem.backgroundColor = undefined;
  }

  private formatIdeName(ide: IdeSource): string {
    const nameMap: Record<IdeSource, string> = {
      vscode: "VS Code",
      antigravity: "Antigravity",
    };

    return nameMap[ide] ?? ide;
  }
}