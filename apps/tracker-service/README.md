# @ide-usage-monitor/tracker-service

Local-only backend service responsible for receiving, aggregating, and persistently recording IDE usage events into a local SQLite database.

## Principles

- **100% Local**: Strictly binds to `127.0.0.1`. No external ports, no cloud telemetry, no telemetry beacons.
- **Embedded Persistence**: Uses `better-sqlite3` for file-based local storage.
- **Privacy-First Active-Window Detection**: Detects when supported IDEs own the foreground application window without tracking user content.

## Active-Window Detection Layer

The active-window detection layer (`ActiveWindowProvider`) identifies whether the currently focused Windows application belongs to a supported IDE.

### How it Works

1. Queries the active foreground window using the Windows API (`GetForegroundWindow`).
2. Obtains the process identifier (`GetWindowThreadProcessId`).
3. Reads the process/executable identity (`Get-Process`).
4. Maps the executable name to a normalized IDE identifier (`vscode` | `antigravity`).
5. Returns `{ ide: "vscode" | "antigravity" }` or `null` if an unsupported window is focused.

### Privacy Guarantees

- **No User Content**: Does NOT collect window titles, file names, active document paths, URLs, keystrokes, clipboard data, or screenshots.
- **Only Process Identity**: Only inspects process/executable image names (e.g., `Code.exe` or `Antigravity.exe`).
- **Foreground Only**: Only counts usage when a supported IDE is actively in the foreground (background processes do not register as active usage).
- **Multiple Windows**: Naturally handles multiple windows of the same IDE by resolving whichever window is in the foreground.

### Platform Support

- **Current Implementation**: Windows-first (`WindowsActiveWindowProvider`).
- **Modular Interface**: Designed behind `ActiveWindowProvider` so macOS (`NSWorkspace`) and Linux (`_NET_ACTIVE_WINDOW`) providers can be added without modifying the core tracker.

### Configurable Process Identities

Verified process identities in this Windows environment:

- **VS Code**: `Code.exe`, `Code`, `Code - Insiders.exe`, `Code - Insiders`
- **Antigravity**: `Antigravity.exe`, `Antigravity`, `Antigravity IDE.exe`, `Antigravity IDE`, `Antigravity-x64.exe`

Custom process names can be supplied via environment variables:

- `VSCODE_PROCESS_NAMES` (comma-separated list of executable/process names)
- `ANTIGRAVITY_PROCESS_NAMES` (comma-separated list of executable/process names)

## Configuration

Copy `.env.example` to `.env` to configure ports and file locations:

```bash
HOST=127.0.0.1
PORT=47392
DATABASE_PATH=./data/ide-usage.db
LOG_LEVEL=info
```
