import {
  app,
  BrowserWindow,
  ipcMain,
} from 'electron'
import path from 'path'
import Store from 'electron-store'
import { AppSettings, DEFAULT_SETTINGS, IPC, InterceptionPayload } from '../shared/ipc-types'
import { initDatabase, logActivity, logInterceptionResult, accumulateUsage, startDailyScreenTimeTimer, stopDailyScreenTimeTimer, flushPendingPersist } from './database'
import {
  startWmiWatcher,
  startForegroundWatcher,
  stopWmiWatcher,
  stopForegroundWatcher,
  startFallbackWatchdog,
  stopFallbackWatchdog,
  isSystemProcess,
  isRealApp,
  shouldInterceptProcess,
  excludeExistingPids,
  isPreExistingPid,
  releasePreExistingPid,
  normalizeExeName,
} from './processMonitor'
import { suspendProcess, resumeProcess, cancelInterception, isPidApproved, pruneApprovedPids } from './interception'
import { initTray, destroyTray } from './tray'
import { registerIpcHandlers } from './ipcHandlers'
import { setAutostart } from './autostart'
import { debugLog, getDebugLogPath } from './debugLog'

const store = new Store<AppSettings>({ defaults: DEFAULT_SETTINGS })

let mainWindow: BrowserWindow | null = null
let modalWindow: BrowserWindow | null = null
let intercepting = false
let startupGraceUntil = 0
let currentInterception: InterceptionPayload | null = null

let appUsageTimer: ReturnType<typeof setInterval> | null = null
let currentForegroundAppName: string | null = null

function tickAppUsage(): void {
  if (!currentForegroundAppName) return
  accumulateUsage(currentForegroundAppName)
}

function startAppUsageTimer(): void {
  if (appUsageTimer) return
  appUsageTimer = setInterval(tickAppUsage, 60_000)
  console.log('[USAGE] Periodic app-usage timer started (60 s interval)')
}

function stopAppUsageTimer(): void {
  if (!appUsageTimer) return
  tickAppUsage()
  clearInterval(appUsageTimer)
  appUsageTimer = null
  console.log('[USAGE] Periodic app-usage timer stopped')
}

const isDev = !app.isPackaged

const scriptPath = isDev
  ? __dirname
  : process.resourcesPath

const resourcesPath = isDev
  ? path.join(__dirname, '..', '..', 'assets')
  : process.resourcesPath

function ts() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

function isInFocusHours(): boolean {
  const settings = { ...DEFAULT_SETTINGS, ...store.store } as AppSettings
  if (!settings.focusHoursEnabled) return true

  const now = new Date()
  const [startH, startM] = settings.focusStart.split(':').map(Number)
  const [endH, endM] = settings.focusEnd.split(':').map(Number)
  const nowMins = now.getHours() * 60 + now.getMinutes()
  const startMin = startH * 60 + startM
  const endMin = endH * 60 + endM
  return nowMins >= startMin && nowMins <= endMin
}

function getBlockedAppForExe(exeName: string): AppSettings['blockedApps'][number] | undefined {
  const normalizedExeName = normalizeExeName(exeName)
  const settings = { ...DEFAULT_SETTINGS, ...store.store } as AppSettings
  return settings.blockedApps.find(
    (blockedApp) => blockedApp.enabled && normalizeExeName(path.basename(blockedApp.exePath)) === normalizedExeName
  )
}

