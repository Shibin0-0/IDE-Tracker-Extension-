# IDE Usage Monitor

A professional, local-only VS Code usage tracker with zero telemetry and SQLite persistence.

## 🔒 Privacy & Security

- **100% Local**: All processing and storage occurs strictly on your machine
- **Zero Telemetry**: No external connections, analytics, or cloud services
- **Foreground-Only Tracking**: Only counts time when VS Code is the active foreground window
- **No User Content**: Does NOT collect file names, code, URLs, keystrokes, clipboard data, or screenshots
- **SQLite Persistence**: Data stored locally in VS Code's extension storage directory

## ⚙️ How It Works

When the extension activates (on VS Code startup):
1. Starts an in-process tracker service that polls the Windows foreground window API every second
2. Creates a session whenever VS Code becomes the active foreground window
3. Ends the session when VS Code loses focus or is closed
4. Stores all sessions in a local SQLite database
5. Provides a status bar display and dashboard for viewing your usage statistics

The tracker service binds strictly to `127.0.0.1:3210` for local HTTP communication between the tracker and the UI.

## 📋 Requirements

- **Windows 10/11** (currently Windows-only)
- **VS Code 1.90.0+** (for ESM extension support)
- **Node.js v20+** (bundled dependencies include native modules)

## 📦 Installation

### Option 1: Install from VSIX (Recommended)

1. Download or build the VSIX file (see Building section below)
2. In VS Code, open the Extensions view (`Ctrl+Shift+X`)
3. Click the `...` menu at the top of the Extensions view
4. Select "Install from VSIX..."
5. Choose the `ide-usage-monitor-0.1.0.vsix` file
6. Reload VS Code when prompted

The tracker starts automatically when VS Code starts. No manual configuration required.

### Option 2: Development Mode

For development or testing:

```bash
# From the repository root
npm install
npm run build:tsc

# Open in VS Code
code apps/vscode-extension

# Press F5 to launch Extension Development Host
```

## 🏗️ Building the VSIX

From the repository root:

```bash
# Install dependencies
npm install

# Build all TypeScript packages
npm run build:tsc

# Navigate to the extension directory
cd apps/vscode-extension

# Package the VSIX
npm run package
```

The VSIX file will be created as `ide-usage-monitor-0.1.0.vsix` in the `apps/vscode-extension` directory.

### What Gets Packaged

The packaging script automatically bundles:
- Compiled extension code (`dist/`)
- Compiled tracker service (`@ide-usage-monitor/tracker-service/dist/`)
- Compiled shared types (`@ide-usage-monitor/shared/dist/`)
- Native SQLite module (`better-sqlite3` with prebuilds for Windows)
- PowerShell script for Windows foreground window detection
- Runtime dependencies (`dotenv`)

## 📊 Usage

### Status Bar

The status bar (bottom-right) shows:
- 🟢 **Active**: VS Code is the foreground window and tracking is active
- ⚪ **Idle**: Tracker is running but VS Code is not in the foreground
- 🔴 **Offline**: Tracker service failed to start or is unavailable

The status bar also displays your VS Code usage time for today (e.g., "2h 14m").

### Dashboard

Open the dashboard with:
- Command Palette (`Ctrl+Shift+P`) → "IDE Usage Monitor: Open Dashboard"
- Or click the status bar item

The dashboard shows:
- **Today's Usage**: Total and VS Code-specific usage time
- **Current Session**: Live timer for the active session (updates every second)
- **Recent Sessions**: Chronological list of all sessions for the selected date

You can select historical dates using the date picker to view past usage.

## 🗄️ Data Storage

Session data is stored in VS Code's global storage directory:
```
%APPDATA%\Code\User\globalStorage\local.ide-usage-monitor\ide-usage.db
```

This SQLite database persists across:
- VS Code restarts
- Extension updates
- Extension reinstalls

To reset your data, delete this directory while VS Code is closed.

## 🔧 Troubleshooting

### Extension shows "Offline"

The tracker service failed to start. Possible causes:
- Port 3210 is already in use by another application
- PowerShell execution is blocked by system policy
- SQLite database file permissions issue

**Fix**: Check the VS Code Developer Tools Console (`Help → Toggle Developer Tools → Console`) for error messages.

### Multiple VS Code windows

The tracker counts whichever VS Code window is currently in the foreground. If you switch between multiple VS Code windows, each time you bring one to the foreground, tracking continues in a single active session.

### Tracker running after VS Code closes

This should not happen. The tracker is embedded in the extension host process and stops when VS Code exits. If you manually started a standalone tracker service (`node dist/index.js` in the tracker-service directory), that would persist independently—but the normal VSIX installation does not do this.

### Duplicate tracker instances

If the extension detects that port 3210 is already occupied, it assumes another tracker is running and connects to it instead of starting a duplicate. The status bar will still work normally. This is by design to prevent port conflicts.

## 🛠️ Architecture

```
VS Code Extension (apps/vscode-extension)
  ↓ starts in-process
Tracker Service (apps/tracker-service)
  ↓ polls every 1s
Windows Foreground Window API
  ↓ detects active window
Session Manager
  ↓ persists to
SQLite Database (better-sqlite3)
```

**Extension** (`extension.ts`):
- Starts the tracker in-process on activation
- Manages the status bar and dashboard UI
- Communicates with the tracker via HTTP (127.0.0.1:3210)

**Tracker Service**:
- Polls the Windows API to detect the foreground window
- Maps process names (`Code.exe`) to supported IDEs
- Creates/ends sessions based on foreground changes
- Provides HTTP API endpoints (`/health`, `/status`, `/usage`, `/sessions`)

**Database**:
- SQLite with WAL mode for concurrent access
- Stores session records: `id`, `ide`, `started_at`, `ended_at`, `duration_seconds`

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm test --workspace=@ide-usage-monitor/tracker-service
npm test --workspace=@ide-usage-monitor/vscode-extension

# Build
npm run build:tsc

# Lint
npm run lint
```

## 📄 License

Private / Proprietary. Strictly local usage.

## 🚧 Current Limitations

- **Windows only**: macOS and Linux support require platform-specific foreground window detection
- **VS Code only**: Antigravity IDE support is planned but not yet implemented
- **No export**: CSV/JSON export functionality not yet implemented
- **No configuration**: Port and polling interval are currently hardcoded

## 🗺️ Roadmap

- [ ] macOS support (via `NSWorkspace` API)
- [ ] Linux support (via X11 `_NET_ACTIVE_WINDOW` or Wayland)
- [ ] Antigravity IDE support
- [ ] CSV/JSON export
- [ ] Configurable polling interval
- [ ] Weekly/monthly usage summaries
