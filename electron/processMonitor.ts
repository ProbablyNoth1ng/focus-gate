import { spawn, execFile, execFileSync, ChildProcess } from 'child_process'
import path from 'path'

interface ForegroundProcessInfo {
  pid: number
  name: string
}

let wmiProcess: ChildProcess | null = null
let foregroundProcess: ChildProcess | null = null
let watchdogTimer: ReturnType<typeof setInterval> | null = null
let currentScriptPath = ''
let currentForegroundScriptPath = ''
let currentCallback: ((pid: number, name: string) => void) | null = null
let currentForegroundCallback: ((current: ForegroundProcessInfo, previous: ForegroundProcessInfo | null) => void) | null = null
let watchdogInFlight = false

function toPowerShellEncodedCommand(command: string): string {
  return Buffer.from(command, 'utf16le').toString('base64')
}

const SYSTEM_NOISE = new Set([
  'svchost.exe', 'conhost.exe', 'runtimebroker.exe',
  'taskhostw.exe', 'searchindexer.exe', 'wmiprvse.exe',
  'fontdrvhost.exe', 'dwm.exe', 'csrss.exe', 'lsass.exe',
  'smss.exe', 'wininit.exe', 'services.exe', 'winlogon.exe',
  'spoolsv.exe', 'sihost.exe', 'ctfmon.exe', 'dllhost.exe',
  'audiodg.exe', 'msdtc.exe', 'tasklist.exe', 'cmd.exe',
  'powershell.exe', 'wsl.exe', 'wslhost.exe', 'registry',
  'system', 'system idle process', 'secure system', 'memory compression',
  'svchost', 'csrss', 'lsass', 'smss', 'wininit', 'services',
  'winlogon', 'dwm', 'sihost', 'ctfmon', 'fontdrvhost',
  'explorer.exe', 'shellexperiencehost.exe', 'startmenuexperiencehost.exe',
  'searchapp.exe', 'searchprotocolhost.exe', 'searchfilterhost.exe',
  'textinputhost.exe', 'lockapp.exe', 'logonui.exe', 'logon.scr',
  'ui0detect.exe', 'dismhost.exe', 'musnotification.exe',
  'musnotifyicon.exe', 'tmui.exe', 'shellhost.exe',
  'backgroundtaskhost.exe', 'openwith.exe',
  'wuauclt.exe', 'usoclient.exe', 'wuapp.exe', 'trustedinstaller.exe',
  'tiworker.exe', 'tiworker', 'trustedinstaller',
  'msiexec.exe', 'mersetup.exe', 'wermgr.exe', 'werfault.exe',
  'musnotification', 'musnotifyicon',
  'smartscreen.exe', 'smartscreen',
  'senseir.exe', 'sensecnc.exe', 'sensespot.exe',
  'mpcmdrun.exe', 'msmpeng.exe',
  'securityhealthservice.exe', 'securityhealthsystray.exe',
  'nis.exe',
  'sppsvc.exe', 'sppsvc', 'sppextcomobj.exe', 'sppextcomobj',
  'slui.exe', 'slui', 'sppnotification.exe',
  'osppsvc.exe', 'sppuinotify.exe',
  'phoneexperiencehost.exe', 'phoneexperiencehost',
  'gamingservices.exe', 'gamingservices',
  'xboxapp.exe', 'xboxgipservice.exe', 'xboxgip.exe',
  'store.exe', 'wshelper.exe', 'installmanagerapp.exe', 'installmanagerapp',
  'sdxhelper.exe', 'sdxhelper',
  'searchindexer', 'searchprotocolhost', 'searchfilterhost',
  'searchapp', 'SearchHost.exe', 'SearchUI.exe',
  'chsihost.exe', 'chsihost',
  'node.exe', 'npm.exe', 'npx.exe', 'yarn.exe', 'pnpm.exe',
  'python.exe', 'python3.exe', 'pip.exe', 'pip3.exe',
  'java.exe', 'javaw.exe',
  'go.exe',
  'rustc.exe', 'cargo.exe',
  'dotnet.exe', 'devenv.exe',
  'git.exe', 'git-bash.exe', 'git',
  'electron.exe', 'vite.exe', 'webpack.exe', 'esbuild.exe',
  'tsc.exe', 'ts-node.exe',
  'officec2rclient.exe', 'officec2rclient',
  'officeclicktorun.exe', 'integrator.exe',
  'onedrive.exe', 'onedriveupdater.exe',
  'groove.exe', 'msosync.exe',
  'make.exe', 'cmake.exe', 'ninja.exe',
  'msbuild.exe', 'csc.exe', 'vbc.exe',
  'msrdc.exe', 'msrdc', 'mstsc.exe',
  'updater.exe', 'updater',
  'where.exe', 'where',
  'wmic.exe', 'wmic',
  'cleanmgr.exe', 'dfrgui.exe', 'diskmgmt.msc',
  'resmon.exe', 'perfmon.exe', 'msconfig.exe',
  'regedit.exe', 'regedt32.exe',
  'rundll32.exe', 'rundll32',
  'dllhost',
  'runtimebroker',
  'conhost',
  'taskhostw',
  'ctfmon',
  'focusgate.exe',
  'focusgate-dev.exe',
])

