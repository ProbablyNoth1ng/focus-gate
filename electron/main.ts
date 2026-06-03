import {
  app,
  BrowserWindow,
  ipcMain,
} from 'electron'
import path from 'path'
import { exec } from 'child_process'
import Store from 'electron-store'
import { AppSettings, DEFAULT_SETTINGS, IPC, InterceptionPayload } from '../shared/ipc-types'
import { initDatabase, logActivity, logInterceptionResult, accumulateUsage, startUsageFlushTimer, stopUsageFlushTimer } from './database'
import {
  startWmiWatcher,
  stopWmiWatcher,
  startFallbackWatchdog,
  stopFallbackWatchdog,
  isSystemProcess,
  shouldIntercept,
  excludeExistingPids,
  isPreExistingPid,
  releasePreExistingPid,
} from './processMonitor'
import { suspendProcess, resumeProcess, cancelInterception, isExeOnCooldown, setExeCooldown } from './interception'
import { initTray, destroyTray } from './tray'
import { registerIpcHandlers } from './ipcHandlers'
import { setAutostart } from './autostart'

// ─── Store ───────────────────────────────────────────────────────────────────
const store = new Store<AppSettings>({ defaults: DEFAULT_SETTINGS })

// ─── State ───────────────────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null
let modalWindow: BrowserWindow | null = null
let intercepting = false          // prevents concurrent interceptions
let startupGraceUntil = 0        // no interceptions during startup seeding
let currentInterception: InterceptionPayload | null = null

const isDev = !app.isPackaged



// wmiWatcher.ps1 sits next to main.js in dist/electron/ (copied by dev:copy-ps1 script)
// pssuspend.exe sits in assets/ at project root (or resources/ in prod)
const scriptPath = isDev
  ? __dirname
  : process.resourcesPath

const resourcesPath = isDev
  ? path.join(__dirname, '..', '..', 'assets')
  : process.resourcesPath

