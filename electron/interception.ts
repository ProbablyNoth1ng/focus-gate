import { exec, spawn } from 'child_process'
import { shell } from 'electron'
import path from 'path'
import { promisify } from 'util'
import { applicationSessionRegistry } from './applicationSessionRegistry'
import { getRunningPids } from './processMonitor'

const execAsync = promisify(exec)

interface SuspendedProcess {
  pid: number
  exePath: string
  suspended: boolean
}

const suspendedProcesses = new Map<string, SuspendedProcess>()

function getPsSuspendPath(resourcesPath: string): string {
  return path.join(resourcesPath, 'pssuspend.exe')
}

async function approveApplicationSession(exePath: string, initialPids: number[]): Promise<void> {
  const exeName = path.basename(exePath)
  applicationSessionRegistry.startSession(exeName, initialPids, 'approved')
  const runningPids = await getRunningPids(exeName)
  applicationSessionRegistry.startSession(exeName, runningPids, 'approved')
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
      // Process may have already exited.
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
    await approveApplicationSession(exePath, [proc.pid])
    try {
      const psSuspend = getPsSuspendPath(resourcesPath)
      await execAsync(`"${psSuspend}" -accepteula -r ${proc.pid}`)
      console.log(`[${new Date().toLocaleTimeString()}] [RESUME] pid=${proc.pid} exe=${exePath}`)
    } catch {
      console.log(`[${new Date().toLocaleTimeString()}] [RESUME] pid=${proc.pid} already gone, skipping relaunch`)
    }
  } else {
    try {
      const child = spawn(exePath, [], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      })
      await approveApplicationSession(exePath, child.pid ? [child.pid] : [])
      child.unref()
      console.log(`[${new Date().toLocaleTimeString()}] [RELAUNCH] pid=${child.pid ?? 'unknown'} exe=${exePath}`)
    } catch (err) {
      console.error(`[${new Date().toLocaleTimeString()}] [RELAUNCH FAILED] exe=${exePath}:`, err)
      await shell.openPath(exePath)
    }
  }

  suspendedProcesses.delete(exePath.toLowerCase())
}

export function cancelInterception(exePath: string): void {
  const proc = suspendedProcesses.get(exePath.toLowerCase())
  if (proc) {
    try {
      exec(`taskkill /PID ${proc.pid} /F`)
    } catch {
      // Ignore.
    }
    suspendedProcesses.delete(exePath.toLowerCase())
  }
}
