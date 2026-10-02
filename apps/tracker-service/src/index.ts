import { pathToFileURL } from "node:url";
import { loadConfig } from "./config/index.js";
import { createDatabaseManager } from "./db/index.js";
import { createUsageTrackerService } from "./services/tracker.js";

export function bootstrap(): void {
  const config = loadConfig();

  // Initialize SQLite database.
  const dbManager = createDatabaseManager(config.databasePath);
  dbManager.initializeTables();

  // Initialize and start foreground IDE usage tracking.
  const trackerService = createUsageTrackerService(dbManager);
  trackerService.start();

  // Graceful shutdown handling.
  const shutdown = (): void => {
    void trackerService.stop().finally(() => {
      dbManager.close();
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// Start service when executed directly.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  bootstrap();
}