import type Database from "better-sqlite3";
import BetterSqlite3 from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { SessionRepository } from "./sessions.repository.js";
import { createSessionRepository } from "./sessions.repository.js";

export * from "./sessions.repository.js";

export interface DatabaseManager {
  getDb(): Database.Database;
  getSessionRepository(): SessionRepository;
  close(): void;
  initializeTables(): void;
}

/**
 * Creates and manages the local SQLite database connection.
 * Strict local-only operation:
 * - WAL mode enabled for high-concurrency local reads/writes
 * - Foreign key enforcement explicitly enabled: db.pragma('foreign_keys = ON')
 */
export function createDatabaseManager(databasePath: string): DatabaseManager {
  const isMemory = databasePath === ":memory:";

  if (!isMemory) {
    const dir = path.dirname(databasePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  let db: Database.Database | null = new BetterSqlite3(databasePath);

  // Enable Write-Ahead Logging for concurrency and reliability
  if (!isMemory) {
    db.pragma("journal_mode = WAL");
  }

  // Explicit foreign key constraint enforcement
  db.pragma("foreign_keys = ON");

  let sessionRepository: SessionRepository | null = null;

  return {
    getDb(): Database.Database {
      if (!db) {
        throw new Error("Database connection has been closed.");
      }
      return db;
    },

    getSessionRepository(): SessionRepository {
      if (!db) {
        throw new Error("Database connection has been closed.");
      }
      if (!sessionRepository) {
        sessionRepository = createSessionRepository(db);
      }
      return sessionRepository;
    },

    initializeTables(): void {
      if (!db) {
        throw new Error("Database connection has been closed.");
      }

      // Safe schema initialization: re-runnable without errors or data loss
      db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ide TEXT NOT NULL,
          started_at TEXT NOT NULL,
          ended_at TEXT,
          duration_seconds INTEGER
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_ide ON sessions (ide);
        CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions (started_at);
      `);
    },

    close(): void {
      if (db) {
        db.close();
        db = null;
        sessionRepository = null;
      }
    },
  };
}
