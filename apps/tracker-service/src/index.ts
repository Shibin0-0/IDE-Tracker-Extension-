import { pathToFileURL } from "node:url";
import { loadConfig } from "./config/index.js";
import { createDatabaseManager } from "./db/index.js";
import { createHttpServer, type HttpServer } from "./http/server.js";
import {
  createUsageTrackerService,
  type UsageTrackerService,
} from "./services/tracker.js";
import type { DatabaseManager } from "./db/index.js";

export type { UsageTrackerService } from "./services/tracker.js";
export type { HttpServer } from "./http/server.js";
export type { DatabaseManager } from "./db/index.js";
export type { AppConfig } from "./config/index.js";
export { loadConfig } from "./config/index.js";
export { createDatabaseManager } from "./db/index.js";
export { createHttpServer } from "./http/server.js";
export { createUsageTrackerService } from "./services/tracker.js";

/**
 * A running tracker instance that can be cleanly stopped without calling process.exit().
 * Used by the VS Code extension to manage the tracker lifecycle in-process.
 */
export interface TrackerInstance {
  /** The host the HTTP server is bound to (always 127.0.0.1). */
  host: string;
  /** The port the HTTP server is listening on. */
  port: number;
  /** Stop polling, close the HTTP server, and close the database. Safe to call multiple times. */
  stop(): Promise<void>;
}

/**
 * Starts the tracker in-process: SQLite database, session manager, and HTTP API.
 *
 * Unlike bootstrap(), this function:
 *  - Does NOT call process.exit() on shutdown.
 *  - Does NOT register SIGINT/SIGTERM handlers (caller's responsibility).
 *  - Returns a TrackerInstance handle so the caller can stop everything cleanly.
 *
 * Throws if the HTTP server cannot bind (e.g. port already in use).
 */
export async function startTracker(options?: {
  databasePath?: string;
  host?: string;
  port?: number;
}): Promise<TrackerInstance> {
  const config = loadConfig();

  const host = options?.host ?? config.host;
  const port = options?.port ?? config.port;
  const databasePath = options?.databasePath ?? config.databasePath;

  const dbManager: DatabaseManager = createDatabaseManager(databasePath);
  dbManager.initializeTables();

  const trackerService: UsageTrackerService =
    createUsageTrackerService(dbManager);
  trackerService.start();

  const httpServer: HttpServer = createHttpServer(host, port, trackerService);

  // Will throw with EADDRINUSE if port is already taken — caller handles this.
  try {
    await httpServer.start();
  } catch (err) {
    // Rollback: stop tracker and close database before rethrowing.
    try {
      await trackerService.stop();
    } catch {
      // Ignore stop errors during rollback.
    }
    try {
      dbManager.close();
    } catch {
      // Ignore close errors during rollback.
    }
    throw err;
  }

  let stopped = false;

  return {
    host,
    port,

    async stop(): Promise<void> {
      if (stopped) return;
      stopped = true;

      try {
        await httpServer.stop();
      } catch {
        // Ignore errors when closing an already-closed server.
      }

      try {
        await trackerService.stop();
      } catch {
        // Ignore errors when stopping an already-stopped tracker.
      }

      try {
        dbManager.close();
      } catch {
        // Ignore errors on close.
      }
    },
  };
}

/**
 * Legacy entry point used when running the tracker as a standalone process
 * (e.g. `node dist/index.js`). Registers SIGINT/SIGTERM and calls process.exit().
 */
export function bootstrap(): void {
  const config = loadConfig();

  // Initialize SQLite database.
  const dbManager = createDatabaseManager(config.databasePath);
  dbManager.initializeTables();

  // Initialize and start foreground IDE usage tracking.
  const trackerService = createUsageTrackerService(dbManager);
  trackerService.start();

  // Start the local-only HTTP API (bound strictly to 127.0.0.1).
  const httpServer = createHttpServer(config.host, config.port, trackerService);

  // Graceful shutdown: stop HTTP server, then tracker service, then close database.
  const shutdown = (): void => {
    void httpServer.stop().finally(() => {
      void trackerService.stop().finally(() => {
        dbManager.close();
        process.exit(0);
      });
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  httpServer.start().catch((err: unknown) => {
    console.error("[tracker-service] Failed to start HTTP server:", err);
    if (!config.isDevelopment) {
      process.exit(1);
    }
  });
}

// Start service when executed directly.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  bootstrap();
}
