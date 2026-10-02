/**
 * Aggregated duration and edit frequency metrics per programming language.
 */
export interface LanguageUsageMetric {
  languageId: string;
  totalActiveTimeMs: number;
  totalEditEvents: number;
  fileCount: number;
}

/**
 * Aggregated duration and activity metrics per local workspace / project.
 */
export interface ProjectUsageMetric {
  workspacePath: string;
  workspaceName: string;
  totalActiveTimeMs: number;
  sessionCount: number;
  lastActiveTimestamp: number;
}

/**
 * Summary metrics for a calendar day.
 */
export interface DailyUsageSummary {
  /** ISO date string: YYYY-MM-DD */
  date: string;
  totalActiveTimeMs: number;
  totalSessions: number;
  languageBreakdown: LanguageUsageMetric[];
  projectBreakdown: ProjectUsageMetric[];
}
