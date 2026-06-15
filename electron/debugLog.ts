import fs from 'fs'
import os from 'os'
import path from 'path'

function getLogPath(): string {
  const appData = process.env.APPDATA
  if (appData) {
    return path.join(appData, 'focusgate', 'focusgate-debug.log')
  }
  return path.join(os.tmpdir(), 'focusgate-debug.log')
}

export function debugLog(message: string): void {
  try {
    const logPath = getLogPath()
    fs.mkdirSync(path.dirname(logPath), { recursive: true })
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`, 'utf8')
  } catch {
    // Ignore logging failures.
  }
}

export function getDebugLogPath(): string {
  return getLogPath()
}
