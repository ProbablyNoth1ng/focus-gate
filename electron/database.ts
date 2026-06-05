import path from 'path'
import fs from 'fs'
import { exec } from 'child_process'
import { app } from 'electron'
import initSqlJs, { Database, SqlJsStatic } from 'sql.js'
import type { IntentionLog, StatsData } from '../shared/ipc-types'

let db: Database
let SQL: SqlJsStatic
let dbPath: string

export async function initDatabase(): Promise<void> {
  dbPath = path.join(app.getPath('userData'), 'focusgate.db')

  const sqlJsMainFile = require.resolve('sql.js')

  const candidates = [
    path.join(path.dirname(sqlJsMainFile), 'sql-wasm.wasm'),
    path.join(path.dirname(sqlJsMainFile), '..', 'dist', 'sql-wasm.wasm'),
    path.join(path.dirname(sqlJsMainFile), 'dist', 'sql-wasm.wasm'),
  ]
  const wasmPath = candidates.find(p => fs.existsSync(p))
  if (!wasmPath) throw new Error(`sql-wasm.wasm not found. Tried: ${candidates.join(', ')}`)

  const wasmBuffer = fs.readFileSync(wasmPath)
  const wasmBinary: ArrayBuffer = wasmBuffer.buffer.slice(
    wasmBuffer.byteOffset,
    wasmBuffer.byteOffset + wasmBuffer.byteLength
  ) as ArrayBuffer
  SQL = await initSqlJs({ wasmBinary })

  if (fs.existsSync(dbPath)) {
    try {
      const fileBuffer = fs.readFileSync(dbPath)
      if (fileBuffer.length === 0) {
        throw new Error('Database file is empty')
      }
      db = new SQL.Database(fileBuffer)
      db.run('SELECT 1')
    } catch (loadErr) {
      console.error('[DB] Existing database is corrupt, backing up and starting fresh:', loadErr)
      const backupPath = dbPath + '.corrupt-' + Date.now()
      try { fs.renameSync(dbPath, backupPath) } catch { }
      db = new SQL.Database()
    }
  } else {
    db = new SQL.Database()
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS intention_logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp   TEXT    NOT NULL,
      app_name    TEXT    NOT NULL,
      exe_path    TEXT    NOT NULL,
      purpose     TEXT    NOT NULL,
      word_count  INTEGER NOT NULL,
      resumed     INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS app_activity (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp   TEXT    NOT NULL,
      app_name    TEXT    NOT NULL,
      is_blocked  INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS interception_results (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp   TEXT    NOT NULL,
      app_name    TEXT    NOT NULL,
      outcome     TEXT    NOT NULL CHECK(outcome IN ('completed', 'dismissed'))
    );

    CREATE TABLE IF NOT EXISTS app_usage (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      app_name    TEXT    NOT NULL,
      date        TEXT    NOT NULL,
      seconds     INTEGER NOT NULL DEFAULT 0,
      UNIQUE(app_name, date)
    );

    CREATE TABLE IF NOT EXISTS daily_screen_time (
      date TEXT PRIMARY KEY,
      seconds INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_activity_timestamp   ON app_activity(timestamp);
    CREATE INDEX IF NOT EXISTS idx_activity_name        ON app_activity(app_name);
    CREATE INDEX IF NOT EXISTS idx_logs_timestamp       ON intention_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_results_timestamp    ON interception_results(timestamp);
    CREATE INDEX IF NOT EXISTS idx_app_usage_date       ON app_usage(date);
  `)

  console.log('[DB] Initialized at', dbPath)
}

function persist(): void {
  const data = db.export()
  fs.writeFileSync(dbPath, Buffer.from(data))
}

function queryAll<T>(sql: string, params: (string | number)[] = []): T[] {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const rows: T[] = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T)
  }
  stmt.free()
  return rows
}

function queryOne<T>(sql: string, params: (string | number)[] = []): T | undefined {
  const results = queryAll<T>(sql, params)
  return results[0]
}

export function logIntention(
  appName: string,
  exePath: string,
  purpose: string,
  wordCount: number,
  resumed: boolean
): void {
  if (!db) return 
  db.run(
    `INSERT INTO intention_logs (timestamp, app_name, exe_path, purpose, word_count, resumed)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [new Date().toISOString(), appName, exePath, purpose, wordCount, resumed ? 1 : 0]
  )
  persist()
}

// Log the outcome of an interception: 'completed' = user submitted intention, 'dismissed' = user closed modal
export function logInterceptionResult(appName: string, outcome: 'completed' | 'dismissed'): void {
  if (!db) return  
  db.run(
    `INSERT INTO interception_results (timestamp, app_name, outcome) VALUES (?, ?, ?)`,
    [new Date().toISOString(), appName.toLowerCase(), outcome]
  )
  persist()
}


const recentlyLoggedActivity = new Map<string, number>()
const ACTIVITY_DEDUP_MS = 15_000

export function logActivity(appName: string, isBlocked = false): void {
  if (!db) return 
  const key = appName.toLowerCase()
  const last = recentlyLoggedActivity.get(key)
  if (last && Date.now() - last < ACTIVITY_DEDUP_MS) return
  recentlyLoggedActivity.set(key, Date.now())

  db.run(
    `INSERT INTO app_activity (timestamp, app_name, is_blocked) VALUES (?, ?, ?)`,
    [new Date().toISOString(), key, isBlocked ? 1 : 0]
  )
  persist()
}

export function getLogs(
  search = '',
  dateFrom = '',
  dateTo = '',
  sortBy = 'timestamp',
  sortDir = 'DESC'
): IntentionLog[] {
  const validSortCols = ['timestamp', 'app_name', 'word_count']
  const col = validSortCols.includes(sortBy) ? sortBy : 'timestamp'
  const dir = sortDir === 'ASC' ? 'ASC' : 'DESC'

  let query = 'SELECT * FROM intention_logs WHERE 1=1'
  const params: (string | number)[] = []

  if (search) {
    query += ' AND (app_name LIKE ? OR purpose LIKE ?)'
    params.push(`%${search}%`, `%${search}%`)
  }
  if (dateFrom) {
    query += ' AND timestamp >= ?'
    params.push(dateFrom)
  }
  if (dateTo) {
    query += ' AND timestamp <= ?'
    params.push(dateTo + 'T23:59:59')
  }

  query += ` ORDER BY ${col} ${dir}`
  return queryAll<IntentionLog>(query, params)
}

export function getStats(): StatsData {
  const now = new Date()

  const localMidnightUTC = (offsetDays: number): string => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() + offsetDays)
    return d.toISOString()
  }
  const todayStart = localMidnightUTC(0)
  const weekStart  = localMidnightUTC(-7)
  const monthStart = localMidnightUTC(-30)


  const launchedToday          = (queryOne<{ c: number }>('SELECT COUNT(*) as c FROM interception_results WHERE timestamp >= ?', [todayStart])?.c) ?? 0
  const uniqueAppsEver         = (queryOne<{ c: number }>('SELECT COUNT(DISTINCT app_name) as c FROM interception_results')?.c) ?? 0
  const interceptionsThisWeek  = (queryOne<{ c: number }>('SELECT COUNT(*) as c FROM interception_results WHERE timestamp >= ?', [weekStart])?.c) ?? 0
  const completedInterceptions = (queryOne<{ c: number }>("SELECT COUNT(*) as c FROM interception_results WHERE outcome = 'completed'")?.c) ?? 0
  const totalInterceptions     = (queryOne<{ c: number }>('SELECT COUNT(*) as c FROM interception_results')?.c) ?? 0

  // Top apps = most intercepted (any outcome)
  const topApps = queryAll<{ name: string; count: number }>(`
    SELECT app_name as name, COUNT(*) as count
    FROM interception_results
    GROUP BY app_name
    ORDER BY count DESC
    LIMIT 10
  `)

  // Hourly launches today from interception_results
  const hourlyRows = queryAll<{ hour: number; count: number }>(`
    SELECT CAST(strftime('%H', datetime(timestamp, 'localtime')) AS INTEGER) as hour, COUNT(*) as count
    FROM interception_results
    WHERE timestamp >= ?
    GROUP BY hour
    ORDER BY hour
  `, [todayStart])

  const hourlyMap = new Map(hourlyRows.map(r => [r.hour, r.count]))
  const hourlyActivity = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    count: hourlyMap.get(i) ?? 0,
  }))

  // Daily interceptions graph = all interception results per day (last 30 days)
  const dailyRows = queryAll<{ date: string; count: number }>(`
    SELECT strftime('%Y-%m-%d', datetime(timestamp, 'localtime')) as date, COUNT(*) as count
    FROM interception_results
    WHERE timestamp >= ?
    GROUP BY date
    ORDER BY date
  `, [monthStart])

  return {
    launchedToday,
    uniqueAppsEver,
    interceptionsThisWeek,
    completedInterceptions,
    totalInterceptions,
    topApps,
    hourlyActivity,
    dailyInterceptions: dailyRows,
  }
}

