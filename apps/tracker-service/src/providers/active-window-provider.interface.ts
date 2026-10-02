import type { IdeSource } from "@ide-usage-monitor/shared";

/**
 * Result representing the detected active IDE.
 */
export interface ActiveIdeResult {
  /**
   * The detected supported IDE identifier, or null if the foreground application is not a supported IDE.
   */
  ide: IdeSource | null;
}

/**
 * OS-independent provider interface for determining the currently active/foreground IDE.
 *
 * Why this is isolated behind an interface:
 * 1. Portability: Allows Windows-specific API implementations to remain completely decoupled
 *    from future macOS (NSWorkspace) or Linux (_NET_ACTIVE_WINDOW) providers.
 * 2. Testability: Consumers and session managers can be tested against mock providers
 *    without requiring a real desktop GUI or OS-specific APIs.
 * 3. Privacy Boundary: Guarantees that only normalized IDE identities are returned to the rest
 *    of the application, preventing OS-level window details from leaking inward.
 */
export interface ActiveWindowProvider {
  /**
   * Queries the operating system to determine which supported IDE currently owns the foreground window.
   *
   * @returns ActiveIdeResult containing the normalized IDE ('vscode' | 'antigravity') or null if no
   *          supported IDE is currently in the foreground. Never throws; returns null on error.
   */
  getActiveIde(): Promise<ActiveIdeResult | null>;
}
