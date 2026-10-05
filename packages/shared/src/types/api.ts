import type { IdeSource } from "./events.js";
import type { SessionRecord } from "./session.js";

/**
 * Response from GET /health endpoint.
 */
export interface HealthResponse {
  status: "ok";
}

/**
 * Response from GET /status endpoint.
 */
export interface StatusResponse {
  activeIde: IdeSource | null;
  activeSessionId: number | null;
}

/**
 * Response from GET /usage endpoint.
 */
export interface UsageResponse {
  date: string;
  byIde: Record<IdeSource, number>;
  totalSeconds: number;
}

/**
 * Response from GET /sessions endpoint.
 */
export interface SessionsResponse {
  date: string;
  sessions: SessionRecord[];
}

/**
 * Generic error response structure.
 */
export interface ErrorResponse {
  error: string;
}
