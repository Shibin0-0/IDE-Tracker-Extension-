import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { IdeProcessRegistry } from "./ide-process-registry.js";

describe("IdeProcessRegistry (OS-Independent Mapping & Normalization)", () => {
  const registry = new IdeProcessRegistry();

  describe('1. Known VS Code executable maps to "vscode"', () => {
    it('maps "Code.exe" to "vscode"', () => {
      assert.strictEqual(registry.resolveIde("Code.exe"), "vscode");
    });

    it('maps "Code" (process name without extension) to "vscode"', () => {
      assert.strictEqual(registry.resolveIde("Code"), "vscode");
    });

    it('maps "code.exe" to "vscode"', () => {
      assert.strictEqual(registry.resolveIde("code.exe"), "vscode");
    });

    it('maps "Code - Insiders.exe" to "vscode"', () => {
      assert.strictEqual(registry.resolveIde("Code - Insiders.exe"), "vscode");
    });

    it('maps "Code - Insiders" to "vscode"', () => {
      assert.strictEqual(registry.resolveIde("Code - Insiders"), "vscode");
    });

    it('maps full Windows executable path for VS Code to "vscode"', () => {
      assert.strictEqual(
        registry.resolveIde("C:\\Coding\\Microsoft VS Code\\Code.exe"),
        "vscode",
      );
    });
  });

  describe('2. Known Antigravity executable maps to "antigravity"', () => {
    it('maps "Antigravity.exe" to "antigravity"', () => {
      assert.strictEqual(registry.resolveIde("Antigravity.exe"), "antigravity");
    });

    it('maps "Antigravity" to "antigravity"', () => {
      assert.strictEqual(registry.resolveIde("Antigravity"), "antigravity");
    });

    it('maps "Antigravity IDE.exe" to "antigravity"', () => {
      assert.strictEqual(
        registry.resolveIde("Antigravity IDE.exe"),
        "antigravity",
      );
    });

    it('maps "Antigravity IDE" to "antigravity"', () => {
      assert.strictEqual(registry.resolveIde("Antigravity IDE"), "antigravity");
    });

    it('maps "Antigravity-x64.exe" to "antigravity"', () => {
      assert.strictEqual(
        registry.resolveIde("Antigravity-x64.exe"),
        "antigravity",
      );
    });

    it('maps "agy.exe" to "antigravity"', () => {
      assert.strictEqual(registry.resolveIde("agy.exe"), "antigravity");
    });

    it('maps "agy" to "antigravity"', () => {
      assert.strictEqual(registry.resolveIde("agy"), "antigravity");
    });

    it('maps full Windows executable path for Antigravity to "antigravity"', () => {
      assert.strictEqual(
        registry.resolveIde(
          "C:\\Users\\shibi\\AppData\\Local\\Programs\\antigravity\\Antigravity.exe",
        ),
        "antigravity",
      );
    });
  });

  describe("3. Unknown executable maps to null", () => {
    it('maps "chrome.exe" to null', () => {
      assert.strictEqual(registry.resolveIde("chrome.exe"), null);
    });

    it('maps "notepad.exe" to null', () => {
      assert.strictEqual(registry.resolveIde("notepad.exe"), null);
    });

    it('maps "explorer.exe" to null', () => {
      assert.strictEqual(registry.resolveIde("explorer.exe"), null);
    });

    it('maps "terminal.exe" to null', () => {
      assert.strictEqual(registry.resolveIde("terminal.exe"), null);
    });

    it('maps "slack" to null', () => {
      assert.strictEqual(registry.resolveIde("slack"), null);
    });
  });

  describe("4. Case differences are handled correctly", () => {
    it('handles uppercase "CODE.EXE" as "vscode"', () => {
      assert.strictEqual(registry.resolveIde("CODE.EXE"), "vscode");
    });

    it('handles mixed case "cOdE" as "vscode"', () => {
      assert.strictEqual(registry.resolveIde("cOdE"), "vscode");
    });

    it('handles uppercase "ANTIGRAVITY.EXE" as "antigravity"', () => {
      assert.strictEqual(registry.resolveIde("ANTIGRAVITY.EXE"), "antigravity");
    });

    it('handles mixed case "AnTiGrAvItY iDe.ExE" as "antigravity"', () => {
      assert.strictEqual(
        registry.resolveIde("AnTiGrAvItY iDe.ExE"),
        "antigravity",
      );
    });
  });

  describe("5. Empty/invalid executable identity returns null", () => {
    it("returns null for empty string", () => {
      assert.strictEqual(registry.resolveIde(""), null);
    });

    it("returns null for whitespace-only string", () => {
      assert.strictEqual(registry.resolveIde("   "), null);
    });

    it("returns null for null", () => {
      assert.strictEqual(registry.resolveIde(null), null);
    });

    it("returns null for undefined", () => {
      assert.strictEqual(registry.resolveIde(undefined), null);
    });
  });

  describe("Configurability & Custom Mappings", () => {
    it("supports custom executable mappings", () => {
      const customRegistry = new IdeProcessRegistry({
        customMappings: [
          {
            ide: "vscode",
            processNames: ["custom-vscode-fork.exe"],
          },
        ],
      });

      assert.strictEqual(
        customRegistry.resolveIde("custom-vscode-fork.exe"),
        "vscode",
      );
      // Default 'Code.exe' should not match when customMappings overrides
      assert.strictEqual(customRegistry.resolveIde("Code.exe"), null);
    });

    it("supports supplementary extra process names", () => {
      const customRegistry = new IdeProcessRegistry({
        extraAntigravityProcessNames: ["antigravity-custom-build.exe"],
      });

      // Default still works
      assert.strictEqual(
        customRegistry.resolveIde("Antigravity.exe"),
        "antigravity",
      );
      // Extra also works
      assert.strictEqual(
        customRegistry.resolveIde("antigravity-custom-build.exe"),
        "antigravity",
      );
    });
  });
});
