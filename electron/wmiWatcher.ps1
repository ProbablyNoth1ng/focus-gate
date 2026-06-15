$ErrorActionPreference = 'SilentlyContinue'

$source = 'FocusGateProcessStart'

try {
    Unregister-Event -SourceIdentifier $source -ErrorAction SilentlyContinue
    Register-WmiEvent -Query "SELECT * FROM Win32_ProcessStartTrace" -SourceIdentifier $source | Out-Null

    while ($true) {
        $event = Wait-Event -SourceIdentifier $source -Timeout 5
        if (-not $event) { continue }

        try {
            $process = $event.SourceEventArgs.NewEvent
            if ($process.ProcessID -and $process.ProcessName) {
                Write-Output "$($process.ProcessID)|$($process.ProcessName.ToLower())"
                [Console]::Out.Flush()
            }
        } finally {
            Remove-Event -EventIdentifier $event.EventIdentifier -ErrorAction SilentlyContinue
        }
    }
} finally {
    Unregister-Event -SourceIdentifier $source -ErrorAction SilentlyContinue
}