// ─── Debug timestamp helper ──────────────────────────────────────────────────
function ts() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`
}

// ─── Focus Hours Check ───────────────────────────────────────────────────────
function isInFocusHours(): boolean {
  const settings = { ...DEFAULT_SETTINGS, ...store.store } as AppSettings
  if (!settings.focusHoursEnabled) return true

  const now = new Date()
  const [startH, startM] = settings.focusStart.split(':').map(Number)
  const [endH, endM]     = settings.focusEnd.split(':').map(Number)
  const nowMins  = now.getHours() * 60 + now.getMinutes()
  const startMin = startH * 60 + startM
  const endMin   = endH   * 60 + endM
  return nowMins >= startMin && nowMins <= endMin
}

// ─── Interception Handler ────────────────────────────────────────────────────
async function handleInterception(pid: number, exeName: string): Promise<void> {
  const settings = { ...DEFAULT_SETTINGS, ...store.store } as AppSettings

  const now = Date.now()
  const pauseUntil = settings.pauseUntil
  if (settings.isPaused || (pauseUntil && now < pauseUntil)) {
    console.log(`[${ts()}] [SKIP] FocusGate paused — ${exeName}`)
    return
  }

  if (!isInFocusHours()) {
    console.log(`[${ts()}] [SKIP] Outside focus hours — ${exeName}`)
    return
  }

  // Don't intercept during startup grace period (WMI is still seeding existing PIDs)
  if (Date.now() < startupGraceUntil) {
    console.log(`[${ts()}] [SKIP] Startup grace active — ${exeName}`)
    return
  }

  // Don't allow two concurrent interceptions
  if (intercepting) {
    console.log(`[${ts()}] [SKIP] Already intercepting — ${exeName}`)
    return
  }

  const blockedApp = settings.blockedApps.find(
    a => a.enabled && a.exePath.toLowerCase().endsWith(exeName.toLowerCase())
  )
  if (!blockedApp) return

  if (modalWindow && !modalWindow.isDestroyed()) {
    modalWindow.destroy()
    modalWindow = null
  }

  intercepting = true
  console.log(`[${ts()}] [INTERCEPT] Starting — pid=${pid} exe=${exeName}`)
  const suspended = await suspendProcess(pid, blockedApp.exePath, resourcesPath)

  modalWindow = new BrowserWindow({
    width: 860,
    height: 780,
    frame: false,
    resizable: false,
    movable: false,
    closable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    center: true,
    icon: path.join(resourcesPath, 'logo.png'),
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  modalWindow.on('close', (e) => e.preventDefault())

  const payload: InterceptionPayload = {
    appName: blockedApp.name,
    exePath: blockedApp.exePath,
    icon: blockedApp.icon,
    pid,
    suspended,
  }
  currentInterception = payload

  if (isDev) {
    await modalWindow.loadURL('http://localhost:5173?modal=true')
  } else {
    await modalWindow.loadURL('file://' + path.join(app.getAppPath(), 'dist/renderer/index.html').replace(/\\/g, '/') + '?modal=true')
  }

  modalWindow.show()
  modalWindow.focus()
  console.log(`[${ts()}] [MODAL] Shown — app="${blockedApp.name}" pid=${pid}`)

  // ── Send payload reliably ────────────────────────────────────────────────────
  // did-finish-load fires before React mounts and subscribes to onInterceptionStart.
  // Strategy: send on did-finish-load AND re-send 600 ms later so the listener
  // that React registers in useEffect always catches it.
  const sendPayload = () => {
    if (modalWindow && !modalWindow.isDestroyed()) {
      modalWindow.webContents.send(IPC.INTERCEPTION_START, payload)
    }
  }

  modalWindow.webContents.on('did-finish-load', () => {
    sendPayload()
    setTimeout(sendPayload, 600)
  })

  // Allow renderer to ask for the current payload after it has mounted
  // Use handle (not handleOnce) so re-renders and second windows can always get it
  try { ipcMain.removeHandler('interception:get-current') } catch {}
  ipcMain.handle('interception:get-current', () => currentInterception)
}

// ─── Window Creation ─────────────────────────────────────────────────────────
function createMainWindow(): BrowserWindow {
  const iconPath = path.join(resourcesPath, 'logo.png')
  const win = new BrowserWindow({
    width: 900,
    height: 800,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0d0d0f',
    icon: iconPath,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadURL('file://' + path.join(app.getAppPath(), 'dist/renderer/index.html').replace(/\\/g, '/'))
  }
  

  win.once('ready-to-show', () => {
    if (process.argv.includes('--minimize-to-tray')) return
    win.show()
    // win.webContents.openDevTools({ mode: 'detach' }) 
  })
  
  

   win.on('close', (e) => {
    e.preventDefault()
    win.hide()
  })

  return win
}

// ─── IPC: Modal completion ───────────────────────────────────────────────────
function registerModalIpc(): void {
  ipcMain.on(IPC.INTENTION_CANCEL, async () => {
    if (currentInterception) {
      console.log(`[${ts()}] [CANCEL] User dismissed — app="${currentInterception.appName}"`)
      logInterceptionResult(currentInterception.appName, 'dismissed')
      cancelInterception(currentInterception.exePath)
      currentInterception = null
    }
    if (modalWindow && !modalWindow.isDestroyed()) {
      modalWindow.destroy()
      modalWindow = null
    }
    intercepting = false
    console.log(`[${ts()}] [STATE] intercepting=false (cancelled)`)
  })

  ipcMain.on('intention:resume', async (_event, exePath: string) => {
    console.log(`[${ts()}] [SUBMIT] Purpose submitted — resuming exe=${exePath}`)
    if (modalWindow && !modalWindow.isDestroyed()) {
      modalWindow.destroy()
      modalWindow = null
    }
    currentInterception = null
    intercepting = false  // clear BEFORE resume so next real open isn't blocked
    console.log(`[${ts()}] [STATE] intercepting=false (submitted)`)
    await resumeProcess(exePath, resourcesPath)
  })
}

// ─── App Lifecycle ───────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  try {
    await initDatabase()
    startUsageFlushTimer()
  } catch (err) {
    console.error('[DB] Failed to initialize database:', err)
  }

  // ── Autostart is off by default; user can enable it in Settings ──────────────
  const hasSetStartup = store.has('launchAtStartup')
  if (!hasSetStartup) {
    // Brand new install — leave autostart disabled (default is false)
    store.set('launchAtStartup', false)
    setAutostart(false)
    console.log('[Autostart] First run — autostart disabled by default')
  }

  function getBlockedNames(): Set<string> {
    const settings = { ...DEFAULT_SETTINGS, ...store.store } as AppSettings
    return new Set(
      settings.blockedApps
        .filter(a => a.enabled)
        .map(a => path.basename(a.exePath).toLowerCase())
    )
  }

  // ── Seed pre-existing PIDs on startup ───────────────────────────────────────
  // Any blocked app already running when FocusGate starts must never be
  // intercepted — user was using it before the guard became active.
  const startupSettings = { ...DEFAULT_SETTINGS, ...store.store } as AppSettings
  await Promise.all(
    startupSettings.blockedApps
      .filter(a => a.enabled)
      .map(a => excludeExistingPids(path.basename(a.exePath)))
  )

  // Give 5 seconds for the WMI watcher to seed existing PIDs before intercepting
  startupGraceUntil = Date.now() + 5000

  startWmiWatcher((pid, name) => {
    if (isSystemProcess(name)) return

    // wmiWatcher only fires for NEW pids — safe to remove from pre-existing set
    releasePreExistingPid(pid)

    const settings = { ...DEFAULT_SETTINGS, ...store.store } as AppSettings
    const isBlocked = settings.blockedApps.some(
      a => a.enabled && a.exePath.toLowerCase().endsWith(name.toLowerCase())
    )

    // Only log activity for non-blocked apps.
    // Blocked apps are counted via interception_results (completed/dismissed),
    // which gives accurate 1-per-open counts without multi-process spam.
    if (!isBlocked) {
      const cleanName = name.replace(/\.exe$/i, '')
      logActivity(cleanName, false)
      accumulateUsage(cleanName)
    }

    // Skip PIDs that were already running when the rule was added
    if (isBlocked && !isPreExistingPid(pid) && !isExeOnCooldown(name)) {
      setExeCooldown(name)  // set immediately before any async work
      handleInterception(pid, name).catch(console.error)
    }
  }, scriptPath)

  startFallbackWatchdog(getBlockedNames(), (name) => {
    if (!isExeOnCooldown(name)) {
      exec(`tasklist /FI "IMAGENAME eq ${name}" /FO CSV /NH`, (err: Error | null, stdout: string) => {
        if (err) return
        const line = stdout.trim().split('\n')[0]
        const parts = line?.split(',')
        const pid = parseInt(parts?.[1]?.replace(/"/g, '') ?? '0', 10)
        if (pid && !isPreExistingPid(pid)) {
          setExeCooldown(name)
          handleInterception(pid, name).catch(console.error)
        }
      })
    }
  })


  mainWindow = createMainWindow()

 function showMainWindow() {
    if (!mainWindow || mainWindow.isDestroyed()) {
      mainWindow = createMainWindow()
      return
    }
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }


  initTray(
    store,
    showMainWindow,
    () => {
      if (mainWindow && !mainWindow.isDestroyed()) return mainWindow
      return null
    },
    (_paused: boolean) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC.SETTINGS_UPDATED, { ...DEFAULT_SETTINGS, ...store.store })
      }
    }
  )


  
  registerIpcHandlers(store, () => modalWindow, (settings) => {
    mainWindow?.webContents.send(IPC.SETTINGS_UPDATED, settings)
  })
  registerModalIpc()
})

app.on('window-all-closed', () => {
  // Don't quit on window close — live in tray
})

app.on('before-quit', () => {
  stopUsageFlushTimer()
  destroyTray()
  stopWmiWatcher()
  stopFallbackWatchdog()
})

app.on('activate', () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow()
  } else {
    mainWindow.show()
  }
})