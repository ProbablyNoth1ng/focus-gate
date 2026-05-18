import { app } from 'electron'
import { execSync } from 'child_process'
import path from 'path'
import os from 'os'

const APP_NAME = 'FocusGate'
const STARTUP_DIR = path.join(
  os.homedir(),
  'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'
)
const SHORTCUT_PATH = path.join(STARTUP_DIR, `${APP_NAME}.lnk`)

export function setAutostart(enabled: boolean): void {
  const exePath = process.execPath

  try {
    if (enabled) {
      const ps = [
        `$ws = New-Object -ComObject WScript.Shell`,
        `$s = $ws.CreateShortcut('${SHORTCUT_PATH}')`,
        `$s.TargetPath = '${exePath}'`,
        `$s.Arguments = '--minimize-to-tray'`,
        `$s.WorkingDirectory = '${path.dirname(exePath)}'`,
        `$s.Save()`,
      ].join('; ')
      const encoded = Buffer.from(ps, 'utf16le').toString('base64')
      execSync(`powershell -EncodedCommand ${encoded}`)
      console.log(`[${new Date().toLocaleTimeString()}] [AUTOSTART] Shortcut created: ${SHORTCUT_PATH}`)
    } else {
      const ps = `Remove-Item -Path '${SHORTCUT_PATH}' -ErrorAction SilentlyContinue`
      const encoded = Buffer.from(ps, 'utf16le').toString('base64')
      execSync(`powershell -EncodedCommand ${encoded}`)
      console.log(`[${new Date().toLocaleTimeString()}] [AUTOSTART] Shortcut removed`)
    }
  } catch (err) {
    console.error('[AUTOSTART] Failed:', err)
  }
}

export function getAutostart(): boolean {
  try {
    const ps = `Test-Path '${SHORTCUT_PATH}'`
    const encoded = Buffer.from(ps, 'utf16le').toString('base64')
    const out = execSync(`powershell -EncodedCommand ${encoded}`, { encoding: 'utf8' }).trim()
    return out === 'True'
  } catch {
    return false
  }
}
