import type {
  DailyUsageSummary,
  IdeSession,
  IngestionResult,
  UsageEvent,
} from "@ide-usage-monitor/shared";
import type { DatabaseManager } from "../db/index.js";

/**
 * Service interface for local IDE usage recording and metric queries.
 */
export interface UsageTrackerService {
  recordEvent(event: UsageEvent): Promise<IngestionResult>;
  getActiveSessions(): Promise<IdeSession[]>;
  getDailySummary(date: string): Promise<DailyUsageSummary | null>;
}

/**
 * Factory creating the local-only usage tracker service.
 */
export function createUsageTrackerService(
  _dbManager: DatabaseManager,
): UsageTrackerService {
  return {
    async recordEvent(_event: UsageEvent): Promise<IngestionResult> {
      // Placeholder: actual usage tracking logic to be implemented
      return { success: true, receivedCount: 1 };
    },

    async getActiveSessions(): Promise<IdeSession[]> {
      // Placeholder: query active sessions from local SQLite
      return [];
    },

    async getDailySummary(_date: string): Promise<DailyUsageSummary | null> {
      // Placeholder: aggregate daily usage statistics from local SQLite
      return null;
    },
  };
}
