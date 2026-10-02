# Local-only Windows foreground window detection helper
# Queries strictly the process name or executable name associated with GetForegroundWindow()
# Does NOT query window titles, document names, URLs, keystrokes, or any user content.

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

        // Query winsta0\default for robust background/daemon execution support
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
if ($pidVal -le 0) {
    exit 0
}

$proc = Get-Process -Id $pidVal -ErrorAction SilentlyContinue
if (-not $proc) {
    exit 0
}

# Only output the process or executable name (no titles or user data)
if ($proc.Path) {
    [System.IO.Path]::GetFileName($proc.Path)
} else {
    $proc.ProcessName
}

