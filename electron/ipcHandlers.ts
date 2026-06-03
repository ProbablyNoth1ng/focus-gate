import { ipcMain, dialog, BrowserWindow, app } from 'electron'
import path from 'path'
import fs from 'fs'
import Store from 'electron-store'
import { IPC, AppSettings, DEFAULT_SETTINGS } from '../shared/ipc-types'
import {
  getLogs,
  getStats,
  getActivityData,
  getAppIcons,
  clearLogs,
  clearActivity,
  clearAll,
  exportCsv,
  logIntention,
  logInterceptionResult,
} from './database'
import { setAutostart } from './autostart'
import { setTrayPaused } from './tray'
import { excludeExistingPids } from './processMonitor'


export function registerIpcHandlers(
  store: Store<AppSettings>,
  getModalWindow: () => BrowserWindow | null,
  onSettingsChange: (settings: AppSettings) => void
): void {

  // ── Settings ──────────────────────────────────────────────
  ipcMain.handle(IPC.GET_SETTINGS, () => {
    return {
      ...DEFAULT_SETTINGS,
      ...store.store,
    } as AppSettings
  })

  ipcMain.handle(IPC.SET_SETTINGS, async (_event, partial: Partial<AppSettings>) => {
    // If blocked apps list is being updated, snapshot currently-running PIDs
    // for any newly added/enabled apps so we never intercept pre-existing instances
    if (partial.blockedApps) {
      const oldApps = (store.get('blockedApps') ?? []) as AppSettings['blockedApps']
      const oldEnabledIds = new Set(oldApps.filter(a => a.enabled).map(a => a.id))

      for (const app of partial.blockedApps) {
        const wasAlreadyEnabled = oldEnabledIds.has(app.id)
        if (app.enabled && !wasAlreadyEnabled) {
          // Newly added or just enabled — snapshot all currently running instances
          const exeName = path.basename(app.exePath)
          await excludeExistingPids(exeName)
        }
      }
    }

    for (const [key, value] of Object.entries(partial)) {
      store.set(key as keyof AppSettings, value as AppSettings[keyof AppSettings])
    }

    if ('launchAtStartup' in partial) {
      setAutostart(partial.launchAtStartup!)
    }
    if ('isPaused' in partial) {
      setTrayPaused(partial.isPaused!)
    }

    const full = { ...DEFAULT_SETTINGS, ...store.store } as AppSettings
    onSettingsChange(full)
    return full
  })

  // ── Logs ──────────────────────────────────────────────────
  ipcMain.handle(IPC.GET_LOGS, (_event, opts: {
    search?: string
    dateFrom?: string
    dateTo?: string
    sortBy?: string
    sortDir?: string
  } = {}) => {
    return getLogs(opts.search, opts.dateFrom, opts.dateTo, opts.sortBy, opts.sortDir)
  })

  ipcMain.handle(IPC.CLEAR_LOGS, () => {
    clearLogs()
    return { success: true }
  })

  ipcMain.handle(IPC.CLEAR_ACTIVITY, () => {
    clearActivity()
    store.set('hiddenApps', [])
    return { success: true }
  })

  ipcMain.handle(IPC.CLEAR_ALL, () => {
    clearAll()
    return { success: true }
  })

  // ── Stats ─────────────────────────────────────────────────
  ipcMain.handle(IPC.GET_STATS, () => {
    return getStats()
  })

  // ── Activity ──────────────────────────────────────────────
  ipcMain.handle(IPC.GET_ACTIVITY, () => {
    const settings = { ...DEFAULT_SETTINGS, ...store.store } as AppSettings
    return getActivityData(settings.hiddenApps ?? [])
  })

  ipcMain.handle(IPC.GET_ACTIVITY_ICONS, async (_event, appNames: string[]) => {
    return getAppIcons(appNames)
  })

  ipcMain.handle(IPC.HIDE_APP, (_event, appName: string) => {
    const settings = { ...DEFAULT_SETTINGS, ...store.store } as AppSettings
    const hidden = [...(settings.hiddenApps ?? []), appName]
    store.set('hiddenApps', hidden)
    return hidden
  })

  ipcMain.handle(IPC.UNHIDE_APP, (_event, appName: string) => {
    const settings = { ...DEFAULT_SETTINGS, ...store.store } as AppSettings
    const hidden = (settings.hiddenApps ?? []).filter(h => h !== appName)
    store.set('hiddenApps', hidden)
    return hidden
  })

  // ── Export ────────────────────────────────────────────────
  ipcMain.handle(IPC.EXPORT_CSV, async () => {
    const { filePath } = await dialog.showSaveDialog({
      title: 'Export Intention Logs',
      defaultPath: `focusgate-logs-${new Date().toISOString().slice(0, 10)}.csv`,
      filters: [{ name: 'CSV Files', extensions: ['csv'] }],
    })
    if (!filePath) return { success: false }
    const csv = exportCsv()
    fs.writeFileSync(filePath, csv, 'utf8')
    return { success: true, filePath }
  })

  // ── Pick .exe ─────────────────────────────────────────────
  ipcMain.handle(IPC.PICK_EXE, async () => {
    const { filePaths } = await dialog.showOpenDialog({
      title: 'Select Application',
      filters: [{ name: 'Executables', extensions: ['exe'] }],
      properties: ['openFile'],
    })
    if (!filePaths.length) return null
    const exePath = filePaths[0]
    const name = path.basename(exePath, '.exe')

    let icon = ''
    try {
      const nativeImg = await app.getFileIcon(exePath, { size: 'normal' })
      icon = nativeImg.toDataURL()
    } catch {
      icon = ''
    }

    return { exePath, name, icon }
  })

  // ── Pause toggle ──────────────────────────────────────────
  ipcMain.handle(IPC.PAUSE_TOGGLE, () => {
    const current = store.get('isPaused') ?? false
    const next = !current
    store.set('isPaused', next)
    store.set('pauseUntil', null)
    setTrayPaused(next)
    onSettingsChange({ ...DEFAULT_SETTINGS, ...store.store } as AppSettings)
    return next
  })

  ipcMain.handle(IPC.GET_PAUSE_STATE, () => {
    return {
      isPaused: store.get('isPaused') ?? false,
      pauseUntil: store.get('pauseUntil') ?? null,
    }
  })

  // ── Intention modal ───────────────────────────────────────
  ipcMain.handle(IPC.INTENTION_SUBMIT, (_event, payload: {
    appName: string
    exePath: string
    purpose: string
    wordCount: number
    resumed: boolean
  }) => {
    logIntention(payload.appName, payload.exePath, payload.purpose, payload.wordCount, payload.resumed)
    logInterceptionResult(payload.appName, 'completed')
    return { success: true }
  })

  ipcMain.on('window:minimize', (_event) => {
    BrowserWindow.fromWebContents(_event.sender)?.minimize()
  })
  ipcMain.on('window:maximize', (_event) => {
    const win = BrowserWindow.fromWebContents(_event.sender)
    if (!win) return
    win.isMaximized() ? win.unmaximize() : win.maximize()
  })
  ipcMain.on('window:close', (_event) => {
    BrowserWindow.fromWebContents(_event.sender)?.close()
  })

  // suppress unused variable warning
  void getModalWindow
}