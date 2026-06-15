$ErrorActionPreference = 'SilentlyContinue'

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class FocusGateForeground {
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();

  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@

$lastForeground = ''

while ($true) {
  try {
    $hwnd = [FocusGateForeground]::GetForegroundWindow()
    if ($hwnd -eq [IntPtr]::Zero) {
      Start-Sleep -Milliseconds 1200
      continue
    }

    $pid = 0
    [FocusGateForeground]::GetWindowThreadProcessId($hwnd, [ref]$pid) | Out-Null
    if (-not $pid) {
      Start-Sleep -Milliseconds 1200
      continue
    }

    $process = Get-Process -Id $pid -ErrorAction Stop
    $currentForeground = "$pid|$($process.ProcessName)"

    if ($currentForeground -ne $lastForeground) {
      $lastForeground = $currentForeground
      Write-Output $currentForeground
    }
  } catch {
    # Ignore transient focus and process lookup failures.
  }

  Start-Sleep -Milliseconds 1200
}
