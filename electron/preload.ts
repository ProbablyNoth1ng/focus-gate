import { contextBridge, ipcRenderer } from 'electron'

 
const IPC = {
  INTERCEPTION_START: 'interception:start',
  SETTINGS_UPDATED:   'settings:updated',
  INTENTION_SUBMIT:   'intention:submit',
  INTENTION_CANCEL:   'intention:cancel',
  GET_SETTINGS:       'settings:get',
  SET_SETTINGS:       'settings:set',
  GET_LOGS:           'logs:get',
  GET_STATS:          'stats:get',
  EXPORT_CSV:         'export:csv',
  CLEAR_LOGS:         'logs:clear',
  CLEAR_ACTIVITY:     'activity:clear',
  CLEAR_ALL:          'all:clear',
  PICK_EXE:           'app:pickExe',
  PAUSE_TOGGLE:       'pause:toggle',
  PAUSE_TIMED:        'pause:timed',
  GET_PAUSE_STATE:    'pause:getState',
  GET_ACTIVITY:       'activity:get',
  GET_ACTIVITY_ICONS: 'activity:icons',
  HIDE_APP:           'activity:hideApp',
  UNHIDE_APP:         'activity:unhideApp',
} as const

 
import type {
  AppSettings,
  InterceptionPayload,
  IntentionLog,
  StatsData,
  ActivityData,
} from '../shared/ipc-types'

 
contextBridge.exposeInMainWorld('electronAPI', {
  getSettings: (): Promise<AppSettings> =>
    ipcRenderer.invoke(IPC.GET_SETTINGS),


  windowMinimize: () => ipcRenderer.send('window:minimize'),
  windowMaximize: () => ipcRenderer.send('window:maximize'),
  windowClose:    () => ipcRenderer.send('window:close'),

  setSettings: (partial: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke(IPC.SET_SETTINGS, partial),

  getLogs: (opts?: {
    search?: string
    dateFrom?: string
    dateTo?: string
    sortBy?: string
    sortDir?: string
  }): Promise<IntentionLog[]> =>
    ipcRenderer.invoke(IPC.GET_LOGS, opts),

  getStats: (): Promise<StatsData> =>
    ipcRenderer.invoke(IPC.GET_STATS),

  clearLogs: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC.CLEAR_LOGS),

  clearActivity: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC.CLEAR_ACTIVITY),

  clearAll: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC.CLEAR_ALL),

  exportCsv: (): Promise<{ success: boolean; filePath?: string }> =>
    ipcRenderer.invoke(IPC.EXPORT_CSV),

  pickExe: (): Promise<{ exePath: string; name: string; icon: string } | null> =>
    ipcRenderer.invoke(IPC.PICK_EXE),

  submitIntention: (payload: {
    appName: string
    exePath: string
    purpose: string
    wordCount: number
    resumed: boolean
  }): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC.INTENTION_SUBMIT, payload),

  cancelIntention: (): void =>
    ipcRenderer.send(IPC.INTENTION_CANCEL),

  resumeIntention: (exePath: string): void =>
    ipcRenderer.send('intention:resume', exePath),

  getCurrentInterception: (): Promise<import('../shared/ipc-types').InterceptionPayload | null> =>
    ipcRenderer.invoke('interception:get-current').catch(() => null),

  pauseToggle: (): Promise<boolean> =>
    ipcRenderer.invoke(IPC.PAUSE_TOGGLE),

  getPauseState: (): Promise<{ isPaused: boolean; pauseUntil: number | null }> =>
    ipcRenderer.invoke(IPC.GET_PAUSE_STATE),

  getActivity: (): Promise<ActivityData> =>
    ipcRenderer.invoke(IPC.GET_ACTIVITY),

  getActivityIcons: (appNames: string[]): Promise<Record<string, string>> =>
    ipcRenderer.invoke(IPC.GET_ACTIVITY_ICONS, appNames),

  hideApp: (appName: string): Promise<string[]> =>
    ipcRenderer.invoke(IPC.HIDE_APP, appName),

  unhideApp: (appName: string): Promise<string[]> =>
    ipcRenderer.invoke(IPC.UNHIDE_APP, appName),

   onInterceptionStart: (cb: (payload: InterceptionPayload) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: InterceptionPayload) => cb(payload)
    ipcRenderer.on(IPC.INTERCEPTION_START, handler)
    return () => ipcRenderer.off(IPC.INTERCEPTION_START, handler)
  },

  onSettingsUpdated: (cb: (settings: AppSettings) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, settings: AppSettings) => cb(settings)
    ipcRenderer.on(IPC.SETTINGS_UPDATED, handler)
    return () => ipcRenderer.off(IPC.SETTINGS_UPDATED, handler)
  },
})

export {}