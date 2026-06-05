import type {
  AppSettings,
  InterceptionPayload,
  IntentionLog,
  StatsData,
  ActivityData,
  ActivityForDateResult,
} from '../shared/ipc-types'

declare global {
  interface Window {
    electronAPI: {
      getSettings: () => Promise<AppSettings>
      setSettings: (partial: Partial<AppSettings>) => Promise<AppSettings>
      getLogs: (opts?: {
        search?: string
        dateFrom?: string
        dateTo?: string
        sortBy?: string
        sortDir?: string
      }) => Promise<IntentionLog[]>
      getStats: () => Promise<StatsData>
      clearLogs: () => Promise<{ success: boolean }>
      clearActivity: () => Promise<{ success: boolean }>
      clearAll: () => Promise<{ success: boolean }>
      exportCsv: () => Promise<{ success: boolean; filePath?: string }>
      pickExe: () => Promise<{ exePath: string; name: string; icon: string } | null>
      submitIntention: (payload: {
        appName: string
        exePath: string
        purpose: string
        wordCount: number
        resumed: boolean
      }) => Promise<{ success: boolean }>
      cancelIntention: () => void
      resumeIntention: (exePath: string) => void
      getCurrentInterception: () => Promise<InterceptionPayload | null>
      pauseToggle: () => Promise<boolean>
      getPauseState: () => Promise<{ isPaused: boolean; pauseUntil: number | null }>
      getActivity: () => Promise<ActivityData>
      getActivityIcons: (appNames: string[]) => Promise<Record<string, string>>
      hideApp: (appName: string) => Promise<string[]>
      unhideApp: (appName: string) => Promise<string[]>
      getActivityForDate: (date: string) => Promise<ActivityForDateResult>
      onInterceptionStart: (cb: (payload: InterceptionPayload) => void) => () => void
      onSettingsUpdated: (cb: (settings: AppSettings) => void) => () => void
      windowMinimize: () => void
      windowMaximize: () => void
      windowClose: () => void
    }
  }
}

export {}
declare module '*.png' {
  const src: string
  export default src
}
