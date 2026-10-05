import { request as httpRequest } from "node:http";
import type {
  HealthResponse,
  StatusResponse,
  UsageResponse,
  SessionsResponse,
  ErrorResponse,
} from "@ide-usage-monitor/shared";

/**
 * Configuration for the tracker service HTTP client.
 */
export interface TrackerClientConfig {
  host?: string;
  port?: number;
  timeout?: number;
}

/**
 * Result of a client request with success/failure discrimination.
 */
export type ClientResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Minimal HTTP client for communicating with the local tracker service.
 *
 * This client does NOT:
 * - Calculate usage or durations
 * - Detect foreground windows
 * - Manage sessions
 * - Send heartbeats
 * - Access SQLite
 * - Collect user activity or data
 *
 * It only queries the tracker service's read-only status endpoints.
 */
export class TrackerClient {
  private readonly host: string;
  private readonly port: number;
  private readonly timeout: number;

  constructor(config?: TrackerClientConfig) {
    this.host = config?.host ?? "127.0.0.1";
    this.port = config?.port ?? 3210;
    this.timeout = config?.timeout ?? 5000;
  }

  /**
   * Checks if the tracker service is available and healthy.
   *
   * @returns Success with HealthResponse or failure with error message.
   */
  async checkHealth(): Promise<ClientResult<HealthResponse>> {
    return this.makeRequest<HealthResponse>("/health");
  }

  /**
   * Retrieves the current active IDE and session from the tracker service.
   *
   * @returns Success with StatusResponse or failure with error message.
   */
  async getStatus(): Promise<ClientResult<StatusResponse>> {
    return this.makeRequest<StatusResponse>("/status");
  }

  /**
   * Retrieves today's usage statistics from the tracker service.
   *
   * @returns Success with UsageResponse or failure with error message.
   */
  async getUsage(): Promise<ClientResult<UsageResponse>> {
    return this.makeRequest<UsageResponse>("/usage");
  }

  /**
   * Retrieves session history for a specific date from the tracker service.
   *
   * @param date The date in YYYY-MM-DD format (defaults to today).
   * @returns Success with SessionsResponse or failure with error message.
   */
  async getSessions(date?: string): Promise<ClientResult<SessionsResponse>> {
    const targetDate = date ?? new Date().toISOString().split("T")[0] ?? "";
    return this.makeRequest<SessionsResponse>(`/sessions?date=${encodeURIComponent(targetDate)}`);
  }

  /**
   * Makes an HTTP GET request to the tracker service.
   *
   * @param path The endpoint path (e.g., '/health', '/status').
   * @returns Parsed JSON response or error.
   */
  private makeRequest<T>(path: string): Promise<ClientResult<T>> {
    return new Promise((resolve) => {
      const req = httpRequest(
        {
          host: this.host,
          port: this.port,
          path,
          method: "GET",
          timeout: this.timeout,
        },
        (res) => {
          let data = "";

          res.on("data", (chunk: Buffer) => {
            data += chunk.toString();
          });

          res.on("end", () => {
            try {
              const statusCode = res.statusCode ?? 0;

              if (statusCode < 200 || statusCode >= 300) {
                // Parse error response if available
                let errorMessage = `HTTP ${statusCode}`;
                try {
                  const errorBody = JSON.parse(data) as ErrorResponse;
                  if (errorBody.error) {
                    errorMessage = errorBody.error;
                  }
                } catch {
                  // Use default error message
                }
                resolve({ success: false, error: errorMessage });
                return;
              }

              const parsed = JSON.parse(data) as T;
              resolve({ success: true, data: parsed });
            } catch (err) {
              resolve({
                success: false,
                error: `Failed to parse response: ${err instanceof Error ? err.message : String(err)}`,
              });
            }
          });
        },
      );

      req.on("error", (err) => {
        resolve({
          success: false,
          error: `Connection failed: ${err.message}`,
        });
      });

      req.on("timeout", () => {
        req.destroy();
        resolve({
          success: false,
          error: "Request timeout",
        });
      });

      req.end();
    });
  }
}

/**
 * Factory function to create a TrackerClient instance.
 */
export function createTrackerClient(
  config?: TrackerClientConfig,
): TrackerClient {
  return new TrackerClient(config);
}
