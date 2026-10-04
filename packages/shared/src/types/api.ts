import type { IdeSource } from "./events.js";

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
 * Generic error response structure.
 */
export interface ErrorResponse {
  error: string;
}
