import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { UsageTrackerService } from "../services/tracker.js";

/**
 * Minimal local-only HTTP API server.
 *
 * Binds strictly to 127.0.0.1 to guarantee that no traffic is accessible outside localhost.
 *
 * Separation of concerns:
 *   HttpServer  ->  UsageTrackerService  ->  SessionManager
 *
 * The HTTP layer never accesses the database or SessionManager directly;
 * it queries the single source of truth: UsageTrackerService.
 */
export interface HttpServer {
  start(): Promise<void>;
  stop(): Promise<void>;
}

const JSON_CONTENT_TYPE = "application/json";

/**
 * Helper to write a JSON response with proper headers.
 */
function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "Content-Type": JSON_CONTENT_TYPE,
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

/**
 * Dispatches an incoming HTTP request to the appropriate route.
 * Handled routes:
 *   - GET /health -> { "status": "ok" }
 *   - GET /status -> { "activeIde": ..., "activeSessionId": ... }
 */
export function handleRequest(
  tracker: UsageTrackerService,
  req: IncomingMessage,
  res: ServerResponse,
): void {
  try {
    const rawUrl = req.url ?? "/";
    // Parse pathname safely without query string
    const pathname = rawUrl.split("?")[0] ?? "/";
    const method = (req.method ?? "GET").toUpperCase();

    if (pathname === "/health") {
      if (method !== "GET") {
        sendJson(res, 405, { error: "Method Not Allowed" });
        return;
      }
      sendJson(res, 200, { status: "ok" });
      return;
    }

    if (pathname === "/status") {
      if (method !== "GET") {
        sendJson(res, 405, { error: "Method Not Allowed" });
        return;
      }
      sendJson(res, 200, {
        activeIde: tracker.getActiveIde(),
        activeSessionId: tracker.getActiveSessionId(),
      });
      return;
    }

    sendJson(res, 404, { error: "Not Found" });
  } catch {
    if (!res.headersSent) {
      sendJson(res, 500, { error: "Internal Server Error" });
    }
  }
}

/**
 * Creates and configures the HTTP server instance.
 *
 * @param host Loopback host (strictly 127.0.0.1).
 * @param port Configured port (defaults to 3210).
 * @param tracker The singleton UsageTrackerService instance.
 */
export function createHttpServer(
  host: string,
  port: number,
  tracker: UsageTrackerService,
): HttpServer {
  const server: Server = createServer((req, res) => {
    handleRequest(tracker, req, res);
  });

  return {
    start(): Promise<void> {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          resolve();
        });
      });
    },

    stop(): Promise<void> {
      return new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    },
  };
}

