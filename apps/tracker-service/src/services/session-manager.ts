import type { IdeSource } from "@ide-usage-monitor/shared";
import type {
  ActiveIdeResult,
  ActiveWindowProvider,
} from "../providers/active-window-provider.interface.js";
import type { SessionRepository } from "../db/sessions.repository.js";

export interface SessionManagerOptions {
  pollIntervalMs?: number;
  now?: () => Date;
  sleepGapThresholdMs?: number;
}

export class SessionManager {
  private readonly provider: ActiveWindowProvider;
  private readonly repository: SessionRepository;
  private readonly pollIntervalMs: number;
  private readonly now: () => Date;

  private timer: NodeJS.Timeout | null = null;
  private polling = false;

  private activeIde: IdeSource | null = null;
  private activeSessionId: number | null = null;
  private sessionStartedAt: Date | null = null;
  private lastPollAt: Date | null = null;
  private readonly sleepGapThresholdMs: number;

  constructor(
    provider: ActiveWindowProvider,
    repository: SessionRepository,
    options: SessionManagerOptions = {},
  ) {
    this.provider = provider;
    this.repository = repository;
    this.pollIntervalMs = options.pollIntervalMs ?? 1000;
    this.now = options.now ?? (() => new Date());
    this.sleepGapThresholdMs = options.sleepGapThresholdMs ?? 100_000;
  }

  /**
   * Performs one foreground-IDE check.
   *
   * This method is public so it can be tested independently of
   * the background polling timer.
   */
  async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;

    try {
      const currentTime = this.now();

      if (
        this.lastPollAt !== null &&
        currentTime.getTime() - this.lastPollAt.getTime() >
          this.sleepGapThresholdMs
      ) {
        await this.handleSystemGap(this.lastPollAt);
      }

      this.lastPollAt = currentTime;

      const result: ActiveIdeResult | null = await this.provider.getActiveIde();

      const detectedIde = result?.ide ?? null;

      // Nothing changed. Keep the current session running.
      if (detectedIde === this.activeIde) {
        return;
      }

      await this.handleIdeChange(detectedIde);
    } finally {
      this.polling = false;
    }
  }

  /**
   * Starts continuous foreground monitoring.
   *
   * Calling start() multiple times is safe and will not create
   * multiple polling timers.
   */
  start(): void {
    if (this.timer !== null) {
      return;
    }

    // Detect the current IDE immediately rather than waiting
    // for the first interval.
    void this.poll();

    this.timer = setInterval(() => {
      void this.poll();
    }, this.pollIntervalMs);
  }

  /**
   * Stops monitoring and closes any currently active session.
   */
  async stop(): Promise<void> {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }

    await this.endActiveSession();
  }

  /**
   * Returns the IDE currently represented by the active session.
   */
  getActiveIde(): IdeSource | null {
    return this.activeIde;
  }

  /**
   * Returns the SQLite ID of the active session.
   */
  getActiveSessionId(): number | null {
    return this.activeSessionId;
  }

  /**
   * Returns the start timestamp of the active session (ISO 8601 format).
   */
  getActiveSessionStartedAt(): string | null {
    return this.sessionStartedAt ? this.sessionStartedAt.toISOString() : null;
  }

  /**
   * Returns all sessions for a given date (YYYY-MM-DD format).
   * Includes the currently active session with its live elapsed time if applicable.
   */
  getSessionsForDate(date: string) {
    const startOfDay = `${date}T00:00:00.000Z`;
    const endOfDay = `${date}T23:59:59.999Z`;

    const sessions = this.repository.getSessionsByDateRange(startOfDay, endOfDay);

    // If there's an active session that started today, include its current elapsed time
    if (this.activeSessionId !== null && this.sessionStartedAt !== null) {
      const activeSession = sessions.find(s => s.id === this.activeSessionId);
      if (activeSession && activeSession.endedAt === null) {
        const nowMs = Date.now();
        const startMs = Date.parse(activeSession.startedAt);
        const elapsedSeconds = Math.max(0, Math.floor((nowMs - startMs) / 1000));
        
        // Return a modified version showing current duration
        return sessions.map(s => 
          s.id === this.activeSessionId 
            ? { ...s, durationSeconds: elapsedSeconds }
            : s
        );
      }
    }

    return sessions;
  }
  private async handleSystemGap(lastKnownActiveTime: Date): Promise<void> {
    if (
      this.activeSessionId === null ||
      this.activeIde === null ||
      this.sessionStartedAt === null
    ) {
      return;
    }

    const durationSeconds = Math.max(
      0,
      Math.floor(
        (lastKnownActiveTime.getTime() - this.sessionStartedAt.getTime()) /
          1000,
      ),
    );

    this.repository.endSession(
      this.activeSessionId,
      lastKnownActiveTime.toISOString(),
      durationSeconds,
    );

    this.activeIde = null;
    this.activeSessionId = null;
    this.sessionStartedAt = null;
  }

  private async handleIdeChange(newIde: IdeSource | null): Promise<void> {
    // Close the previous session first.
    await this.endActiveSession();

    // null means the foreground application is not a supported IDE.
    if (newIde === null) {
      return;
    }

    const startedAt = this.now();

    const session = this.repository.createSession({
      ide: newIde,
      startedAt: startedAt.toISOString(),
      endedAt: null,
      durationSeconds: null,
    });

    this.activeIde = newIde;
    this.activeSessionId = session.id;
    this.sessionStartedAt = startedAt;
  }

  private async endActiveSession(): Promise<void> {
    if (
      this.activeSessionId === null ||
      this.activeIde === null ||
      this.sessionStartedAt === null
    ) {
      // Ensure the manager is in a clean inactive state.
      this.activeIde = null;
      this.activeSessionId = null;
      this.sessionStartedAt = null;
      return;
    }

    const endedAt = this.now();

    const durationSeconds = Math.max(
      0,
      Math.floor((endedAt.getTime() - this.sessionStartedAt.getTime()) / 1000),
    );

    this.repository.endSession(
      this.activeSessionId,
      endedAt.toISOString(),
      durationSeconds,
    );

    this.activeIde = null;
    this.activeSessionId = null;
    this.sessionStartedAt = null;
  }
}
