export const IPC = {
  // Main → Renderer
  INTERCEPTION_START:  'interception:start',
  SETTINGS_UPDATED:    'settings:updated',

  // Renderer → Main
  INTENTION_SUBMIT:    'intention:submit',
  INTENTION_CANCEL:    'intention:cancel',
  GET_SETTINGS:        'settings:get',
  SET_SETTINGS:        'settings:set',
  GET_LOGS:            'logs:get',
  GET_STATS:           'stats:get',
  EXPORT_CSV:          'export:csv',
  CLEAR_LOGS:          'logs:clear',
  CLEAR_ACTIVITY:      'activity:clear',
  CLEAR_ALL:           'all:clear',
  PICK_EXE:            'app:pickExe',
  PAUSE_TOGGLE:        'pause:toggle',
  PAUSE_TIMED:         'pause:timed',
  GET_PAUSE_STATE:     'pause:getState',
  GET_ACTIVITY:        'activity:get',
  GET_ACTIVITY_ICONS:  'activity:icons',
  HIDE_APP:            'activity:hideApp',
  UNHIDE_APP:          'activity:unhideApp',
} as const

export type IpcKey = typeof IPC[keyof typeof IPC]

export interface BlockedApp {
  id: string
  name: string
  exePath: string
  icon: string   // base64 PNG
  enabled: boolean
}

export interface AppSettings {
  blockedApps: BlockedApp[]
  hiddenApps: string[]       // app names hidden from activity tracking
  minWordCount: number
  countdownDelay: number   // seconds
  focusHoursEnabled: boolean
  focusStart: string       // "HH:MM"
  focusEnd: string         // "HH:MM"
  launchAtStartup: boolean
  darkMode: boolean
  isPaused: boolean
  pauseUntil: number | null  // timestamp ms
}

export const DEFAULT_SETTINGS: AppSettings = {
  blockedApps: [],
  hiddenApps: [],
  minWordCount: 10,
  countdownDelay: 10,
  focusHoursEnabled: false,
  focusStart: '09:00',
  focusEnd: '22:00',
  launchAtStartup: false,
  darkMode: true,
  isPaused: false,
  pauseUntil: null,
}

export interface InterceptionPayload {
  appName: string
  exePath: string
  icon: string
  pid: number
  suspended: boolean
}

export interface IntentionLog {
  id: number
  timestamp: string
  app_name: string
  exe_path: string
  purpose: string
  word_count: number
  resumed: number
}

export interface AppActivity {
  id: number
  timestamp: string
  app_name: string
  is_blocked: number
}

export interface StatsData {
  launchedToday: number
  uniqueAppsEver: number
  interceptionsThisWeek: number
  completedInterceptions: number
  totalInterceptions: number
  topApps: { name: string; count: number }[]
  hourlyActivity: { hour: number; count: number }[]
  dailyInterceptions: { date: string; count: number }[]
}

export interface AppUsageSummary {
  app_name: string
  total_seconds: number
}

export interface DailyUsage {
  date: string
  total_seconds: number
}

export interface ActivityData {
  apps: AppUsageSummary[]
  dailyUsage: DailyUsage[]
}