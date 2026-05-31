import path from 'path'
import fs from 'fs'
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

    CREATE INDEX IF NOT EXISTS idx_activity_timestamp   ON app_activity(timestamp);
    CREATE INDEX IF NOT EXISTS idx_activity_name        ON app_activity(app_name);
    CREATE INDEX IF NOT EXISTS idx_logs_timestamp       ON intention_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_results_timestamp    ON interception_results(timestamp);
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
  db.run('DELETE FROM app_activity')
  persist()
}

export function clearAll(): void {
  db.run('DELETE FROM intention_logs')
  db.run('DELETE FROM app_activity')
  db.run('DELETE FROM interception_results')
  persist()
}

export function exportCsv(): string {
  const rows = queryAll<IntentionLog>('SELECT * FROM intention_logs ORDER BY timestamp DESC')
  const header = 'id,timestamp,app_name,exe_path,purpose,word_count,resumed\n'
  const body = rows.map(r =>
    [r.id, r.timestamp, `"${r.app_name}"`, `"${r.exe_path}"`, `"${r.purpose.replace(/"/g, '""')}"`, r.word_count, r.resumed].join(',')
  ).join('\n')
  return header + body
}