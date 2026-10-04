import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { IdeSource } from "@ide-usage-monitor/shared";

import { createDatabaseManager } from "../db/index.js";
import type { ActiveWindowProvider } from "../providers/active-window-provider.interface.js";
import { SessionManager } from "./session-manager.js";

function createFakeProvider(initialIde: IdeSource | null): {
  provider: ActiveWindowProvider;
  setActiveIde(ide: IdeSource | null): void;
} {
  let activeIde = initialIde;

  return {
    provider: {
      async getActiveIde() {
        return { ide: activeIde };
      },
    },
    setActiveIde(ide) {
      activeIde = ide;
    },
  };
}

function createTestManager(
  provider: ActiveWindowProvider,
  now: () => Date,
): ReturnType<typeof createManagerParts> {
  return createManagerParts(provider, now);
}

function createManagerParts(provider: ActiveWindowProvider, now: () => Date) {
  const dbManager = createDatabaseManager(":memory:");
  dbManager.initializeTables();

  const manager = new SessionManager(
    provider,
    dbManager.getSessionRepository(),
    {
      now,
    },
  );

  return { manager, dbManager };
}

describe("SessionManager", () => {
  it("starts a session when an IDE becomes active", async () => {
    const currentTime = new Date("2026-10-02T10:00:00.000Z");

    const fake = createFakeProvider("vscode");
    const { manager, dbManager } = createTestManager(
      fake.provider,
      () => currentTime,
    );

    await manager.poll();

    assert.equal(manager.getActiveIde(), "vscode");
    assert.equal(manager.getActiveSessionId(), 1);

    const sessions = dbManager.getSessionRepository().getSessions();

    assert.equal(sessions.length, 1);
    assert.equal(sessions[0]!.ide, "vscode");
    assert.equal(sessions[0]!.durationSeconds, null);

    dbManager.close();
  });

  it("does not create duplicate sessions while the same IDE remains active", async () => {
    let currentTime = new Date("2026-10-02T10:00:00.000Z");

    const fake = createFakeProvider("vscode");
    const { manager, dbManager } = createTestManager(
      fake.provider,
      () => currentTime,
    );

    await manager.poll();

    currentTime = new Date("2026-10-02T10:00:05.000Z");
    await manager.poll();

    const sessions = dbManager.getSessionRepository().getSessions();

    assert.equal(sessions.length, 1);
    assert.equal(manager.getActiveSessionId(), 1);

    dbManager.close();
  });

  it("ends the old session and starts a new one when the IDE changes", async () => {
    let currentTime = new Date("2026-10-02T10:00:00.000Z");

    const fake = createFakeProvider("vscode");
    const { manager, dbManager } = createTestManager(
      fake.provider,
      () => currentTime,
    );

    await manager.poll();

    currentTime = new Date("2026-10-02T10:00:10.000Z");
    fake.setActiveIde("antigravity");

    await manager.poll();

    const sessions = dbManager.getSessionRepository().getSessions();

    assert.equal(sessions.length, 2);

    assert.equal(sessions[0]!.ide, "vscode");
    assert.equal(sessions[0]!.durationSeconds, 10);

    assert.equal(sessions[1]!.ide, "antigravity");
    assert.equal(sessions[1]!.durationSeconds, null);

    assert.equal(manager.getActiveIde(), "antigravity");
    assert.equal(manager.getActiveSessionId(), 2);

    dbManager.close();
  });

  it("ends the session when a non-IDE application becomes active", async () => {
    let currentTime = new Date("2026-10-02T10:00:00.000Z");

    const fake = createFakeProvider("vscode");
    const { manager, dbManager } = createTestManager(
      fake.provider,
      () => currentTime,
    );

    await manager.poll();

    currentTime = new Date("2026-10-02T10:00:10.000Z");
    fake.setActiveIde(null);

    await manager.poll();

    const sessions = dbManager.getSessionRepository().getSessions();

    assert.equal(sessions.length, 1);
    assert.equal(sessions[0]!.ide, "vscode");
    assert.equal(sessions[0]!.durationSeconds, 10);

    assert.equal(manager.getActiveIde(), null);
    assert.equal(manager.getActiveSessionId(), null);

    dbManager.close();
  });

  it("ends an active session when stopped", async () => {
    let currentTime = new Date("2026-10-02T10:00:00.000Z");

    const fake = createFakeProvider("vscode");
    const { manager, dbManager } = createTestManager(
      fake.provider,
      () => currentTime,
    );

    await manager.poll();

    currentTime = new Date("2026-10-02T10:00:15.000Z");
    await manager.stop();

    const sessions = dbManager.getSessionRepository().getSessions();

    assert.equal(sessions.length, 1);
    assert.equal(sessions[0]!.durationSeconds, 15);

    assert.equal(manager.getActiveIde(), null);
    assert.equal(manager.getActiveSessionId(), null);

    dbManager.close();
  });
  it("does not count a long polling gap as active IDE time", async () => {
    let currentTime = new Date("2026-10-02T10:00:00.000Z");

    const fake = createFakeProvider("vscode");
    const { manager, dbManager } = createTestManager(
      fake.provider,
      () => currentTime,
    );

    await manager.poll();

    // The computer is effectively suspended during this gap.
    currentTime = new Date("2026-10-02T10:15:00.000Z");

    await manager.poll();

    const sessions = dbManager.getSessionRepository().getSessions();

    assert.equal(sessions.length, 2);

    assert.equal(sessions[0]!.ide, "vscode");
    assert.equal(sessions[0]!.durationSeconds, 0);

    assert.equal(sessions[1]!.ide, "vscode");
    assert.equal(sessions[1]!.durationSeconds, null);

    assert.equal(manager.getActiveIde(), "vscode");

    dbManager.close();
  });
});
