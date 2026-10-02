import type { IdeSource } from "../types/events.js";

/**
 * List of supported IDE source identifiers.
 */
export const SUPPORTED_IDES: readonly IdeSource[] = [
  "vscode",
  "antigravity",
] as const;

/**
 * Network and process defaults for local-only IPC.
 */
export const LOCAL_NETWORK = {
  /** The tracker service binds exclusively to loopback interface for local isolation */
  DEFAULT_HOST: "127.0.0.1",
  DEFAULT_PORT: 47392,
  IPC_SOCKET_NAME: "ide_usage_monitor.sock",
} as const;

/**
 * Endpoints exposed by the tracker service for local clients.
 */
export const API_ROUTES = {
  HEALTH: "/api/v1/health",
  EVENTS_INGEST: "/api/v1/events",
  SESSIONS: "/api/v1/sessions",
  METRICS_SUMMARY: "/api/v1/metrics/summary",
} as const;

/**
 * Default database configurations.
 */
export const STORAGE_DEFAULTS = {
  DATABASE_FILENAME: "ide-usage.db",
  CURRENT_SCHEMA_VERSION: 1,
} as const;