export function clearLogs(): void {
  db.run('DELETE FROM intention_logs')
  persist()
}

export function clearActivity(): void {
  if (!db) return
  db.run('DELETE FROM app_activity')
  db.run('DELETE FROM app_usage')
  db.run('DELETE FROM daily_screen_time')
  persist()
}

export function clearAll(): void {
  if (!db) return
  db.run('DELETE FROM intention_logs')
  db.run('DELETE FROM app_activity')
  db.run('DELETE FROM interception_results')
  db.run('DELETE FROM app_usage')
  db.run('DELETE FROM daily_screen_time')
  persist()
}

// ── App Usage (Activity tracking) ───────────────────────────────────────────
const lastAccumulationByApp = new Map<string, number>()

/** Set to true whenever any app is accumulated; reset by tickDailyScreenTime(). */
let anyAppActive = false

export function accumulateUsage(appName: string): void {
  const now = Date.now()
  const key = appName.toLowerCase()
  const lastTime = lastAccumulationByApp.get(key) || 0
  // Use 55s dedup so periodic 60s timer ticks are never dropped due to drift
  if (now - lastTime < 55_000) return
  lastAccumulationByApp.set(key, now)

  // Signal that at least one app was active in this 60s window
  anyAppActive = true

  // Use local date (not UTC) so it matches the user's calendar day,
  // consistent with tickDailyScreenTime().
  const today = new Date().toLocaleDateString('en-CA')
  // Also write directly to app_usage so the Activity list shows apps immediately
  // (not waiting for the 5-minute flush cycle)
  db.run(
    `INSERT INTO app_usage (app_name, date, seconds) VALUES (?, ?, 60)
     ON CONFLICT(app_name, date) DO UPDATE SET seconds = seconds + 60`,
    [key, today]
  )
persist()
}


