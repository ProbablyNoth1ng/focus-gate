import {
  app,
  BrowserWindow,
  ipcMain,
} from 'electron'
import path from 'path'
import { exec } from 'child_process'
import Store from 'electron-store'
import { AppSettings, DEFAULT_SETTINGS, IPC, InterceptionPayload } from '../shared/ipc-types'
import { initDatabase, logActivity } from './database'
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

// ─── Store ───────────────────────────────────────────────────────────────────
const store = new Store<AppSettings>({ defaults: DEFAULT_SETTINGS })

// ─── State ───────────────────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null
let modalWindow: BrowserWindow | null = null
let intercepting = false          // prevents concurrent interceptions
let startupGraceUntil = 0        // no interceptions during startup seeding
let currentInterception: InterceptionPayload | null = null

const isDev = process.env.NODE_ENV !== 'production'

// Allow loading local ES modules via file:// in production
app.commandLine.appendSwitch('allow-file-access-from-files')
app.commandLine.appendSwitch('disable-web-security')

// wmiWatcher.ps1 sits next to main.js in dist/electron/ (copied by dev:copy-ps1 script)
// pssuspend.exe sits in assets/ at project root (or resources/ in prod)
const scriptPath = isDev
  ? __dirname
  : process.resourcesPath

const resourcesPath = isDev
  ? path.join(__dirname, '..', '..', 'assets')
  : process.resourcesPath

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
  if (settings.isPaused || (pauseUntil && now < pauseUntil)) return

  if (!isInFocusHours()) return

  // Don't intercept during startup grace period (WMI is still seeding existing PIDs)
  if (Date.now() < startupGraceUntil) return

  // Don't allow two concurrent interceptions
  if (intercepting) return

  const blockedApp = settings.blockedApps.find(
    a => a.enabled && a.exePath.toLowerCase().endsWith(exeName.toLowerCase())
  )
  if (!blockedApp) return

  if (modalWindow && !modalWindow.isDestroyed()) {
    modalWindow.destroy()
    modalWindow = null
  }

  intercepting = true
  const suspended = await suspendProcess(pid, blockedApp.exePath, resourcesPath)

  modalWindow = new BrowserWindow({
    width: 560,
    height: 480,
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
    await modalWindow.loadFile(path.join(app.getAppPath(), 'dist/renderer/index.html'), {
      query: { modal: 'true' }
    })
  }

  modalWindow.show()
  modalWindow.focus()

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
    height: 680,
    minWidth: 720,
    minHeight: 560,
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
    win.loadFile(path.join(app.getAppPath(), 'dist/renderer/index.html'))
  }
  

  win.once('ready-to-show', () => {
    const launchedAtStartup = app.getLoginItemSettings().wasOpenedAtLogin
    if (!launchedAtStartup) win.show()
    win.webContents.openDevTools({ mode: 'detach' }) // detached so it doesn't cover the window
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
      cancelInterception(currentInterception.exePath)
      currentInterception = null
    }
    if (modalWindow && !modalWindow.isDestroyed()) {
      modalWindow.destroy()
      modalWindow = null
    }
    intercepting = false
  })

  ipcMain.on('intention:resume', async (_event, exePath: string) => {
    if (modalWindow && !modalWindow.isDestroyed()) {
      modalWindow.destroy()
      modalWindow = null
    }
    currentInterception = null
    intercepting = false  // clear BEFORE resume so next real open isn't blocked
    await resumeProcess(exePath, resourcesPath)
  })
}

// ─── App Lifecycle ───────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  try {
    await initDatabase()
  } catch (err) {
    console.error('[DB] Failed to initialize database:', err)
    // App can still run without DB — IPC handlers will fail gracefully
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
    logActivity(name, isBlocked)

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
          logActivity(name, true)
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