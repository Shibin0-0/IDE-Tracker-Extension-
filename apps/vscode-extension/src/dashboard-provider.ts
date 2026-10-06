import * as vscode from "vscode";
import type { TrackerClient } from "./tracker-client.js";

/**
 * Manages the dashboard Webview panel.
 * 
 * Provides a compact VS Code-integrated dashboard showing:
 * - Current tracker status
 * - Today's total and VS Code usage
 * - Current session information
 * - Recent session history with date selection
 * 
 * The Webview auto-refreshes every 5 seconds and uses VS Code theme variables.
 */
export class DashboardProvider {
  private panel: vscode.WebviewPanel | null = null;
  private readonly trackerClient: TrackerClient;
  private readonly extensionUri: vscode.Uri;

  constructor(trackerClient: TrackerClient, extensionUri: vscode.Uri) {
    this.trackerClient = trackerClient;
    this.extensionUri = extensionUri;
  }

  /**
   * Shows the dashboard Webview panel.
   * Creates a new panel if one doesn't exist, or reveals the existing panel.
   */
  public show(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "ideUsageMonitorDashboard",
      "IDE Usage Monitor",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this.extensionUri],
      }
    );

    this.panel.webview.html = this.getWebviewContent();

    // Handle messages from the Webview
    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        await this.handleWebviewMessage(message);
      },
      null,
      []
    );

    // Clean up when panel is closed
    this.panel.onDidDispose(
      () => {
        this.panel = null;
      },
      null,
      []
    );
  }

  /**
   * Handles messages from the Webview.
   */
  private async handleWebviewMessage(message: {
    command: string;
    date?: string;
  }): Promise<void> {
    if (!this.panel) return;

    switch (message.command) {
      case "getStatus": {
        const result = await this.trackerClient.getStatus();
        this.panel.webview.postMessage({
          command: "statusUpdate",
          data: result.success ? result.data : null,
          error: result.success ? null : result.error,
        });
        break;
      }

      case "getUsage": {
        const date = message.date ?? new Date().toISOString().split("T")[0];
        const result = await this.trackerClient.getUsage(date);
        this.panel.webview.postMessage({
          command: "usageUpdate",
          data: result.success ? result.data : null,
          error: result.success ? null : result.error,
        });
        break;
      }

      case "getSessions": {
        const date = message.date ?? new Date().toISOString().split("T")[0];
        const result = await this.trackerClient.getSessions(date);
        this.panel.webview.postMessage({
          command: "sessionsUpdate",
          data: result.success ? result.data : null,
          error: result.success ? null : result.error,
        });
        break;
      }
    }
  }

  /**
   * Generates the HTML content for the Webview.
   */
  private getWebviewContent(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>IDE Usage Monitor</title>
  <style>
    body {
      padding: 0;
      margin: 0;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-editor-foreground);
      background-color: var(--vscode-editor-background);
    }

    .container {
      padding: 16px;
      max-width: 800px;
    }

    /* Header */
    .header {
      margin-bottom: 20px;
    }

    .header-title {
      font-size: 16px;
      font-weight: 600;
      margin: 0 0 6px 0;
      color: var(--vscode-editor-foreground);
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
      background-color: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }

    .status-badge.active {
      background-color: var(--vscode-charts-green);
      color: var(--vscode-editor-background);
    }

    .status-badge.idle {
      background-color: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }

    .status-badge.offline {
      background-color: var(--vscode-testing-iconFailed);
      color: var(--vscode-editor-background);
    }

    .status-icon {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    .status-icon.filled {
      background-color: currentColor;
    }

    .status-icon.outline {
      border: 2px solid currentColor;
      background-color: transparent;
    }

    /* Section */
    .section {
      margin-bottom: 24px;
    }

    .section-title {
      font-size: 13px;
      font-weight: 600;
      margin: 0 0 10px 0;
      color: var(--vscode-editor-foreground);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* Cards */
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin-bottom: 8px;
    }

    .card {
      background-color: var(--vscode-sideBar-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 12px 14px;
    }

    .card-label {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .card-value {
      font-size: 24px;
      font-weight: 600;
      color: var(--vscode-editor-foreground);
      font-variant-numeric: tabular-nums;
    }

    /* Current Session Card */
    .current-session-card {
      display: flex;
      align-items: center;
      gap: 16px;
      background-color: var(--vscode-sideBar-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 12px 14px;
      font-size: 13px;
    }

    .current-session-card .status-badge {
      flex-shrink: 0;
    }

    .current-session-ide {
      flex-grow: 1;
      font-weight: 500;
    }

    .current-session-duration {
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      color: var(--vscode-textLink-foreground);
    }

    .current-session-empty {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }

    /* Session History */
    .session-history-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }

    .date-input {
      padding: 4px 8px;
      background-color: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      font-size: 12px;
      font-family: var(--vscode-font-family);
    }

    .date-input:focus {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: -1px;
    }

    .sessions-list {
      background-color: var(--vscode-sideBar-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      overflow: hidden;
    }

    .session-row {
      display: grid;
      grid-template-columns: auto auto 1fr auto;
      gap: 12px;
      padding: 10px 14px;
      font-size: 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
      align-items: center;
    }

    .session-row:last-child {
      border-bottom: none;
    }

    .session-time {
      color: var(--vscode-descriptionForeground);
      font-variant-numeric: tabular-nums;
    }

    .session-duration {
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      color: var(--vscode-textLink-foreground);
      text-align: right;
    }

    .session-ide {
      font-weight: 500;
      text-align: right;
    }

    .empty-state {
      padding: 32px 16px;
      text-align: center;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }

    .error-message {
      background-color: var(--vscode-inputValidation-errorBackground);
      border: 1px solid var(--vscode-inputValidation-errorBorder);
      color: var(--vscode-errorForeground);
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      margin-bottom: 16px;
      display: none;
    }

    .error-message.visible {
      display: block;
    }

    .refresh-info {
      margin-top: 16px;
      text-align: center;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <h1 class="header-title">IDE Usage Monitor</h1>
      <div id="header-status" class="status-badge offline">
        <span class="status-icon filled"></span>
        <span>Offline</span>
      </div>
    </div>

    <div id="error" class="error-message"></div>

    <!-- Usage Section -->
    <div class="section">
      <h2 class="section-title"><span id="usage-title">Today's Usage</span></h2>
      <div class="cards-grid">
        <div class="card">
          <div class="card-label">Total Usage</div>
          <div class="card-value" id="total-usage">--</div>
        </div>
        <div class="card">
          <div class="card-label">VS Code</div>
          <div class="card-value" id="vscode-usage">--</div>
        </div>
      </div>
    </div>

    <!-- Current Session Section -->
    <div class="section">
      <h2 class="section-title">Current Session</h2>
      <div id="current-session" class="current-session-card">
        <span class="current-session-empty">No active session</span>
      </div>
    </div>

    <!-- Session History Section -->
    <div class="section">
      <div class="session-history-header">
        <h2 class="section-title" style="margin: 0;">Recent Sessions</h2>
        <input type="date" id="date-picker" class="date-input" />
      </div>
      <div class="sessions-list" id="sessions-list">
        <div class="empty-state">Loading sessions...</div>
      </div>
    </div>

    <p class="refresh-info">Dashboard refreshes every 5 seconds</p>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    let currentDate = new Date().toISOString().split('T')[0];
    let activeSessionStartTime = null;
    let activeSessionIde = null;

    // Format seconds to human-readable duration
    function formatDuration(seconds) {
      if (seconds === 0) return '0m';
      
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      
      if (hours === 0) {
        return minutes + 'm';
      }
      
      return hours + 'h ' + minutes + 'm';
    }

    // Format time from ISO string to HH:MM AM/PM
    function formatTime(isoString) {
      const date = new Date(isoString);
      return date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
    }

    // Format IDE name for display
    function formatIdeName(ide) {
      if (ide === 'vscode') return 'VS Code';
      if (ide === 'antigravity') return 'Antigravity';
      return ide.charAt(0).toUpperCase() + ide.slice(1);
    }

    // Show error message
    function showError(message) {
      const errorEl = document.getElementById('error');
      if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.add('visible');
      }
    }

    // Hide error message
    function hideError() {
      const errorEl = document.getElementById('error');
      if (errorEl) {
        errorEl.classList.remove('visible');
      }
    }

    // Update header status badge
    function updateHeaderStatus(activeIde) {
      const badge = document.getElementById('header-status');
      if (!badge) return;

      if (activeIde === null) {
        badge.className = 'status-badge idle';
        badge.innerHTML = '<span class="status-icon outline"></span><span>Idle</span>';
      } else {
        badge.className = 'status-badge active';
        badge.innerHTML = '<span class="status-icon filled"></span><span>Active</span>';
      }
    }

    // Update current session display
    function updateCurrentSession(statusData) {
      const container = document.getElementById('current-session');
      if (!container) return;

      // Only show current session when viewing today
      const today = new Date().toISOString().split('T')[0];
      if (currentDate !== today) {
        container.innerHTML = '<span class="current-session-empty">No active session</span>';
        activeSessionStartTime = null;
        activeSessionIde = null;
        return;
      }

      if (!statusData || statusData.activeIde === null || !statusData.activeSessionStartedAt) {
        container.innerHTML = '<span class="current-session-empty">No active session</span>';
        activeSessionStartTime = null;
        activeSessionIde = null;
        return;
      }

      const ide = formatIdeName(statusData.activeIde);
      activeSessionIde = statusData.activeIde;
      
      // Use the tracker's session start time (parse ISO 8601 timestamp)
      const trackerStartTime = new Date(statusData.activeSessionStartedAt).getTime();
      if (!activeSessionStartTime || activeSessionStartTime !== trackerStartTime) {
        activeSessionStartTime = trackerStartTime;
      }

      const elapsedSeconds = Math.floor((Date.now() - activeSessionStartTime) / 1000);
      const duration = formatDuration(elapsedSeconds);

      container.innerHTML = \`
        <div class="status-badge active">
          <span class="status-icon filled"></span>
          <span>Active</span>
        </div>
        <span class="current-session-ide">\${ide}</span>
        <span class="current-session-duration">\${duration}</span>
      \`;
    }

    // Update current session duration (called every second)
    function updateCurrentSessionDuration() {
      if (!activeSessionStartTime || !activeSessionIde) return;

      const elapsedSeconds = Math.floor((Date.now() - activeSessionStartTime) / 1000);
      const duration = formatDuration(elapsedSeconds);
      
      const durationEl = document.querySelector('.current-session-duration');
      if (durationEl) {
        durationEl.textContent = duration;
      }
    }

    // Request status from extension
    function requestStatus() {
      vscode.postMessage({ command: 'getStatus' });
    }

    // Request usage from extension
    function requestUsage(date) {
      vscode.postMessage({ command: 'getUsage', date });
    }

    // Request sessions from extension
    function requestSessions(date) {
      vscode.postMessage({ command: 'getSessions', date });
    }

    // Handle messages from extension
    window.addEventListener('message', event => {
      const message = event.data;

      switch (message.command) {
        case 'statusUpdate':
          if (message.data) {
            updateHeaderStatus(message.data.activeIde);
            updateCurrentSession(message.data);
            hideError();
          } else {
            updateHeaderStatus(null);
            updateCurrentSession(null);
            const badge = document.getElementById('header-status');
            if (badge) {
              badge.className = 'status-badge offline';
              badge.innerHTML = '<span class="status-icon filled"></span><span>Offline</span>';
            }
          }
          break;

        case 'usageUpdate':
          if (message.data) {
            const totalEl = document.getElementById('total-usage');
            const vscodeEl = document.getElementById('vscode-usage');
            
            if (totalEl) {
              totalEl.textContent = formatDuration(message.data.totalSeconds);
            }
            if (vscodeEl) {
              vscodeEl.textContent = formatDuration(message.data.byIde.vscode || 0);
            }
            hideError();
          }
          break;

        case 'sessionsUpdate':
          const listEl = document.getElementById('sessions-list');
          if (!listEl) break;

          if (message.error) {
            listEl.innerHTML = '<div class="empty-state">Failed to load sessions</div>';
            break;
          }

          if (!message.data || !message.data.sessions || message.data.sessions.length === 0) {
            listEl.innerHTML = '<div class="empty-state">No sessions recorded for this date</div>';
            break;
          }

          // Sort sessions by start time (newest first)
          const sortedSessions = [...message.data.sessions].sort((a, b) => 
            new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
          );

          listEl.innerHTML = sortedSessions.map(session => {
            const duration = session.durationSeconds !== null ? session.durationSeconds : 0;
            const startTime = formatTime(session.startedAt);
            const endTime = session.endedAt ? formatTime(session.endedAt) : 'active';
            const ide = formatIdeName(session.ide);
            
            return \`
              <div class="session-row">
                <span class="session-time">\${startTime}</span>
                <span class="session-time">-</span>
                <span class="session-time">\${endTime}</span>
                <span class="session-duration">\${formatDuration(duration)}</span>
                <span class="session-ide">\${ide}</span>
              </div>
            \`;
          }).join('');
          break;
      }
    });

    // Update usage title based on selected date
    function updateUsageTitle(date) {
      const titleEl = document.getElementById('usage-title');
      if (!titleEl) return;
      
      const today = new Date().toISOString().split('T')[0];
      if (date === today) {
        titleEl.textContent = "Today's Usage";
      } else {
        const dateObj = new Date(date + 'T00:00:00');
        const formatted = dateObj.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric', 
          year: 'numeric' 
        });
        titleEl.textContent = formatted + " Usage";
      }
    }

    // Initialize date picker
    const datePicker = document.getElementById('date-picker');
    if (datePicker) {
      const today = new Date().toISOString().split('T')[0];
      datePicker.value = today;
      datePicker.max = today;
      
      datePicker.addEventListener('change', () => {
        currentDate = datePicker.value;
        updateUsageTitle(currentDate);
        requestUsage(currentDate);
        requestSessions(currentDate);
        // Re-evaluate current session display when date changes
        requestStatus();
      });
    }

    // Initial data load
    updateUsageTitle(currentDate);
    requestStatus();
    requestUsage(currentDate);
    requestSessions(currentDate);

    // Refresh every 5 seconds
    setInterval(() => {
      requestStatus();
      
      // Refresh usage and sessions if viewing today
      const today = new Date().toISOString().split('T')[0];
      if (currentDate === today) {
        requestUsage(currentDate);
        requestSessions(currentDate);
      }
    }, 5000);

    // Update current session duration every second
    setInterval(updateCurrentSessionDuration, 1000);
  </script>
</body>
</html>`;
  }
}
