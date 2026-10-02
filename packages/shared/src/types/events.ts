/**
 * Supported IDE environment identifiers.
 */
export type IdeSource = "vscode" | "antigravity";

/**
 * High-level category of usage events captured locally.
 */
export type UsageEventType =
  | "session_start"
  | "session_end"
  | "session_heartbeat"
  | "file_opened"
  | "file_modified"
  | "file_saved"
  | "file_closed"
  | "window_focus_changed"
  | "command_executed";

/**
 * Base structure common to all local usage events.
 */
export interface BaseUsageEvent {
  /** Unique monotonic or UUID identifier for the event */
  id: string;
  /** Milliseconds since Unix epoch */
  timestamp: number;
  /** IDE platform from which this event originated */
  source: IdeSource;
  /** Identifier of the enclosing IDE session */
  sessionId: string;
}

/**
 * Event recorded when a session starts, ends, or sends a periodic heartbeat.
 */
export interface SessionLifecycleEvent extends BaseUsageEvent {
  type: "session_start" | "session_end" | "session_heartbeat";
  payload: {
    workspaceName: string | null;
    workspacePath: string | null;
    ideVersion?: string;
    extensionVersion?: string;
  };
}

/**
 * Event recorded for editor activity (focus, file changes, saves).
 */
export interface FileActivityEvent extends BaseUsageEvent {
  type: "file_opened" | "file_modified" | "file_saved" | "file_closed";
  payload: {
    /** Relative or anonymized project-relative path of the file */
    filePath: string;
    /** Detected programming language or file extension identifier */
    languageId: string;
    /** Total line count of the document at event time, if available */
    lineCount?: number;
    /** Character delta during modification, if available */
    changeCharacterCount?: number;
  };
}

/**
 * Event recorded when the IDE window gains or loses operating system focus.
 */
export interface WindowFocusEvent extends BaseUsageEvent {
  type: "window_focus_changed";
  payload: {
    isFocused: boolean;
  };
}

/**
 * Event recorded when a user triggers an editor command.
 */
export interface CommandExecutionEvent extends BaseUsageEvent {
  type: "command_executed";
  payload: {
    commandId: string;
  };
}

/**
 * Discriminated union of all recording events.
 */
export type UsageEvent =
  | SessionLifecycleEvent
  | FileActivityEvent
  | WindowFocusEvent
  | CommandExecutionEvent;

/**
 * Response payload returned by the local tracker service after ingestion.
 */
export interface IngestionResult {
  success: boolean;
  receivedCount: number;
  error?: string;
}
