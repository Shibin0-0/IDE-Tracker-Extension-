import type {
  CreateSessionInput,
  DateRangeFilter,
  IdeSource,
  SessionRecord,
  UsageSummaryByIde,
} from "@ide-usage-monitor/shared";
import { SUPPORTED_IDES } from "@ide-usage-monitor/shared";
import type Database from "better-sqlite3";

/**
 * Raw SQLite row structure for the sessions table.
 */
export interface SessionRow {
  id: number;
  ide: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
}

/**
 * Filter options for querying sessions.
 */
export interface GetSessionsOptions {
  ide?: IdeSource;
  limit?: number;
  offset?: number;
}

/**
 * Repository interface isolating all persistence operations for IDE sessions.
 */
export interface SessionRepository {
  createSession(input: CreateSessionInput): SessionRecord;
  endSession(
    id: number,
    endedAt: string,
    durationSeconds?: number | null,
  ): SessionRecord | null;
  getSessionById(id: number): SessionRecord | null;
  getSessions(options?: GetSessionsOptions): SessionRecord[];
  getSessionsByDateRange(
    startDate: string,
    endDate: string,
    ide?: IdeSource,
  ): SessionRecord[];
  getTotalUsageForIde(ide: IdeSource, dateRange?: DateRangeFilter): number;
  getTotalUsageAcrossAllIdes(dateRange?: DateRangeFilter): UsageSummaryByIde;
}

/**
 * Maps a SQLite database row to the typed domain SessionRecord.
 */
function mapRowToSessionRecord(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    ide: row.ide as IdeSource,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSeconds: row.duration_seconds,
  };
}

/**
 * Factory creating a dedicated SessionRepository backed by better-sqlite3.
 * All database operations use prepared/parameterized statements to prevent SQL injection.
 */
export function createSessionRepository(
  db: Database.Database,
): SessionRepository {
  // Prepared statements for high performance and strict parameter binding
  const insertStmt = db.prepare(`
    INSERT INTO sessions (ide, started_at, ended_at, duration_seconds)
    VALUES (?, ?, ?, ?)
  `);

  const selectByIdStmt = db.prepare(`
    SELECT id, ide, started_at, ended_at, duration_seconds
    FROM sessions
    WHERE id = ?
  `);

  const updateEndStmt = db.prepare(`
    UPDATE sessions
    SET ended_at = ?, duration_seconds = ?
    WHERE id = ?
  `);

  const selectTotalForIdeStmt = db.prepare(`
    SELECT COALESCE(SUM(duration_seconds), 0) AS total
    FROM sessions
    WHERE ide = ?
  `);

  const selectTotalForIdeDateRangeStmt = db.prepare(`
    SELECT COALESCE(SUM(duration_seconds), 0) AS total
    FROM sessions
    WHERE ide = ? AND started_at >= ? AND started_at <= ?
  `);

  return {
    createSession(input: CreateSessionInput): SessionRecord {
      const result = insertStmt.run(
        input.ide,
        input.startedAt,
        input.endedAt ?? null,
        input.durationSeconds ?? null,
      );

      const id = Number(result.lastInsertRowid);
      return {
        id,
        ide: input.ide,
        startedAt: input.startedAt,
        endedAt: input.endedAt ?? null,
        durationSeconds: input.durationSeconds ?? null,
      };
    },

    endSession(
      id: number,
      endedAt: string,
      durationSeconds?: number | null,
    ): SessionRecord | null {
      let duration = durationSeconds;

      // Automatically calculate duration if not explicitly provided
      if (duration === undefined) {
        const existing = this.getSessionById(id);
        if (!existing) {
          return null;
        }
        const startMs = Date.parse(existing.startedAt);
        const endMs = Date.parse(endedAt);
        duration =
          Number.isNaN(startMs) || Number.isNaN(endMs)
            ? 0
            : Math.max(0, Math.round((endMs - startMs) / 1000));
      }

      const result = updateEndStmt.run(endedAt, duration ?? null, id);
      if (result.changes === 0) {
        return null;
      }

      return this.getSessionById(id);
    },

    getSessionById(id: number): SessionRecord | null {
      const row = selectByIdStmt.get(id) as SessionRow | undefined;
      return row ? mapRowToSessionRecord(row) : null;
    },

    getSessions(options?: GetSessionsOptions): SessionRecord[] {
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (options?.ide) {
        conditions.push("ide = ?");
        params.push(options.ide);
      }

      let sql = `SELECT id, ide, started_at, ended_at, duration_seconds FROM sessions`;
      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(" AND ")}`;
      }
      sql += ` ORDER BY started_at ASC`;

      if (options?.limit !== undefined) {
        sql += ` LIMIT ?`;
        params.push(options.limit);
        if (options?.offset !== undefined) {
          sql += ` OFFSET ?`;
          params.push(options.offset);
        }
      }

      const stmt = db.prepare(sql);
      const rows = stmt.all(...params) as SessionRow[];
      return rows.map(mapRowToSessionRecord);
    },

    getSessionsByDateRange(
      startDate: string,
      endDate: string,
      ide?: IdeSource,
    ): SessionRecord[] {
      if (ide) {
        const stmt = db.prepare(`
          SELECT id, ide, started_at, ended_at, duration_seconds
          FROM sessions
          WHERE started_at >= ? AND started_at <= ? AND ide = ?
          ORDER BY started_at ASC
        `);
        const rows = stmt.all(startDate, endDate, ide) as SessionRow[];
        return rows.map(mapRowToSessionRecord);
      }

      const stmt = db.prepare(`
        SELECT id, ide, started_at, ended_at, duration_seconds
        FROM sessions
        WHERE started_at >= ? AND started_at <= ?
        ORDER BY started_at ASC
      `);
      const rows = stmt.all(startDate, endDate) as SessionRow[];
      return rows.map(mapRowToSessionRecord);
    },

    getTotalUsageForIde(ide: IdeSource, dateRange?: DateRangeFilter): number {
      if (dateRange) {
        const row = selectTotalForIdeDateRangeStmt.get(
          ide,
          dateRange.startDate,
          dateRange.endDate,
        ) as { total: number } | undefined;
        return row?.total ?? 0;
      }

      const row = selectTotalForIdeStmt.get(ide) as
        { total: number } | undefined;
      return row?.total ?? 0;
    },

    getTotalUsageAcrossAllIdes(dateRange?: DateRangeFilter): UsageSummaryByIde {
      const byIde: Record<IdeSource, number> = {
        vscode: 0,
        antigravity: 0,
      };

      let query = `
        SELECT ide, COALESCE(SUM(duration_seconds), 0) AS total
        FROM sessions
      `;
      const params: unknown[] = [];

      if (dateRange) {
        query += ` WHERE started_at >= ? AND started_at <= ?`;
        params.push(dateRange.startDate, dateRange.endDate);
      }

      query += ` GROUP BY ide`;

      const stmt = db.prepare(query);
      const rows = stmt.all(...params) as Array<{ ide: string; total: number }>;

      let grandTotal = 0;
      for (const row of rows) {
        if (SUPPORTED_IDES.includes(row.ide as IdeSource)) {
          const ideKey = row.ide as IdeSource;
          byIde[ideKey] = row.total;
          grandTotal += row.total;
        }
      }

      return {
        byIde,
        totalSeconds: grandTotal,
      };
    },
  };
}
