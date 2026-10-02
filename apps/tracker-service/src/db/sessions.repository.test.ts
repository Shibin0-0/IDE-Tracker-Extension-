import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type { DatabaseManager, SessionRepository } from "./index.js";
import { createDatabaseManager } from "./index.js";

describe("SQLite Persistence Layer - SessionRepository", () => {
  let dbManager: DatabaseManager;
  let sessionRepo: SessionRepository;

  beforeEach(() => {
    // Use in-memory SQLite database for isolated and fast tests
    dbManager = createDatabaseManager(":memory:");
    dbManager.initializeTables();
    sessionRepo = dbManager.getSessionRepository();
  });

  describe("Database Configuration & Schema Initialization", () => {
    it("enables foreign key constraints", () => {
      const db = dbManager.getDb();
      const pragmaResult = db.pragma("foreign_keys", {
        simple: true,
      }) as number;
      assert.strictEqual(pragmaResult, 1, "foreign_keys PRAGMA must be ON (1)");
    });

    it("is safe to run initializeTables multiple times without data loss", () => {
      // Create initial record
      const session = sessionRepo.createSession({
        ide: "vscode",
        startedAt: "2026-10-02T10:00:00.000Z",
      });

      // Run initialization again
      assert.doesNotThrow(() => {
        dbManager.initializeTables();
      });

      // Confirm record is still present
      const retrieved = sessionRepo.getSessionById(session.id);
      assert.notStrictEqual(retrieved, null);
      assert.strictEqual(retrieved?.id, session.id);
    });
  });

  describe("Creating a session", () => {
    it("creates an active session with null ended_at and null duration_seconds", () => {
      const session = sessionRepo.createSession({
        ide: "vscode",
        startedAt: "2026-10-02T09:00:00.000Z",
      });

      assert.strictEqual(typeof session.id, "number");
      assert.ok(session.id > 0);
      assert.strictEqual(session.ide, "vscode");
      assert.strictEqual(session.startedAt, "2026-10-02T09:00:00.000Z");
      assert.strictEqual(session.endedAt, null);
      assert.strictEqual(session.durationSeconds, null);

      const fromDb = sessionRepo.getSessionById(session.id);
      assert.deepStrictEqual(fromDb, session);
    });

    it("creates a session with explicit ended_at and duration_seconds", () => {
      const session = sessionRepo.createSession({
        ide: "antigravity",
        startedAt: "2026-10-02T09:00:00.000Z",
        endedAt: "2026-10-02T09:30:00.000Z",
        durationSeconds: 1800,
      });

      assert.strictEqual(session.ide, "antigravity");
      assert.strictEqual(session.startedAt, "2026-10-02T09:00:00.000Z");
      assert.strictEqual(session.endedAt, "2026-10-02T09:30:00.000Z");
      assert.strictEqual(session.durationSeconds, 1800);
    });
  });

  describe("Ending a session", () => {
    it("ends an active session with an explicitly provided duration", () => {
      const created = sessionRepo.createSession({
        ide: "vscode",
        startedAt: "2026-10-02T10:00:00.000Z",
      });

      const ended = sessionRepo.endSession(
        created.id,
        "2026-10-02T10:45:00.000Z",
        2700,
      );

      assert.notStrictEqual(ended, null);
      assert.strictEqual(ended?.id, created.id);
      assert.strictEqual(ended?.endedAt, "2026-10-02T10:45:00.000Z");
      assert.strictEqual(ended?.durationSeconds, 2700);
    });

    it("automatically calculates duration in seconds if duration is omitted", () => {
      const created = sessionRepo.createSession({
        ide: "antigravity",
        startedAt: "2026-10-02T10:00:00.000Z",
      });

      // 10 minutes later = 600 seconds
      const ended = sessionRepo.endSession(
        created.id,
        "2026-10-02T10:10:00.000Z",
      );

      assert.notStrictEqual(ended, null);
      assert.strictEqual(ended?.endedAt, "2026-10-02T10:10:00.000Z");
      assert.strictEqual(ended?.durationSeconds, 600);
    });

    it("returns null when attempting to end a non-existent session", () => {
      const result = sessionRepo.endSession(
        99999,
        "2026-10-02T11:00:00.000Z",
        100,
      );
      assert.strictEqual(result, null);
    });
  });

  describe("Retrieving sessions", () => {
    it("retrieves all sessions ordered by started_at", () => {
      sessionRepo.createSession({
        ide: "vscode",
        startedAt: "2026-10-02T08:00:00.000Z",
      });
      sessionRepo.createSession({
        ide: "antigravity",
        startedAt: "2026-10-02T09:00:00.000Z",
      });

      const all = sessionRepo.getSessions();
      assert.strictEqual(all.length, 2);
      assert.strictEqual(all[0]?.ide, "vscode");
      assert.strictEqual(all[1]?.ide, "antigravity");
    });

    it("filters sessions by IDE", () => {
      sessionRepo.createSession({
        ide: "vscode",
        startedAt: "2026-10-02T08:00:00.000Z",
      });
      sessionRepo.createSession({
        ide: "antigravity",
        startedAt: "2026-10-02T09:00:00.000Z",
      });
      sessionRepo.createSession({
        ide: "vscode",
        startedAt: "2026-10-02T10:00:00.000Z",
      });

      const vscodeSessions = sessionRepo.getSessions({ ide: "vscode" });
      assert.strictEqual(vscodeSessions.length, 2);
      assert.ok(vscodeSessions.every((s) => s.ide === "vscode"));

      const antigravitySessions = sessionRepo.getSessions({
        ide: "antigravity",
      });
      assert.strictEqual(antigravitySessions.length, 1);
      assert.strictEqual(antigravitySessions[0]?.ide, "antigravity");
    });

    it("supports pagination with limit and offset", () => {
      for (let i = 1; i <= 5; i++) {
        sessionRepo.createSession({
          ide: "vscode",
          startedAt: `2026-10-02T0${i}:00:00.000Z`,
        });
      }

      const paged = sessionRepo.getSessions({ limit: 2, offset: 1 });
      assert.strictEqual(paged.length, 2);
      assert.strictEqual(paged[0]?.startedAt, "2026-10-02T02:00:00.000Z");
      assert.strictEqual(paged[1]?.startedAt, "2026-10-02T03:00:00.000Z");
    });
  });

  describe("Retrieving sessions by date range", () => {
    beforeEach(() => {
      sessionRepo.createSession({
        ide: "vscode",
        startedAt: "2026-10-01T12:00:00.000Z",
        endedAt: "2026-10-01T13:00:00.000Z",
        durationSeconds: 3600,
      });
      sessionRepo.createSession({
        ide: "vscode",
        startedAt: "2026-10-02T09:00:00.000Z",
        endedAt: "2026-10-02T10:00:00.000Z",
        durationSeconds: 3600,
      });
      sessionRepo.createSession({
        ide: "antigravity",
        startedAt: "2026-10-02T11:00:00.000Z",
        endedAt: "2026-10-02T12:00:00.000Z",
        durationSeconds: 3600,
      });
      sessionRepo.createSession({
        ide: "vscode",
        startedAt: "2026-10-03T10:00:00.000Z",
        endedAt: "2026-10-03T11:00:00.000Z",
        durationSeconds: 3600,
      });
    });

    it("returns sessions within the specified range inclusive", () => {
      const results = sessionRepo.getSessionsByDateRange(
        "2026-10-02T00:00:00.000Z",
        "2026-10-02T23:59:59.999Z",
      );

      assert.strictEqual(results.length, 2);
      assert.strictEqual(results[0]?.startedAt, "2026-10-02T09:00:00.000Z");
      assert.strictEqual(results[1]?.startedAt, "2026-10-02T11:00:00.000Z");
    });

    it("filters by date range and specific IDE", () => {
      const results = sessionRepo.getSessionsByDateRange(
        "2026-10-02T00:00:00.000Z",
        "2026-10-02T23:59:59.999Z",
        "antigravity",
      );

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0]?.ide, "antigravity");
    });

    it("returns empty array when no sessions match the date range", () => {
      const results = sessionRepo.getSessionsByDateRange(
        "2026-10-05T00:00:00.000Z",
        "2026-10-05T23:59:59.999Z",
      );
      assert.strictEqual(results.length, 0);
    });
  });

  describe("Calculating duration totals", () => {
    beforeEach(() => {
      // Day 1
      sessionRepo.createSession({
        ide: "vscode",
        startedAt: "2026-10-01T10:00:00.000Z",
        endedAt: "2026-10-01T11:00:00.000Z",
        durationSeconds: 3600,
      });
      sessionRepo.createSession({
        ide: "antigravity",
        startedAt: "2026-10-01T14:00:00.000Z",
        endedAt: "2026-10-01T15:30:00.000Z",
        durationSeconds: 5400,
      });

      // Day 2
      sessionRepo.createSession({
        ide: "vscode",
        startedAt: "2026-10-02T09:00:00.000Z",
        endedAt: "2026-10-02T09:30:00.000Z",
        durationSeconds: 1800,
      });
    });

    it("calculates total usage for a specific IDE across all time", () => {
      const vscodeTotal = sessionRepo.getTotalUsageForIde("vscode");
      assert.strictEqual(vscodeTotal, 5400); // 3600 + 1800

      const antigravityTotal = sessionRepo.getTotalUsageForIde("antigravity");
      assert.strictEqual(antigravityTotal, 5400);
    });

    it("calculates total usage for a specific IDE within a date range", () => {
      const vscodeDay1 = sessionRepo.getTotalUsageForIde("vscode", {
        startDate: "2026-10-01T00:00:00.000Z",
        endDate: "2026-10-01T23:59:59.999Z",
      });
      assert.strictEqual(vscodeDay1, 3600);

      const vscodeDay2 = sessionRepo.getTotalUsageForIde("vscode", {
        startDate: "2026-10-02T00:00:00.000Z",
        endDate: "2026-10-02T23:59:59.999Z",
      });
      assert.strictEqual(vscodeDay2, 1800);
    });

    it("returns 0 for an IDE with no sessions", () => {
      const freshDb = createDatabaseManager(":memory:");
      freshDb.initializeTables();
      const freshRepo = freshDb.getSessionRepository();

      assert.strictEqual(freshRepo.getTotalUsageForIde("vscode"), 0);
      assert.strictEqual(freshRepo.getTotalUsageForIde("antigravity"), 0);
    });

    it("calculates total usage across all supported IDEs with breakdown and grand total", () => {
      const summary = sessionRepo.getTotalUsageAcrossAllIdes();

      assert.strictEqual(summary.byIde.vscode, 5400);
      assert.strictEqual(summary.byIde.antigravity, 5400);
      assert.strictEqual(summary.totalSeconds, 10800);
    });

    it("calculates total usage across all supported IDEs within a date range", () => {
      const day1Summary = sessionRepo.getTotalUsageAcrossAllIdes({
        startDate: "2026-10-01T00:00:00.000Z",
        endDate: "2026-10-01T23:59:59.999Z",
      });

      assert.strictEqual(day1Summary.byIde.vscode, 3600);
      assert.strictEqual(day1Summary.byIde.antigravity, 5400);
      assert.strictEqual(day1Summary.totalSeconds, 9000);
    });
  });

  describe("Handling active sessions with NULL ended_at", () => {
    it("handles active sessions safely during duration calculations", () => {
      // Completed session
      sessionRepo.createSession({
        ide: "vscode",
        startedAt: "2026-10-02T08:00:00.000Z",
        endedAt: "2026-10-02T09:00:00.000Z",
        durationSeconds: 3600,
      });

      // Active session (ended_at is NULL, duration_seconds is NULL)
      const activeSession = sessionRepo.createSession({
        ide: "vscode",
        startedAt: "2026-10-02T10:00:00.000Z",
      });

      assert.strictEqual(activeSession.endedAt, null);
      assert.strictEqual(activeSession.durationSeconds, null);

      // Active session with NULL duration does not crash or distort sum
      const totalUsage = sessionRepo.getTotalUsageForIde("vscode");
      assert.strictEqual(totalUsage, 3600);

      const allIdesUsage = sessionRepo.getTotalUsageAcrossAllIdes();
      assert.strictEqual(allIdesUsage.byIde.vscode, 3600);
      assert.strictEqual(allIdesUsage.totalSeconds, 3600);
    });

    it("correctly retrieves and displays active sessions alongside completed ones", () => {
      sessionRepo.createSession({
        ide: "vscode",
        startedAt: "2026-10-02T08:00:00.000Z",
        endedAt: "2026-10-02T09:00:00.000Z",
        durationSeconds: 3600,
      });

      sessionRepo.createSession({
        ide: "antigravity",
        startedAt: "2026-10-02T10:00:00.000Z",
      });

      const sessions = sessionRepo.getSessions();
      assert.strictEqual(sessions.length, 2);

      const active = sessions.find((s) => s.endedAt === null);
      assert.notStrictEqual(active, undefined);
      assert.strictEqual(active?.ide, "antigravity");
      assert.strictEqual(active?.durationSeconds, null);
    });
  });
});
