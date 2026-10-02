import type { IdeSource, UsageEvent } from "@ide-usage-monitor/shared";

export const SOURCE_ID: IdeSource = "antigravity";

export interface AntigravityExtensionContext {
  extensionPath: string;
  subscriptions: Array<{ dispose(): void }>;
}

/**
 * Placeholder lifecycle initialization for Antigravity IDE integration.
 */
export function initializeAntigravityIntegration(
  _context?: AntigravityExtensionContext,
): void {
  // Usage tracking logic for Antigravity IDE hooks to be implemented here.
}

/**
 * Helper stub for transmitting usage events to the local tracker service.
 */
export async function sendLocalEvent(_event: UsageEvent): Promise<void> {
  // Dispatches event over local loopback connection (127.0.0.1)
}