async function handleInterception(pid: number, exeName: string): Promise<void> {
  const settings = { ...DEFAULT_SETTINGS, ...store.store } as AppSettings
  const normalizedExeName = normalizeExeName(exeName)

  const now = Date.now()
  const pauseUntil = settings.pauseUntil
  if (settings.isPaused || (pauseUntil && now < pauseUntil)) {
    console.log(`[${ts()}] [SKIP] FocusGate paused - ${normalizedExeName}`)
    debugLog(`[INTERCEPT SKIP] paused exe=${normalizedExeName} pid=${pid}`)
    return
  }

  if (!isInFocusHours()) {
    console.log(`[${ts()}] [SKIP] Outside focus hours - ${normalizedExeName}`)
    debugLog(`[INTERCEPT SKIP] focus-hours exe=${normalizedExeName} pid=${pid}`)
    return
  }

  if (Date.now() < startupGraceUntil) {
    console.log(`[${ts()}] [SKIP] Startup grace active - ${normalizedExeName}`)
    debugLog(`[INTERCEPT SKIP] startup-grace exe=${normalizedExeName} pid=${pid}`)
    return
  }

  if (intercepting) {
    console.log(`[${ts()}] [SKIP] Already intercepting - ${normalizedExeName}`)
    debugLog(`[INTERCEPT SKIP] already-intercepting exe=${normalizedExeName} pid=${pid}`)
    return
  }

  const blockedApp = getBlockedAppForExe(normalizedExeName)
  if (!blockedApp) return

  if (modalWindow && !modalWindow.isDestroyed()) {
    modalWindow.destroy()
    modalWindow = null
  }

  intercepting = true
  console.log(`[${ts()}] [INTERCEPT] Starting - pid=${pid} exe=${normalizedExeName}`)
  debugLog(`[INTERCEPT START] exe=${normalizedExeName} pid=${pid}`)
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

  modalWindow.on('close', (event) => event.preventDefault())

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
    await modalWindow.loadURL(`file://${path.join(app.getAppPath(), 'dist/renderer/index.html').replace(/\\/g, '/')}?modal=true`)
  }

  modalWindow.show()
  modalWindow.focus()
  console.log(`[${ts()}] [MODAL] Shown - app="${blockedApp.name}" pid=${pid}`)

  const sendPayload = () => {
    if (modalWindow && !modalWindow.isDestroyed()) {
      modalWindow.webContents.send(IPC.INTERCEPTION_START, payload)
    }
  }

  modalWindow.webContents.on('did-finish-load', () => {
    sendPayload()
    setTimeout(sendPayload, 600)
  })

  try {
    ipcMain.removeHandler('interception:get-current')
  } catch {
    // No previous handler to remove.
  }
  ipcMain.handle('interception:get-current', () => currentInterception)
}

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
    win.loadURL(`file://${path.join(app.getAppPath(), 'dist/renderer/index.html').replace(/\\/g, '/')}`)
  }

  win.once('ready-to-show', () => {
    if (process.argv.includes('--minimize-to-tray')) return
    win.show()
  })

  win.on('close', (event) => {
    event.preventDefault()
    win.hide()
  })

  return win
}