// ─── Wall-clock daily screen time (independent of per-app accumulation) ──────
// daily_screen_time tracks *wall-clock* minutes: at most +60 s per real minute
// when at least one app was active.  This avoids inflating totals when N apps
// are open concurrently.

let dailyScreenTimeTimer: ReturnType<typeof setInterval> | null = null

function tickDailyScreenTime(): void {
  if (!anyAppActive) return          // idle — don't count
  anyAppActive = false               // consume the flag

  // Use local date (not UTC) so it matches the user's calendar day.
  // toLocaleDateString('en-CA') yields YYYY-MM-DD in local time.
  const today = new Date().toLocaleDateString('en-CA')
  db.run(
    `INSERT INTO daily_screen_time (date, seconds) VALUES (?, 60)
     ON CONFLICT(date) DO UPDATE SET seconds = seconds + 60`,
    [today]
  )
}

export function startDailyScreenTimeTimer(): void {
  if (dailyScreenTimeTimer) return
  dailyScreenTimeTimer = setInterval(tickDailyScreenTime, 60_000)
}

export function stopDailyScreenTimeTimer(): void {
  tickDailyScreenTime()              // final tick
  if (dailyScreenTimeTimer) {
    clearInterval(dailyScreenTimeTimer)
    dailyScreenTimeTimer = null
  }
}