const recentlyIntercepted = new Map<string, number>()
const preExistingPids = new Map<number, { exeName: string; creationDate: string }>()

export function normalizeExeName(name: string): string {
  const trimmed = name.trim().toLowerCase()
  if (!trimmed) return ''
  return trimmed.endsWith('.exe') ? trimmed : `${trimmed}.exe`
}

export function isSystemProcess(name: string): boolean {
  const lower = name.toLowerCase().trim()
  return SYSTEM_NOISE.has(lower) || SYSTEM_NOISE.has(normalizeExeName(lower))
}

export function isRealApp(name: string): boolean {
  const lower = normalizeExeName(name).replace(/\.exe$/i, '')
  if (!lower) return false
  if (/\.tmp$|\.temp$|\.log$|\.dat$/.test(lower)) return false
  if (lower.startsWith('~')) return false
  if (/^[a-f0-9]{8,}$/i.test(lower)) return false
  if (/^\d+$/.test(lower)) return false
  return true
}

export function shouldInterceptProcess(pid: number, name: string): boolean {
  const key = `${normalizeExeName(name)}#${pid}`
  const last = recentlyIntercepted.get(key)
  if (last && Date.now() - last < 500) return false
  recentlyIntercepted.set(key, Date.now())
  return true
}

export function resetInterceptCooldown(pid: number, name: string): void {
  recentlyIntercepted.delete(`${normalizeExeName(name)}#${pid}`)
}

export function excludeExistingPids(exeName: string): Promise<void> {
  return new Promise((resolve) => {
    const normalizedExeName = normalizeExeName(exeName)
    const processName = normalizedExeName.replace(/\.exe$/i, '')
    const psCommand = `$items = Get-Process -Name '${processName}' -ErrorAction SilentlyContinue; foreach ($item in $items) { if ($item.StartTime) { Write-Output "$($item.Id)|$($item.StartTime.ToUniversalTime().ToString('o'))" } }`
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', toPowerShellEncodedCommand(psCommand)], (err, stdout) => {
      if (!err) {
        for (const line of stdout.trim().split('\n')) {
          const trimmed = line.trim()
          if (!trimmed) continue
          const [pidStr, creationDate] = trimmed.split('|')
          const pid = parseInt(pidStr, 10)
          if (pid && creationDate) {
            preExistingPids.set(pid, { exeName: normalizedExeName, creationDate: creationDate.trim() })
          }
        }
      }
      resolve()
    })
  })
}

export function isPreExistingPid(pid: number, exeName?: string): boolean {
  const tracked = preExistingPids.get(pid)
  if (!tracked) return false

  const normalizedExeName = exeName ? normalizeExeName(exeName) : tracked.exeName
  if (tracked.exeName !== normalizedExeName) {
    preExistingPids.delete(pid)
    return false
  }

  try {
    const psCommand = `$item = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if ($item -and $item.StartTime) { Write-Output $item.StartTime.ToUniversalTime().ToString('o') }`
    const currentCreationDate = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', toPowerShellEncodedCommand(psCommand)], {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim()

    if (!currentCreationDate || currentCreationDate !== tracked.creationDate) {
      preExistingPids.delete(pid)
      return false
    }
  } catch {
    preExistingPids.delete(pid)
    return false
  }

  return true
}

export function releasePreExistingPid(pid: number): void {
  preExistingPids.delete(pid)
}

