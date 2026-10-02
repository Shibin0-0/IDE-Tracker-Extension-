# @ide-usage-monitor/shared

Common TypeScript types, interfaces, schemas, and constants shared across the IDE Usage Monitor monorepo.

## Scope

- **Event Definitions**: Strongly typed contracts for IDE events (`session_start`, `file_modified`, `window_focus_changed`, etc.).
- **Session Types**: Metadata models representing IDE usage intervals.
- **Metric Models**: Aggregated data representations for local reporting.
- **Constants**: Default loopback host (`127.0.0.1`), ports, and API endpoints.

## Zero Dependencies

This package has **zero runtime dependencies** to keep bundle sizes minimal and prevent security or supply-chain concerns.