function registerModalIpc(): void {
  ipcMain.on(IPC.INTENTION_CANCEL, async () => {
    if (currentInterception) {
      console.log(`[${ts()}] [CANCEL] User dismissed - app="${currentInterception.appName}"`)
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
    console.log(`[${ts()}] [SUBMIT] Purpose submitted - resuming exe=${exePath}`)
    if (modalWindow && !modalWindow.isDestroyed()) {
      modalWindow.destroy()
      modalWindow = null
    }
    currentInterception = null
    intercepting = false
    console.log(`[${ts()}] [STATE] intercepting=false (submitted)`)
    await resumeProcess(exePath, resourcesPath)
  })
}

app.whenReady().then(async () => {
  try {
    await initDatabase()
    startDailyScreenTimeTimer()
    startAppUsageTimer()
    debugLog(`[APP READY] debug-log=${getDebugLogPath()}`)
  } catch (err) {
    console.error('[DB] Failed to initialize database:', err)
  }

  const hasSetStartup = store.has('launchAtStartup')
  if (!hasSetStartup) {
    store.set('launchAtStartup', false)
    setAutostart(false)
    console.log('[Autostart] First run - autostart disabled by default')
  }

  function getBlockedNames(): Set<string> {
    const settings = { ...DEFAULT_SETTINGS, ...store.store } as AppSettings
    return new Set(
      settings.blockedApps
        .filter((blockedApp) => blockedApp.enabled)
        .map((blockedApp) => normalizeExeName(path.basename(blockedApp.exePath)))
    )
  }

  const startupSettings = { ...DEFAULT_SETTINGS, ...store.store } as AppSettings
  await Promise.all(
    startupSettings.blockedApps
      .filter((blockedApp) => blockedApp.enabled)
      .map((blockedApp) => excludeExistingPids(path.basename(blockedApp.exePath)))
  )

  startupGraceUntil = Date.now() + 5000

  startWmiWatcher((pid, name) => {
    if (isSystemProcess(name)) return
    if (!isRealApp(name)) return

    releasePreExistingPid(pid)
    pruneApprovedPids()

    const normalizedExeName = normalizeExeName(name)
    const blockedApp = getBlockedAppForExe(normalizedExeName)
    const isBlocked = Boolean(blockedApp)
    if (isBlocked) {
      debugLog(`[WATCHER] candidate source=primary exe=${normalizedExeName} pid=${pid}`)
    }

    logActivity(normalizedExeName.replace(/\.exe$/i, ''), isBlocked)

    const isOldPid = isBlocked ? isPreExistingPid(pid, normalizedExeName) : false
    const isApproved = isBlocked ? isPidApproved(pid) : false
    const shouldInterceptNow = isBlocked ? shouldInterceptProcess(pid, normalizedExeName) : false

    if (isBlocked) {
      debugLog(`[WATCHER CHECK] source=primary exe=${normalizedExeName} pid=${pid} preExisting=${isOldPid} approved=${isApproved} dedupe=${shouldInterceptNow}`)
    }

    if (isBlocked && !isOldPid && !isApproved && shouldInterceptNow) {
      handleInterception(pid, normalizedExeName).catch((error) => {
        debugLog(`[INTERCEPT ERROR] source=primary exe=${normalizedExeName} pid=${pid} error=${String(error)}`)
        console.error(error)
      })
    }
  }, scriptPath)

  startForegroundWatcher((current, previous) => {
    if (isSystemProcess(current.name) || !isRealApp(current.name)) {
      currentForegroundAppName = null
      return
    }

    const cleanName = current.name.replace(/\.exe$/i, '')
    const isBlocked = getBlockedNames().has(current.name)
    currentForegroundAppName = cleanName
    logActivity(cleanName, isBlocked)

    if (!isBlocked) return

    pruneApprovedPids()
    const isOldPid = isPreExistingPid(current.pid, current.name)
    const isApproved = isPidApproved(current.pid)
    const shouldInterceptNow = shouldInterceptProcess(current.pid, current.name)
    debugLog(`[WATCHER CHECK] source=foreground exe=${current.name} pid=${current.pid} preExisting=${isOldPid} approved=${isApproved} dedupe=${shouldInterceptNow}`)
    if (isOldPid) return
    if (isApproved) return
    if (!shouldInterceptNow) return

    handleInterception(current.pid, current.name).catch((error) => {
      debugLog(`[INTERCEPT ERROR] source=foreground exe=${current.name} pid=${current.pid} error=${String(error)}`)
      console.error(error)
    })
  }, scriptPath)

  startFallbackWatchdog(getBlockedNames, (pid, name) => {
    pruneApprovedPids()
    const isOldPid = isPreExistingPid(pid, name)
    const isApproved = isPidApproved(pid)
    const shouldInterceptNow = shouldInterceptProcess(pid, name)
    debugLog(`[WATCHER CHECK] source=fallback exe=${name} pid=${pid} preExisting=${isOldPid} approved=${isApproved} dedupe=${shouldInterceptNow}`)
    if (!isOldPid && !isApproved && shouldInterceptNow) {
      handleInterception(pid, name).catch((error) => {
        debugLog(`[INTERCEPT ERROR] source=fallback exe=${name} pid=${pid} error=${String(error)}`)
        console.error(error)
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
  // Live in tray when the window is closed.
})

app.on('before-quit', () => {
  stopDailyScreenTimeTimer()
  stopAppUsageTimer()
  flushPendingPersist()
  destroyTray()
  stopWmiWatcher()
  stopForegroundWatcher()
  stopFallbackWatchdog()
})

app.on('activate', () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow()
  } else {
    mainWindow.show()
  }
})
