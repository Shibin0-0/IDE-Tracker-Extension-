import * as path from "node:path";
import type { TrackerInstance } from "@ide-usage-monitor/tracker-service";
import { startTracker } from "@ide-usage-monitor/tracker-service";

/**
 * Result of an attempt to start the in-process tracker.
 */
export type StartResult =
  | { status: "started"; port: number }
  | { status: "already_running"; port: number }
  | { status: "failed"; error: string };

/**
 * Manages the lifecycle of the in-process tracker service within the VS Code extension host.
 *
 * Responsibilities:
 *  - Start the tracker (SQLite + HTTP API) in-process when the extension activates.
 *  - Detect when the port is already occupied (another instance is running) and adopt it gracefully.
 *  - Stop everything cleanly when the extension deactivates.
 *  - Expose the configured port so TrackerClient can reach it.
 *
 * The tracker remains the single source of truth. The extension host only
 * controls the lifecycle; it does not duplicate any tracking logic.
 */
export class TrackerManager {
  private instance: TrackerInstance | null = null;
  private readonly port: number;
  private readonly host: string;
  private readonly databasePath: string;

  constructor(options: {
    port: number;
    host: string;
    /** Absolute path to the SQLite database file. */
    databasePath: string;
  }) {
    this.port = options.port;
    this.host = options.host;
    this.databasePath = options.databasePath;
  }

  /**
   * Attempts to start the in-process tracker.
   *
   * - If started successfully: returns `{ status: 'started', port }`.
   * - If the port is already in use (EADDRINUSE), verifies the existing service
   *   responds to /health before adopting it. If /health fails, returns failed status.
   * - On any other failure: returns `{ status: 'failed', error }`.
   */
  async start(): Promise<StartResult> {
    if (this.instance !== null) {
      return { status: "already_running", port: this.port };
    }

    try {
      this.instance = await startTracker({
        host: this.host,
        port: this.port,
        databasePath: this.databasePath,
      });
      return { status: "started", port: this.port };
    } catch (err: unknown) {
      // EADDRINUSE means the port is taken — verify it's actually our tracker.
      if (isAddressInUse(err)) {
        const isOurTracker = await this.verifyTrackerHealth();
        if (isOurTracker) {
          return { status: "already_running", port: this.port };
        }
        return {
          status: "failed",
          error: `Port ${this.port} is occupied by a non-tracker service`,
        };
      }

      const message = err instanceof Error ? err.message : String(err);
      return { status: "failed", error: message };
    }
  }

  /**
   * Verifies that the service occupying the configured port is our tracker
   * by checking the /health endpoint.
   */
  private async verifyTrackerHealth(): Promise<boolean> {
    try {
      const response = await fetch(`http://${this.host}:${this.port}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Stops the in-process tracker if it was started by this manager.
   * Safe to call multiple times.
   */
  async stop(): Promise<void> {
    if (this.instance === null) return;
    const inst = this.instance;
    this.instance = null;
    await inst.stop();
  }

  /** True if this manager owns a running tracker instance. */
  get isRunning(): boolean {
    return this.instance !== null;
  }
}

/**
 * Returns the path to the database file inside VS Code's global storage directory.
 * This ensures data persists across extension restarts and is not accidentally deleted.
 */
export function resolveDbPath(globalStorageUri: { fsPath: string }): string {
  return path.join(globalStorageUri.fsPath, "ide-usage.db");
}

function isAddressInUse(err: unknown): boolean {
  return (
    err instanceof Error &&
    "code" in err &&
    (err as NodeJS.ErrnoException).code === "EADDRINUSE"
  );
}
