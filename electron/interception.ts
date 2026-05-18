import { exec } from 'child_process'
import { shell } from 'electron'
import path from 'path'
import { promisify } from 'util'

const execAsync = promisify(exec)

interface SuspendedProcess {
  pid: number
  exePath: string
  suspended: boolean
}

const suspendedProcesses = new Map<string, SuspendedProcess>()

// Exe names currently approved — keyed by exe name (e.g. "telegram.exe").
// Cooldown lasts until ALL processes with that exe name have exited.
const approvedExeNames = new Set<string>()
const exeWatchIntervals = new Map<string, ReturnType<typeof setInterval>>()

export function isExeOnCooldown(exeName: string): boolean {
  return approvedExeNames.has(exeName.toLowerCase())
}

export function setExeCooldown(exeName: string): void {
  const key = exeName.toLowerCase()
  if (approvedExeNames.has(key)) return  // already watching

  approvedExeNames.add(key)
  console.log(`[${new Date().toLocaleTimeString()}] [COOLDOWN] Approved ${exeName} — will re-intercept only after it fully closes`)

  // Poll every 3s — clear approval once no process with this exe name is running
  const interval = setInterval(() => {
    exec(`tasklist /FI "IMAGENAME eq ${exeName}" /NH`, (_err, stdout) => {
      const running = stdout.toLowerCase().includes(key)
      if (!running) {
        approvedExeNames.delete(key)
        clearInterval(interval)
        exeWatchIntervals.delete(key)
        console.log(`[${new Date().toLocaleTimeString()}] [COOLDOWN] ${exeName} fully closed — will intercept on next open`)
      }
    })
  }, 3_000)

  exeWatchIntervals.set(key, interval)
}

function getPsSuspendPath(resourcesPath: string): string {
  return path.join(resourcesPath, 'pssuspend.exe')
}

export async function suspendProcess(
  pid: number,
  exePath: string,
  resourcesPath: string
): Promise<boolean> {
  try {
    const psSuspend = getPsSuspendPath(resourcesPath)
    await execAsync(`"${psSuspend}" -accepteula ${pid}`)
    suspendedProcesses.set(exePath.toLowerCase(), { pid, exePath, suspended: true })
    console.log(`[${new Date().toLocaleTimeString()}] [SUSPEND] pid=${pid} exe=${exePath}`)
    return true
  } catch (err) {
    console.error(`[${new Date().toLocaleTimeString()}] [SUSPEND FAILED] killing pid=${pid}:`, err)
    try {
      await execAsync(`taskkill /PID ${pid} /F`)
    } catch {
      // Process may have already exited
    }
    suspendedProcesses.set(exePath.toLowerCase(), { pid, exePath, suspended: false })
    return false
  }
}

export async function resumeProcess(
  exePath: string,
  resourcesPath: string
): Promise<void> {
  const proc = suspendedProcesses.get(exePath.toLowerCase())
  if (!proc) {
    await shell.openPath(exePath)
    return
  }

  if (proc.suspended) {
    try {
      const psSuspend = getPsSuspendPath(resourcesPath)
      await execAsync(`"${psSuspend}" -accepteula -r ${proc.pid}`)
      console.log(`[${new Date().toLocaleTimeString()}] [RESUME] pid=${proc.pid} exe=${exePath}`)
    } catch {
      // PID died while suspended (app self-respawned, e.g. Discord updater) — already running
      console.log(`[${new Date().toLocaleTimeString()}] [RESUME] pid=${proc.pid} already gone (self-respawned), skipping relaunch`)
    }
  } else {
    // Was killed — relaunch only if not already running
    exec(`tasklist /FI "IMAGENAME eq ${path.basename(exePath)}" /NH`, (_err, stdout) => {
      if (!stdout.toLowerCase().includes(path.basename(exePath).toLowerCase())) {
        shell.openPath(exePath)
      }
    })
  }

  suspendedProcesses.delete(exePath.toLowerCase())
}

export function cancelInterception(exePath: string): void {
  const proc = suspendedProcesses.get(exePath.toLowerCase())
  if (proc) {
    try {
      exec(`taskkill /PID ${proc.pid} /F`)
    } catch {
      // Ignore
    }
    suspendedProcesses.delete(exePath.toLowerCase())
  }
}
