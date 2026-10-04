import { LOCAL_NETWORK, STORAGE_DEFAULTS } from "@ide-usage-monitor/shared";
import dotenv from "dotenv";
import path from "node:path";

// Load environment variables from local .env if present
dotenv.config();

export interface AppConfig {
  host: string;
  port: number;
  databasePath: string;
  logLevel: "error" | "warn" | "info" | "debug";
  isDevelopment: boolean;
}

/**
 * Parses and validates application configuration.
 * Strictly binds to loopback interface (127.0.0.1) by default to prevent external network exposure.
 */
export function loadConfig(): AppConfig {
  const host = LOCAL_NETWORK.DEFAULT_HOST;
  const port = process.env["PORT"]
    ? Number(process.env["PORT"])
    : LOCAL_NETWORK.DEFAULT_PORT;
  const databasePath =
    process.env["DATABASE_PATH"] ||
    path.resolve(process.cwd(), "data", STORAGE_DEFAULTS.DATABASE_FILENAME);
  const rawLogLevel = process.env["LOG_LEVEL"] || "info";
  const logLevel: AppConfig["logLevel"] = [
    "error",
    "warn",
    "info",
    "debug",
  ].includes(rawLogLevel)
    ? (rawLogLevel as AppConfig["logLevel"])
    : "info";

  return {
    host,
    port,
    databasePath,
    logLevel,
    isDevelopment: process.env["NODE_ENV"] !== "production",
  };
}
