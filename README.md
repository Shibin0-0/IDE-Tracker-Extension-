# IDE Usage Monitor

A professional, local-only developer activity and IDE usage monitor engineered for privacy, security, and zero external dependencies.

---

## 🔒 Privacy & Architecture Guarantees

- **100% Local**: All processing occurs strictly on your machine.
- **Zero Cloud Services**: No servers to configure or connect to over the internet.
- **Zero Telemetry & External Analytics**: No tracking pixels, analytics SDKs, or external pings.
- **Embedded Persistence**: Stored in a local file-based SQLite database.
- **Strict Network Boundary**: Internal communication binds solely to `127.0.0.1` (loopback).

---

## 📁 Repository Structure

This repository is structured as a clean TypeScript monorepo using npm workspaces:

```text
.
├── .env.example                 # Root environment template (local-only configuration)
├── .gitignore                   # Git ignore protecting databases, secrets, and builds
├── .prettierrc                  # Prettier formatting rules
├── .prettierignore              # Prettier ignore patterns
├── eslint.config.mjs            # Strict ESLint flat configuration with TypeScript support
├── package.json                 # Monorepo root configuration & scripts
├── tsconfig.base.json           # Strict base TypeScript compiler options
├── tsconfig.json                # Project references configuration
├── README.md                    # Root project documentation
├── apps/
│   ├── tracker-service/         # Local Node.js service for persistent SQLite recording
│   │   ├── .env.example         # Service-specific environment variables
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── README.md
│   │   └── src/
│   │       ├── config/          # Environment parser & validation
│   │       ├── db/              # SQLite connection manager (better-sqlite3)
│   │       ├── services/        # Usage tracker service interface & placeholder
│   │       └── index.ts         # Service bootstrap & entry point
│   ├── vscode-extension/        # Visual Studio Code extension placeholder
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── README.md
│   │   └── src/
│   │       └── extension.ts     # VS Code activation/deactivation hooks
│   └── antigravity-extension/   # Antigravity IDE extension/plugin placeholder
│       ├── package.json
│       ├── tsconfig.json
│       ├── README.md
│       └── src/
│           └── index.ts         # Antigravity integration hooks
└── packages/
    └── shared/                  # Common TypeScript types, contracts, and constants
        ├── package.json
        ├── tsconfig.json
        ├── README.md
        └── src/
            ├── constants/       # Ports, endpoints, and storage defaults
            ├── types/           # Events, sessions, and metric interfaces
            └── index.ts         # Shared barrel export
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: `v20.0.0` or higher (verified on Node `v22.x`)
- **npm**: `v9.0.0` or higher

### Installation

Install all workspace dependencies from the repository root:

```bash
npm install
```

### Building the Project

Compile TypeScript across all packages and apps using project references:

```bash
npm run build:tsc
```

Or run package-level builds:

```bash
npm run build
```

### Linting and Code Quality

Run strict TypeScript ESLint checks across all workspaces:

```bash
npm run lint
```

Automatically apply formatting and style fixes:

```bash
npm run format
npm run lint:fix
```

---

## ⚙️ Configuration

Copy `.env.example` to `.env` in the root or in `apps/tracker-service` to customize local settings:

| Variable        | Default               | Purpose                                              |
| :-------------- | :-------------------- | :--------------------------------------------------- |
| `HOST`          | `127.0.0.1`           | Loopback address strictly for local IPC              |
| `PORT`          | `47392`               | Port for local IPC                                   |
| `DATABASE_PATH` | `./data/ide-usage.db` | Local SQLite database file path                      |
| `LOG_LEVEL`     | `info`                | Logging verbosity (`error`, `warn`, `info`, `debug`) |
| `NODE_ENV`      | `development`         | Node environment                                     |

---

## 📄 License

Private / Proprietary. Strictly local usage.
