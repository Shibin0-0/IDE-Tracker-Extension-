#!/usr/bin/env node
/**
 * prepare-package.mjs
 *
 * Pre-packaging script for the VS Code extension VSIX.
 *
 * Because this is a monorepo, workspace packages are symlinked in the root
 * node_modules rather than physically present inside the extension's own
 * node_modules. vsce does NOT follow symlinks, so we must copy the built
 * artifacts and external dependencies into the extension's local node_modules
 * before running `vsce package`.
 *
 * What this script does:
 *   1. Copies packages/shared dist -> extension/node_modules/@ide-usage-monitor/shared
 *   2. Copies apps/tracker-service dist -> extension/node_modules/@ide-usage-monitor/tracker-service
 *   3. Copies better-sqlite3 (with prebuilds) -> extension/node_modules/better-sqlite3
 *   4. Copies dotenv -> extension/node_modules/dotenv
 *
 * This is idempotent and safe to re-run.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Paths relative to this script (apps/vscode-extension/)
const EXTENSION_ROOT = __dirname;
const MONOREPO_ROOT = path.resolve(EXTENSION_ROOT, "../..");
const ROOT_NODE_MODULES = path.join(MONOREPO_ROOT, "node_modules");
const EXTENSION_NODE_MODULES = path.join(EXTENSION_ROOT, "node_modules");

function copyDir(src, dest) {
  // Ensure destination directory exists
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  // Read source directory
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isSymbolicLink()) {
      // Skip symlinks — we only want real files
      continue;
    }
    
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function copyPackage(src, destName) {
  const dest = path.join(EXTENSION_NODE_MODULES, destName);
  console.log(`  Copying ${src} -> ${dest}`);
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }
  copyDir(src, dest);
}

console.log("Preparing extension node_modules for VSIX packaging...\n");

// 1. @ide-usage-monitor/shared  (built ts)
copyPackage(
  path.join(MONOREPO_ROOT, "packages", "shared"),
  path.join("@ide-usage-monitor", "shared"),
);

// 2. @ide-usage-monitor/tracker-service  (built ts — dist + PS1 script)
copyPackage(
  path.join(MONOREPO_ROOT, "apps", "tracker-service"),
  path.join("@ide-usage-monitor", "tracker-service"),
);

// 3. better-sqlite3  (native module — include prebuilds)
copyPackage(
  path.join(ROOT_NODE_MODULES, "better-sqlite3"),
  "better-sqlite3",
);

// 4. dotenv
copyPackage(
  path.join(ROOT_NODE_MODULES, "dotenv"),
  "dotenv",
);

console.log("\nDone. Run `npx @vscode/vsce package` to create the VSIX.");
