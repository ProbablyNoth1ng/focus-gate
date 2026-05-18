# Process watcher using Get-Process polling — no admin rights required
# Emits "pid|name" to stdout for each newly detected process

$seen = @{}  # pid -> processName

# Seed existing processes so we don't fire on startup
Get-Process -ErrorAction SilentlyContinue | ForEach-Object {
    $seen[$_.Id] = $_.ProcessName.ToLower()
}

$lastWakeCheck = [DateTime]::UtcNow

while ($true) {
    Start-Sleep -Milliseconds 1000

    try {
        $current = Get-Process -ErrorAction SilentlyContinue
        $currentIds = @{}
        foreach ($proc in $current) { $currentIds[$proc.Id] = $true }

        # --- Sleep/wake detection ---
        # If system clock jumped forward more than 10s since last check, PC was asleep.
        # Re-seed ALL current processes so none are treated as "new" after wake.
        $now = [DateTime]::UtcNow
        $elapsed = ($now - $lastWakeCheck).TotalSeconds
        if ($elapsed -gt 10) {
            foreach ($proc in $current) {
                $seen[$proc.Id] = $proc.ProcessName.ToLower()
            }
            $lastWakeCheck = $now
            continue
        }
        $lastWakeCheck = $now

        # --- Detect genuinely new processes ---
        $emittedThisCycle = @{}
        foreach ($proc in $current) {
            if (-not $seen.ContainsKey($proc.Id)) {
                $seen[$proc.Id] = $proc.ProcessName.ToLower()
                $name = $proc.ProcessName + ".exe"
                # Only emit once per exe name per poll cycle
                if (-not $emittedThisCycle.ContainsKey($name.ToLower())) {
                    $emittedThisCycle[$name.ToLower()] = $true
                    Write-Output "$($proc.Id)|$name"
                    [Console]::Out.Flush()
                }
            }
        }

        # --- Prune dead PIDs (safe: remove only PIDs no longer running) ---
        $deadPids = $seen.Keys | Where-Object { -not $currentIds.ContainsKey($_) }
        foreach ($id in @($deadPids)) { $seen.Remove($id) }

    } catch {
        # Ignore transient errors
    }
}