export function getActivityData(hiddenApps: string[] = []): { apps: { app_name: string; total_seconds: number }[]; dailyUsage: { date: string; total_seconds: number }[] } {
  if (!db) return { apps: [], dailyUsage: [] }

  const now = new Date()
  const thirtyDaysAgoDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30)
  const thirtyDaysAgo = thirtyDaysAgoDate.toLocaleDateString('en-CA')

  // Build a normalized set of hidden app names for filtering
  const hiddenSet = new Set(hiddenApps.map(h => h.toLowerCase().replace(/\.exe$/i, '')))

  const allApps = queryAll<{ app_name: string; total_seconds: number }>(
    `SELECT REPLACE(app_name, '.exe', '') as app_name, SUM(seconds) as total_seconds
     FROM app_usage
     WHERE date >= ?
       AND app_name NOT LIKE '%.tmp%'
       AND app_name NOT LIKE '%.temp%'
       AND app_name NOT LIKE '~%'
     GROUP BY REPLACE(app_name, '.exe', '')
     ORDER BY total_seconds DESC`,
    [thirtyDaysAgo]
  )

  // Filter out hidden apps
  const apps = allApps.filter(a => !hiddenSet.has(a.app_name.toLowerCase()))

  const dailyUsage = queryAll<{ date: string; total_seconds: number }>(
    `SELECT date, seconds as total_seconds
     FROM daily_screen_time
     WHERE date >= ?
     ORDER BY date`,
    [thirtyDaysAgo]
  )

  return { apps, dailyUsage }
}

// ── Icon lookup cache ────────────────────────────────────────────────────────
const iconCache = new Map<string, string>() // app_name → data URL

// Common install paths for apps that may not be running when icon is requested
const COMMON_EXE_PATHS: Record<string, string[]> = {
  git: [
    'C:\\Program Files\\Git\\cmd\\git.exe',
    'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
  ],
  postgres: [
    'C:\\Program Files\\PostgreSQL\\17\\bin\\postgres.exe',
    'C:\\Program Files\\PostgreSQL\\16\\bin\\postgres.exe',
    'C:\\Program Files\\PostgreSQL\\15\\bin\\postgres.exe',
    'C:\\Program Files\\PostgreSQL\\14\\bin\\postgres.exe',
  ],
  psql: [
    'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe',
    'C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe',
    'C:\\Program Files\\PostgreSQL\\15\\bin\\psql.exe',
    'C:\\Program Files\\PostgreSQL\\14\\bin\\psql.exe',
  ],
  code: [
    'C:\\Users\\' + (process.env.USERNAME) + '\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe',
  ],
  chrome: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ],
  firefox: [
    'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
    'C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe',
  ],
  node: [
    'C:\\Program Files\\nodejs\\node.exe',
  ],
}

async function tryGetIconFromPath(exePath: string): Promise<string> {
  try {
    const icon = await app.getFileIcon(exePath, { size: 'normal' })
    const dataUrl = icon.toDataURL()
    return dataUrl
  } catch {
    return ''
  }
}

