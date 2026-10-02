import type * as vscode from "vscode";
import type { IdeSource, UsageEvent } from "@ide-usage-monitor/shared";

export const SOURCE_ID: IdeSource = "vscode";

/**
 * Placeholder extension activation hook for Visual Studio Code.
 * Sets up local listeners for editor events and transmits them to the local tracker-service.
 */
export function activate(_context: vscode.ExtensionContext): void {
  // Usage tracking logic to be implemented here.
  // Will observe text document changes, window focus, and session lifecycle.
}

/**
 * Placeholder extension deactivation hook.
 */
export function deactivate(): void {
  // Graceful cleanup of local IPC connections or pending event buffers.
}

/**
 * Helper stub for dispatching events to the local tracker service.
 */
export async function dispatchLocalEvent(_event: UsageEvent): Promise<void> {
  // Implementation will communicate exclusively over local loopback (127.0.0.1)
}
