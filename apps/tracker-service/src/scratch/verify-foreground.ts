/**
 * Temporary verification script — NOT part of the production project.
 * Verifies WindowsActiveWindowProvider.getActiveIde() against a specific foreground process PID.
 * Reads target PID from VERIFY_PID env var.
 *
 * Usage:
 *   node --experimental-vm-modules dist/scratch/verify-foreground.js
 *
 * Remove this file after verification is complete.
 */
import { IdeProcessRegistry } from '../providers/ide-process-registry.js';
import { WindowsActiveWindowProvider } from '../providers/windows/windows-active-window-provider.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Activates the foreground window for a given PID via PowerShell + Win32 API,
 * then immediately queries getActiveIde().
 */
async function verifyWithPid(
  label: string,
  targetPid: number,
): Promise<void> {
  const activateScript = `
$ErrorActionPreference = 'SilentlyContinue'
$code = @'
using System;
using System.Threading;
using System.Runtime.InteropServices;
public static class WinActivator {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr OpenWindowStation(string n, bool i, uint a);
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetProcessWindowStation(IntPtr h);
    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr OpenDesktop(string n, uint f, bool i, uint a);
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetThreadDesktop(IntPtr h);
    public delegate bool EnumDesktopWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern bool EnumDesktopWindows(IntPtr h, EnumDesktopWindowsProc fn, IntPtr p);
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr h, int cmd);
    public static void ActivatePid(int targetPid) {
        IntPtr ws = OpenWindowStation("winsta0", false, 0x37F);
        if (ws != IntPtr.Zero) SetProcessWindowStation(ws);
        IntPtr dk = OpenDesktop("default", 0, false, 0x1FF);
        Thread t = new Thread(() => {
            if (dk != IntPtr.Zero) SetThreadDesktop(dk);
            EnumDesktopWindows(dk, (hWnd, lParam) => {
                if (IsWindowVisible(hWnd)) {
                    uint pid = 0;
                    GetWindowThreadProcessId(hWnd, out pid);
                    if (pid == (uint)targetPid) {
                        ShowWindow(hWnd, 9);
                        SetForegroundWindow(hWnd);
                        return false;
                    }
                }
                return true;
            }, IntPtr.Zero);
        });
        t.SetApartmentState(ApartmentState.STA);
        t.Start();
        t.Join(2000);
    }
}
'@
if (-not ([System.Management.Automation.PSTypeName]'WinActivator').Type) {
    Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue
}
[WinActivator]::ActivatePid(${targetPid})
`.trim();

  // Bring the target window to the foreground
  await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', activateScript],
    { timeout: 4000, windowsHide: true },
  ).catch(() => {});

  // Small pause for the OS to register the foreground change
  await new Promise((r) => setTimeout(r, 400));

  const provider = new WindowsActiveWindowProvider({ processRegistry: new IdeProcessRegistry() });
  const result = await provider.getActiveIde();

  // Output ONLY the normalized identifier — no user content
  console.info(`[${label}]: ${result ? result.ide : 'null'}`);
}

const vscodePid = Number(process.env['VSCODE_PID'] ?? 0);
const agPid = Number(process.env['AG_PID'] ?? 0);
const browserPid = Number(process.env['BROWSER_PID'] ?? 0);

if (!vscodePid && !agPid && !browserPid) {
  console.error('Set VSCODE_PID, AG_PID, BROWSER_PID env vars before running.');
  process.exit(1);
}

if (vscodePid > 0) await verifyWithPid('vscode', vscodePid);
if (agPid > 0) await verifyWithPid('antigravity', agPid);
if (browserPid > 0) await verifyWithPid('unsupported-app (brave)', browserPid);