export function startWmiWatcher(
  onProcess: (pid: number, name: string) => void,
  scriptDir: string
) {
  stopWmiWatcher()
  currentScriptPath = scriptDir
  currentCallback = onProcess

  const ps1Path = path.join(scriptDir, 'wmiWatcher.ps1')
  wmiProcess = spawn('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy', 'Bypass',
    '-File', ps1Path,
  ])

  let buffer = ''

  wmiProcess.stdout?.on('data', (chunk: Buffer) => {
    buffer += chunk.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const [pidText, exeNameRaw] = trimmed.split('|')
      const exeName = normalizeExeName(exeNameRaw ?? '')
      const pid = parseInt(pidText, 10)
      if (!exeName || isNaN(pid)) continue
      onProcess(pid, exeName)
    }
  })

  wmiProcess.stderr?.on('data', (data: Buffer) => {
    console.error('[WMI] stderr:', data.toString())
  })

  wmiProcess.on('exit', (code) => {
    console.log(`[WMI] Watcher exited with code ${code}`)
    if (currentCallback && code !== 0 && code !== null) {
      setTimeout(() => {
        if (currentCallback) startWmiWatcher(currentCallback, currentScriptPath)
      }, 2000)
    }
  })

  console.log('[WMI] Watcher started via process-start events:', ps1Path)
}

export function stopWmiWatcher() {
  currentCallback = null
  wmiProcess?.kill()
  wmiProcess = null
}

export function startForegroundWatcher(
  onForegroundChange: (current: ForegroundProcessInfo, previous: ForegroundProcessInfo | null) => void,
  scriptDir: string
) {
  currentForegroundScriptPath = scriptDir
  currentForegroundCallback = onForegroundChange

  const ps1Path = path.join(scriptDir, 'foregroundWatcher.ps1')

  foregroundProcess = spawn('powershell', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy', 'Bypass',
    '-File', ps1Path,
  ])

  let buffer = ''
  let lastForeground: ForegroundProcessInfo | null = null

  foregroundProcess.stdout?.on('data', (chunk: Buffer) => {
    buffer += chunk.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const [pidStr, name] = trimmed.split('|')
      const pid = parseInt(pidStr, 10)
      const exeName = normalizeExeName(name ?? '')
      if (isNaN(pid) || !exeName) continue

      const nextForeground = { pid, name: exeName }
      if (lastForeground?.pid === nextForeground.pid && lastForeground.name === nextForeground.name) {
        continue
      }

      const previousForeground = lastForeground
      lastForeground = nextForeground
      onForegroundChange(nextForeground, previousForeground)
    }
  })

  foregroundProcess.stderr?.on('data', (data: Buffer) => {
    console.error('[FOREGROUND] stderr:', data.toString())
  })

  foregroundProcess.on('exit', (code) => {
    console.log(`[FOREGROUND] Watcher exited with code ${code}`)
    if (code !== 0 && code !== null && currentForegroundCallback) {
      setTimeout(() => startForegroundWatcher(currentForegroundCallback!, currentForegroundScriptPath), 2000)
    }
  })

  console.log('[FOREGROUND] Watcher started, script:', ps1Path)
}

export function stopForegroundWatcher() {
  currentForegroundCallback = null
  foregroundProcess?.kill()
  foregroundProcess = null
}

export function startFallbackWatchdog(
  getBlockedNames: () => Set<string>,
  onDetected: (pid: number, name: string) => void
) {
  const snapshotCommand = `$ProgressPreference='SilentlyContinue'; Get-Process -ErrorAction SilentlyContinue | ForEach-Object { if ($_.Id -and $_.ProcessName -and $_.StartTime) { Write-Output "$($_.Id)|$($_.ProcessName).exe" } }`

  watchdogTimer = setInterval(() => {
    const blockedNames = getBlockedNames()
    if (blockedNames.size === 0 || watchdogInFlight) return

    watchdogInFlight = true
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', toPowerShellEncodedCommand(snapshotCommand)], { timeout: 5000 }, (err, stdout) => {
      watchdogInFlight = false
      if (err) return
      for (const line of stdout.trim().split('\n')) {
        const trimmed = line.trim()
        if (!trimmed) continue
        const [pidText, exeNameRaw] = trimmed.split('|')
        const name = normalizeExeName(exeNameRaw ?? '')
        const pid = parseInt(pidText, 10)
        if (!name || !pid || !blockedNames.has(name)) continue
        onDetected(pid, name)
      }
    })
  }, 15_000)

  return watchdogTimer
}

export function stopFallbackWatchdog() {
  if (watchdogTimer) {
    clearInterval(watchdogTimer)
    watchdogTimer = null
  }
}
