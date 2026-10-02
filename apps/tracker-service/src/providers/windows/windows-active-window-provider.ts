import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type {
  ActiveIdeResult,
  ActiveWindowProvider,
} from "../active-window-provider.interface.js";
import { IdeProcessRegistry } from "../ide-process-registry.js";

const execFileAsync = promisify(execFile);

/**
 * Options for configuring WindowsActiveWindowProvider.
 */
export interface WindowsActiveWindowProviderOptions {
  /**
   * Registry for mapping process identities to supported IDEs.
   * If omitted, a default IdeProcessRegistry is created.
   */
  processRegistry?: IdeProcessRegistry;

  /**
   * Injected process resolver function.
   * If provided, replaces the default PowerShell Win32 API execution (essential for unit testing).
   */
  foregroundProcessResolver?: () => Promise<string | null>;

  /**
   * Maximum execution timeout in milliseconds for PowerShell calls. Defaults to 2000ms.
   */
  timeoutMs?: number;
}

/**
 * Inlined fallback script used if get-foreground-process.ps1 is unavailable on disk.
 */
const INLINE_POWERSHELL_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$code = @'
using System;
using System.Threading;
using System.Runtime.InteropServices;
public static class Win32Foreground {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr OpenWindowStation(string lpszWinSta, bool fInherit, uint dwDesiredAccess);
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetProcessWindowStation(IntPtr hWinSta);
    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr OpenDesktop(string lpszDesktop, uint dwFlags, bool fInherit, uint dwDesiredAccess);
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetThreadDesktop(IntPtr hDesktop);
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    public static uint GetForegroundProcessId() {
        IntPtr fg = GetForegroundWindow();
        if (fg != IntPtr.Zero) {
            uint pid = 0;
            GetWindowThreadProcessId(fg, out pid);
            if (pid > 0) return pid;
        }

        IntPtr hwinsta = OpenWindowStation("winsta0", false, 0x0000037F);
        if (hwinsta != IntPtr.Zero) {
            SetProcessWindowStation(hwinsta);
        }
        IntPtr hdesk = OpenDesktop("default", 0, false, 0x000001FF);
        uint resultPid = 0;
        Thread t = new Thread(() => {
            if (hdesk != IntPtr.Zero) {
                SetThreadDesktop(hdesk);
            }
            IntPtr win = GetForegroundWindow();
            if (win != IntPtr.Zero) {
                GetWindowThreadProcessId(win, out resultPid);
            }
        });
        t.SetApartmentState(ApartmentState.STA);
        t.Start();
        t.Join(1000);
        return resultPid;
    }
}
'@
if (-not ([System.Management.Automation.PSTypeName]'Win32Foreground').Type) {
    Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue
}
$pidVal = [Win32Foreground]::GetForegroundProcessId()
if ($pidVal -gt 0) {
    $proc = Get-Process -Id $pidVal -ErrorAction SilentlyContinue
    if ($proc) {
        if ($proc.Path) { [System.IO.Path]::GetFileName($proc.Path) } else { $proc.ProcessName }
    }
}
`.trim();

/**
 * Windows-specific active window provider.
 *
 * Implements the OS-independent ActiveWindowProvider interface by querying the Windows API
 * (GetForegroundWindow -> GetWindowThreadProcessId -> Get-Process) to resolve the foreground process identity.
 *
 * Why this is isolated behind an interface:
 * - Keeps platform-specific PowerShell/Win32 invocations strictly inside this provider.
 * - Future macOS (via JXA / NSWorkspace) and Linux (via X11 / Wayland) providers can be added seamlessly.
 * - Does not access or store any user content (window titles, file names, code, or URLs).
 */
export class WindowsActiveWindowProvider implements ActiveWindowProvider {
  private readonly processRegistry: IdeProcessRegistry;
  private readonly foregroundProcessResolver: () => Promise<string | null>;
  private readonly timeoutMs: number;
  private readonly scriptPath: string;

  public constructor(options?: WindowsActiveWindowProviderOptions) {
    this.processRegistry = options?.processRegistry ?? new IdeProcessRegistry();
    this.timeoutMs = options?.timeoutMs ?? 2000;

    // Locate the adjacent PowerShell script file
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    this.scriptPath = path.resolve(currentDir, "get-foreground-process.ps1");

    this.foregroundProcessResolver =
      options?.foregroundProcessResolver ??
      (() => this.queryWindowsForegroundProcess());
  }

  /**
   * Queries the operating system for the current foreground application and normalizes it to a supported IDE.
   *
   * @returns { ide: 'vscode' | 'antigravity' } if a supported IDE is in the foreground, or null otherwise.
   */
  public async getActiveIde(): Promise<ActiveIdeResult | null> {
    try {
      const processName = await this.foregroundProcessResolver();
      if (!processName) {
        return null;
      }

      const ide = this.processRegistry.resolveIde(processName);
      if (!ide) {
        return null;
      }

      return { ide };
    } catch {
      // Contain all failures safely without crashing or leaking sensitive info
      return null;
    }
  }

  /**
   * Invokes the Windows API via PowerShell to determine the foreground process identity.
   */
  private async queryWindowsForegroundProcess(): Promise<string | null> {
    try {
      let stdout: string;

      if (fs.existsSync(this.scriptPath)) {
        const result = await execFileAsync(
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            this.scriptPath,
          ],
          { timeout: this.timeoutMs, windowsHide: true },
        );
        stdout = result.stdout;
      } else {
        // Fallback to inline script execution if script file was not bundled
        const result = await execFileAsync(
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            INLINE_POWERSHELL_SCRIPT,
          ],
          { timeout: this.timeoutMs, windowsHide: true },
        );
        stdout = result.stdout;
      }

      const trimmed = stdout.trim();
      return trimmed.length > 0 ? trimmed : null;
    } catch {
      // Gracefully handle timeouts, permission restrictions, or missing window handles
      return null;
    }
  }
}

/**
 * Factory creating an instance of WindowsActiveWindowProvider.
 */
export function createWindowsActiveWindowProvider(
  options?: WindowsActiveWindowProviderOptions,
): WindowsActiveWindowProvider {
  return new WindowsActiveWindowProvider(options);
}
