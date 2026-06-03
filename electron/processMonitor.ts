import { spawn, exec, ChildProcess } from 'child_process'
import path from 'path'

let wmiProcess: ChildProcess | null = null
let watchdogTimer: ReturnType<typeof setInterval> | null = null
let currentScriptPath = ''
let currentCallback: ((pid: number, name: string) => void) | null = null

const SYSTEM_NOISE = new Set([
  // ── Core Windows System ────────────────────────────────────────
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

  // ── Windows Shell & UI ─────────────────────────────────────────
  'explorer.exe', 'shellexperiencehost.exe', 'startmenuexperiencehost.exe',
  'searchapp.exe', 'searchprotocolhost.exe', 'searchfilterhost.exe',
  'textinputhost.exe', 'lockapp.exe', 'logonui.exe', 'logon.scr',
  'ui0detect.exe', 'dismhost.exe', 'musnotification.exe',
  'musnotifyicon.exe', 'tmui.exe', 'shellhost.exe',
  'backgroundtaskhost.exe', 'openwith.exe',

  // ── Windows Update & Servicing ─────────────────────────────────
  'wuauclt.exe', 'usoclient.exe', 'wuapp.exe', 'trustedinstaller.exe',
  'tiworker.exe', 'tiworker', 'trustedinstaller',
  'msiexec.exe', 'mersetup.exe', 'wermgr.exe', 'werfault.exe',
  'musnotification', 'musnotifyicon',

  // ── Windows Security & Defender ────────────────────────────────
  'smartscreen.exe', 'smartscreen',
  'senseir.exe', 'sensecnc.exe', 'sensespot.exe',
  'mpcmdrun.exe', 'msmpeng.exe',
  'securityhealthservice.exe', 'securityhealthsystray.exe',
  'nis.exe',

  // ── Windows Licensing & Activation ─────────────────────────────
  'sppsvc.exe', 'sppsvc', 'sppextcomobj.exe', 'sppextcomobj',
  'slui.exe', 'slui', 'sppnotification.exe',
  'osppsvc.exe', 'sppuinotify.exe',

  // ── Windows Store & AppX ───────────────────────────────────────
  'phoneexperiencehost.exe', 'phoneexperiencehost',
  'gamingservices.exe', 'gamingservices',
  'xboxapp.exe', 'xboxgipservice.exe', 'xboxgip.exe',
  'store.exe', 'wshelper.exe', 'installmanagerapp.exe', 'installmanagerapp',
  'sdxhelper.exe', 'sdxhelper',

  // ── Windows Search & Indexing ──────────────────────────────────
  'searchindexer', 'searchprotocolhost', 'searchfilterhost',
  'searchapp', 'SearchHost.exe', 'SearchUI.exe',

  // ── Windows Input & Accessibility ──────────────────────────────
  'chsihost.exe', 'chsihost',

  // ── Developer tools & runtime processes ────────────────────────
  'node.exe', 'npm.exe', 'npx.exe', 'yarn.exe', 'pnpm.exe',
  'python.exe', 'python3.exe', 'pip.exe', 'pip3.exe',
  'java.exe', 'javaw.exe',
  'go.exe',
  'rustc.exe', 'cargo.exe',
  'dotnet.exe', 'devenv.exe',
  'git.exe', 'git-bash.exe', 'git',

  // ── Electron & dev servers ─────────────────────────────────────
  'electron.exe', 'vite.exe', 'webpack.exe', 'esbuild.exe',
  'tsc.exe', 'ts-node.exe',

  // ── Office & OneDrive background ───────────────────────────────
  'officec2rclient.exe', 'officec2rclient',
  'officeclicktorun.exe', 'integrator.exe',
  'onedrive.exe', 'onedriveupdater.exe',
  'groove.exe', 'msosync.exe',

  // ── Package managers & build tools ─────────────────────────────
  'make.exe', 'cmake.exe', 'ninja.exe',
  'msbuild.exe', 'csc.exe', 'vbc.exe',

  // ── Remote Desktop ─────────────────────────────────────────────
  'msrdc.exe', 'msrdc', 'mstsc.exe',

  // ── Misc system tools ──────────────────────────────────────────
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

  // ── FocusGate (don't track ourselves) ──────────────────────────
  'focusgate.exe',
  'focusgate-dev.exe',
])

