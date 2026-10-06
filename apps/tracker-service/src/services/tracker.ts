import type {
  DailyUsageSummary,
  IdeSession,
  IngestionResult,
  UsageEvent,
  UsageSummaryByIde,
} from "@ide-usage-monitor/shared";
import type { DatabaseManager } from "../db/index.js";
import { createWindowsActiveWindowProvider } from "../providers/windows/windows-active-window-provider.js";
import { SessionManager } from "./session-manager.js";

/**
 * Service interface for local IDE usage tracking.
 *
 * The session lifecycle is handled by SessionManager.
 * The legacy event/metrics methods remain part of the interface
 * until the later local API/reporting layer is implemented.
 */
export interface UsageTrackerService {
  start(): void;
  stop(): Promise<void>;
  getActiveIde(): ReturnType<SessionManager["getActiveIde"]>;
  getActiveSessionId(): ReturnType<SessionManager["getActiveSessionId"]>;
  getActiveSessionStartedAt(): ReturnType<SessionManager["getActiveSessionStartedAt"]>;
  getTodayUsage(): UsageSummaryByIde;
  getUsageForDate(date: string): UsageSummaryByIde;
  getSessionsForDate(date: string): ReturnType<SessionManager["getSessionsForDate"]>;

  recordEvent(event: UsageEvent): Promise<IngestionResult>;
  getActiveSessions(): Promise<IdeSession[]>;
  getDailySummary(date: string): Promise<DailyUsageSummary | null>;
}

/**
 * Creates the local-only usage tracker service.
 *
 * Architecture:
 * WindowsActiveWindowProvider
 *        ↓
 * SessionManager
 *        ↓
 * SessionRepository
 *        ↓
 * SQLite
 */
export function createUsageTrackerService(
  dbManager: DatabaseManager,
): UsageTrackerService {
  const provider = createWindowsActiveWindowProvider();
  const repository = dbManager.getSessionRepository();

  const sessionManager = new SessionManager(provider, repository);

  return {
    start(): void {
      sessionManager.start();
    },

    async stop(): Promise<void> {
      await sessionManager.stop();
    },

    getActiveIde() {
      return sessionManager.getActiveIde();
    },

    getActiveSessionId() {
      return sessionManager.getActiveSessionId();
    },

    getActiveSessionStartedAt() {
      return sessionManager.getActiveSessionStartedAt();
    },

    getTodayUsage(): UsageSummaryByIde {
      const today = new Date().toISOString().split("T")[0] ?? "";
      return this.getUsageForDate(today);
    },

    getUsageForDate(date: string): UsageSummaryByIde {
      const endOfDay = `${date}T23:59:59.999Z`;
      const startOfDay = `${date}T00:00:00.000Z`;

      const usage = repository.getTotalUsageAcrossAllIdes({
        startDate: startOfDay,
        endDate: endOfDay,
      });

      // Include active session's elapsed time ONLY if the date is today
      const today = new Date().toISOString().split("T")[0];
      const isToday = date === today;
      
      if (isToday) {
        const activeSessionId = sessionManager.getActiveSessionId();
        if (activeSessionId !== null) {
          const activeSession = repository.getSessionById(activeSessionId);
          if (activeSession && activeSession.startedAt) {
            const startMs = Date.parse(activeSession.startedAt);
            const nowMs = Date.now();
            const elapsedSeconds = Math.max(0, Math.floor((nowMs - startMs) / 1000));

            const ide = activeSession.ide;
            usage.byIde[ide] = (usage.byIde[ide] ?? 0) + elapsedSeconds;
            usage.totalSeconds += elapsedSeconds;
          }
        }
      }

      return usage;
    },

    getSessionsForDate(date: string) {
      return sessionManager.getSessionsForDate(date);
    },

    /**
     * Legacy event ingestion API.
     *
     * File/command telemetry is intentionally not implemented.
     * The current tracker records foreground IDE sessions only.
     */
    async recordEvent(_event: UsageEvent): Promise<IngestionResult> {
      return {
        success: false,
        receivedCount: 0,
        error: "Event ingestion is not implemented.",
      };
    },

    /**
     * Reporting will be implemented through the SQLite session
     * repository when the local API/dashboard is added.
     */
    async getActiveSessions(): Promise<IdeSession[]> {
      return [];
    },

    async getDailySummary(_date: string): Promise<DailyUsageSummary | null> {
      return null;
    },
  };
}