export async function getAppIcon(appName: string): Promise<string> {
  const key = appName.toLowerCase().replace(/\.exe$/i, '')
  if (iconCache.has(key)) return iconCache.get(key)!

  return new Promise((resolve) => {
    // Step 1: Try Get-Process to find running process path
    const cmd = `powershell -NoProfile -Command "try { $p = Get-Process -Name '${key}' -ErrorAction Stop | Where-Object { $_.Path } | Select-Object -First 1 -ExpandProperty Path; if($p){ $p } else { '' } } catch { '' }"`
    exec(cmd, { timeout: 5000 }, async (err, stdout) => {
      const exePath = stdout?.trim()
      if (exePath && exePath !== '' && !err) {
        try {
          const icon = await app.getFileIcon(exePath, { size: 'normal' })
          const dataUrl = icon.toDataURL()
          iconCache.set(key, dataUrl)
          resolve(dataUrl)
          return
        } catch { /* fall through to fallback */ }
      }

      // Step 2: Try common install paths
      const commonPaths = COMMON_EXE_PATHS[key]
      if (commonPaths) {
        for (const p of commonPaths) {
          if (fs.existsSync(p)) {
            try {
              const icon = await app.getFileIcon(p, { size: 'normal' })
              const dataUrl = icon.toDataURL()
              if (dataUrl && dataUrl !== 'data:;base64,') {
                iconCache.set(key, dataUrl)
                resolve(dataUrl)
                return
              }
            } catch { /* try next path */ }
          }
        }
      }

      // Step 3: Try where.exe to locate the executable
      const whereCmd = `where.exe ${key} 2>nul`
      exec(whereCmd, { timeout: 3000 }, async (_whereErr, whereStdout) => {
        const wherePath = whereStdout?.trim().split('\n')[0]?.trim()
        if (wherePath && wherePath !== '' && fs.existsSync(wherePath)) {
          try {
            const icon = await app.getFileIcon(wherePath, { size: 'normal' })
            const dataUrl = icon.toDataURL()
            if (dataUrl && dataUrl !== 'data:;base64,') {
              iconCache.set(key, dataUrl)
              resolve(dataUrl)
              return
            }
          } catch { /* fall through */ }
        }

        iconCache.set(key, '')
        resolve('')
      })
    })
  })
}

export async function getAppIcons(appNames: string[]): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  const uniqueNames = [...new Set(appNames.map(n => n.toLowerCase().replace(/\.exe$/i, '')))]

  const batchSize = 5
  for (let i = 0; i < uniqueNames.length; i += batchSize) {
    const batch = uniqueNames.slice(i, i + batchSize)
    const icons = await Promise.all(batch.map(name => getAppIcon(name)))
    batch.forEach((name, idx) => {
      result[name] = icons[idx]
    })
  }
  return result
}

export function exportCsv(): string {
  const rows = queryAll<IntentionLog>('SELECT * FROM intention_logs ORDER BY timestamp DESC')
  const header = 'id,timestamp,app_name,exe_path,purpose,word_count,resumed\n'
  const body = rows.map(r =>
    [r.id, r.timestamp, `"${r.app_name}"`, `"${r.exe_path}"`, `"${r.purpose.replace(/"/g, '""')}"`, r.word_count, r.resumed].join(',')
  ).join('\n')
  return header + body
}

export function getActivityForDate(date: string, hiddenApps: string[]): { app_name: string; total_seconds: number }[] {
  if (!db) return []
  const hidden = hiddenApps.map(h => h.toLowerCase())
  const rows = queryAll<{ app_name: string; total_seconds: number }>(
    `SELECT app_name, seconds as total_seconds
     FROM app_usage
     WHERE date = ? AND seconds > 0
       AND app_name NOT LIKE '%.tmp%'
       AND app_name NOT LIKE '%.temp%'
       AND app_name NOT LIKE '~%'
     ORDER BY seconds DESC`,
    [date]
  )
  
  return rows
    .filter(r => !hidden.includes(r.app_name.toLowerCase()))
    .map(r => ({
      app_name: r.app_name.replace(/\.exe$/i, ''),
      total_seconds: r.total_seconds
    }))
}

export function hasActivityForDate(date: string): boolean {
  if (!db) return false
  const row = queryOne<{ '1': number }>(
    `SELECT 1 FROM app_usage WHERE date = ? AND seconds > 0 LIMIT 1`,
    [date]
  )
  return !!row
}