export function isSystemProcess(name: string): boolean {
  const lower = name.toLowerCase()
  // Check with and without .exe suffix
  if (SYSTEM_NOISE.has(lower)) return true
  if (!lower.endsWith('.exe') && SYSTEM_NOISE.has(lower + '.exe')) return true
  return false
}

// Dedup guard — 500ms TTL
// Tracks the last interception time per exe — 500ms dedup only
// (approval-based cooldown is handled separately via approvedExeNames)
const recentlyIntercepted = new Map<string, number>()

export function shouldIntercept(name: string): boolean {
  const last = recentlyIntercepted.get(name.toLowerCase())
  if (last && Date.now() - last < 500) return false
  recentlyIntercepted.set(name.toLowerCase(), Date.now())
  return true
}

export function resetInterceptCooldown(name: string): void {
  recentlyIntercepted.delete(name.toLowerCase())
}

// PIDs that were already running when a block rule was added — never intercept these
const preExistingPids = new Set<number>()

/**
 * Register PIDs that are already running for a given exe name so they are
 * never intercepted. Call this right after the user adds an app to the block list.
 */
export function excludeExistingPids(exeName: string): Promise<void> {
  return new Promise((resolve) => {
    exec(`tasklist /FI "IMAGENAME eq ${exeName}" /FO CSV /NH`, (err, stdout) => {
      if (!err) {
        for (const line of stdout.trim().split('\n')) {
          const parts = line.split(',')
          const pid = parseInt(parts[1]?.replace(/"/g, '') ?? '0', 10)
          if (pid) preExistingPids.add(pid)
        }
      }
      resolve()
    })
  })
}

/** Returns true if this PID was running before the block rule was added. */
export function isPreExistingPid(pid: number): boolean {
  return preExistingPids.has(pid)
}

/** Clean up a PID from the exclusion set once the process exits. */
export function releasePreExistingPid(pid: number): void {
  preExistingPids.delete(pid)
}

export function startWmiWatcher(
  onProcess: (pid: number, name: string) => void,
  scriptDir: string   // directory containing wmiWatcher.ps1
) {
  currentScriptPath = scriptDir
  currentCallback = onProcess

  const ps1Path = path.join(scriptDir, 'wmiWatcher.ps1')

  wmiProcess = spawn('powershell', [
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
      const [pidStr, name] = trimmed.split('|')
      const pid = parseInt(pidStr, 10)
      if (!isNaN(pid) && name) {
        // Strip .exe suffix for cleaner app names
        const cleanName = name.trim().replace(/\.exe$/i, '')
        onProcess(pid, cleanName)
      }
    }
  })

  wmiProcess.stderr?.on('data', (data: Buffer) => {
    console.error('[WMI] stderr:', data.toString())
  })

  wmiProcess.on('exit', (code) => {
    console.log(`[WMI] Watcher exited with code ${code}`)
    if (code !== 0 && code !== null && currentCallback) {
      setTimeout(() => startWmiWatcher(currentCallback!, currentScriptPath), 2000)
    }
  })

  console.log('[WMI] Watcher started, script:', ps1Path)
}

export function stopWmiWatcher() {
  currentCallback = null  // prevent auto-restart
  wmiProcess?.kill()
  wmiProcess = null
}

export function startFallbackWatchdog(
  blockedNames: Set<string>,
  onDetected: (name: string) => void
) {
  let knownPids = new Set<string>()

  watchdogTimer = setInterval(() => {
    exec('tasklist /FO CSV /NH', (err, stdout) => {
      if (err) return
      for (const line of stdout.trim().split('\n')) {
        const parts = line.split(',')
        const name = parts[0]?.replace(/"/g, '').toLowerCase()
        const pid  = parts[1]?.replace(/"/g, '')
        if (!name || !pid || knownPids.has(pid)) continue
        knownPids.add(pid)
        if (blockedNames.has(name)) onDetected(name)
      }
      if (knownPids.size > 1000) knownPids = new Set()
    })
  }, 10_000)

  return watchdogTimer
}

export function stopFallbackWatchdog() {
  if (watchdogTimer) {
    clearInterval(watchdogTimer)
    watchdogTimer = null
  }
}