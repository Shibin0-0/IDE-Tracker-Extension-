import type { IdeSource } from "./events.js";

/**
 * State of an IDE tracking session stored in SQLite.
 */
export type SessionStatus = "active" | "idle" | "closed";

/**
 * Metadata representing a single active or historical IDE session.
 */
export interface IdeSession {
  sessionId: string;
  source: IdeSource;
  workspaceName: string | null;
  workspacePath: string | null;
  startTime: number;
  endTime: number | null;
  lastHeartbeat: number;
  status: SessionStatus;
  totalActiveTimeMs: number;
}

/**
 * Persistent SQLite session record row representation.
 */
export interface SessionRecord {
  id: number;
  ide: IdeSource;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
}

/**
 * Input for creating a new session record.
 */
export interface CreateSessionInput {
  ide: IdeSource;
  startedAt: string;
  endedAt?: string | null;
  durationSeconds?: number | null;
}

/**
 * Input for ending an active session.
 */
export interface EndSessionInput {
  id: number;
  endedAt: string;
  durationSeconds?: number | null;
}

/**
 * Filter criteria for retrieving session records across a date range.
 */
export interface DateRangeFilter {
  startDate: string;
  endDate: string;
}

/**
 * Breakdown of total usage seconds across supported IDEs.
 */
export interface UsageSummaryByIde {
  byIde: Record<IdeSource, number>;
  totalSeconds: number;
}
