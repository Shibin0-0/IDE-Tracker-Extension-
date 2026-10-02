import type { IdeSource } from "@ide-usage-monitor/shared";
import type {
  ActiveIdeResult,
  ActiveWindowProvider,
} from "../providers/active-window-provider.interface.js";
import type { SessionRepository } from "../db/sessions.repository.js";

export interface SessionManagerOptions {
  pollIntervalMs?: number;
  now?: () => Date;
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

  constructor(
    provider: ActiveWindowProvider,
    repository: SessionRepository,
    options: SessionManagerOptions = {},
  ) {
    this.provider = provider;
    this.repository = repository;
    this.pollIntervalMs = options.pollIntervalMs ?? 1000;
    this.now = options.now ?? (() => new Date());
  }

  /**
   * Performs one foreground-IDE check.
   *
   * This method is public so it can be tested independently of
   * the background polling timer.
   */
  async poll(): Promise<void> {
    // Prevent overlapping polls if an OS query takes longer than
    // the configured polling interval.
    if (this.polling) {
      return;
    }

    this.polling = true;

    try {
      const result: ActiveIdeResult | null =
        await this.provider.getActiveIde();

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

  private async handleIdeChange(
    newIde: IdeSource | null,
  ): Promise<void> {
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
      Math.floor(
        (endedAt.getTime() - this.sessionStartedAt.getTime()) / 1000,
      ),
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