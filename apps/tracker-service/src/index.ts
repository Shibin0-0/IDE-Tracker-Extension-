import { loadConfig } from "./config/index.js";
import { createDatabaseManager } from "./db/index.js";
import { createUsageTrackerService } from "./services/tracker.js";

export function bootstrap(): void {
  const config = loadConfig();

  // Initialize SQLite database
  const dbManager = createDatabaseManager(config.databasePath);
  dbManager.initializeTables();

  // Initialize usage tracker service
  const trackerService = createUsageTrackerService(dbManager);

  // Graceful shutdown handling
  const shutdown = (): void => {
    dbManager.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Suppress unused variable warning during bootstrap placeholder
  void trackerService;
}

// Start service when executed directly
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  bootstrap();
}
