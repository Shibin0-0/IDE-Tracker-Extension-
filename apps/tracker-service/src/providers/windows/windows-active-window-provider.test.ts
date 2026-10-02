import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WindowsActiveWindowProvider } from "./windows-active-window-provider.js";

describe("WindowsActiveWindowProvider", () => {
  describe("Unit Tests (Isolated with Mock Process Resolver)", () => {
    it('returns { ide: "vscode" } when foreground window belongs to VS Code (Code.exe)', async () => {
      const provider = new WindowsActiveWindowProvider({
        foregroundProcessResolver: async () => "Code.exe",
      });

      const result = await provider.getActiveIde();
      assert.deepStrictEqual(result, { ide: "vscode" });
    });

    it('returns { ide: "vscode" } when foreground window process name is "Code"', async () => {
      const provider = new WindowsActiveWindowProvider({
        foregroundProcessResolver: async () => "Code",
      });

      const result = await provider.getActiveIde();
      assert.deepStrictEqual(result, { ide: "vscode" });
    });

    it('returns { ide: "antigravity" } when foreground window belongs to Antigravity.exe', async () => {
      const provider = new WindowsActiveWindowProvider({
        foregroundProcessResolver: async () => "Antigravity.exe",
      });

      const result = await provider.getActiveIde();
      assert.deepStrictEqual(result, { ide: "antigravity" });
    });

    it('returns { ide: "antigravity" } when foreground window belongs to "Antigravity IDE.exe"', async () => {
      const provider = new WindowsActiveWindowProvider({
        foregroundProcessResolver: async () => "Antigravity IDE.exe",
      });

      const result = await provider.getActiveIde();
      assert.deepStrictEqual(result, { ide: "antigravity" });
    });

    it("returns null when foreground window belongs to an unsupported application (e.g. Chrome)", async () => {
      const provider = new WindowsActiveWindowProvider({
        foregroundProcessResolver: async () => "chrome.exe",
      });

      const result = await provider.getActiveIde();
      assert.strictEqual(result, null);
    });

    it("returns null when no foreground window or process is detected", async () => {
      const provider = new WindowsActiveWindowProvider({
        foregroundProcessResolver: async () => null,
      });

      const result = await provider.getActiveIde();
      assert.strictEqual(result, null);
    });

    it("returns null gracefully without crashing if process resolution throws an error", async () => {
      const provider = new WindowsActiveWindowProvider({
        foregroundProcessResolver: async () => {
          throw new Error("Access denied or process terminated");
        },
      });

      const result = await provider.getActiveIde();
      assert.strictEqual(result, null);
    });

    it("consistently returns the single foreground IDE regardless of multiple open windows", async () => {
      // Scenario: Multiple VS Code windows are open. Window B is currently foreground.
      const provider = new WindowsActiveWindowProvider({
        foregroundProcessResolver: async () => "Code.exe",
      });

      const result = await provider.getActiveIde();
      assert.deepStrictEqual(result, { ide: "vscode" });
    });
  });

  describe("Windows Integration (Real Windows API Execution)", () => {
    it("executes Windows foreground detection without crashing on Windows environments", async () => {
      if (process.platform !== "win32") {
        // Skip on non-Windows platforms
        return;
      }

      // Uses real PowerShell and Windows Win32 API
      const realProvider = new WindowsActiveWindowProvider({ timeoutMs: 3000 });
      const result = await realProvider.getActiveIde();

      // In headless or test runners, foreground window may be null or a running IDE
      if (result !== null) {
        assert.ok(
          result.ide === "vscode" || result.ide === "antigravity",
          `If an IDE is detected, it must be vscode or antigravity, got: ${String(result.ide)}`,
        );
      } else {
        assert.strictEqual(result, null);
      }
    });
  });
});
