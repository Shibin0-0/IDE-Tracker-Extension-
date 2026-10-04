import { pathToFileURL } from "node:url";
import { loadConfig } from "./config/index.js";
import { createDatabaseManager } from "./db/index.js";
import { createHttpServer } from "./http/server.js";
import { createUsageTrackerService } from "./services/tracker.js";

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
