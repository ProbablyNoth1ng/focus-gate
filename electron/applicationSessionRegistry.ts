import { debugLog } from './debugLog'

export type ApplicationSessionSource = 'approved' | 'pre-existing'

interface ApplicationSession {
  source: ApplicationSessionSource
  pids: Set<number>
}

type IsPidAlive = (pid: number) => boolean
type SessionLogger = (message: string) => void

function normalizeSessionExeName(exeName: string): string {
  const basename = exeName.trim().split(/[\\/]/).pop()?.toLowerCase() ?? ''
  if (!basename) return ''
  return basename.endsWith('.exe') ? basename : `${basename}.exe`
}

export class ApplicationSessionRegistry {
  private readonly sessions = new Map<string, ApplicationSession>()

  constructor(
    private readonly isPidAlive: IsPidAlive,
    private readonly log: SessionLogger = () => undefined
  ) {}

  startSession(
    exeName: string,
    pids: Iterable<number>,
    source: ApplicationSessionSource
  ): void {
    const key = normalizeSessionExeName(exeName)
    if (!key) return

    const existing = this.pruneSession(key)
    const trackedPids = existing?.pids ?? new Set<number>()
    for (const pid of pids) {
      if (Number.isInteger(pid) && pid > 0) trackedPids.add(pid)
    }
    if (trackedPids.size === 0) return

    const effectiveSource = existing?.source === 'approved' || source === 'approved'
      ? 'approved'
      : 'pre-existing'
    this.sessions.set(key, { source: effectiveSource, pids: trackedPids })
    this.log(`[APP SESSION START] exe=${key} source=${effectiveSource} pids=${[...trackedPids].join(',')}`)
  }

  claimIfActive(exeName: string, candidatePid: number): ApplicationSessionSource | null {
    const key = normalizeSessionExeName(exeName)
    if (!key) return null

    const session = this.pruneSession(key)
    if (!session) return null

    const wasTracked = session.pids.has(candidatePid)
    session.pids.add(candidatePid)
    if (!wasTracked) {
      this.log(`[APP SESSION JOIN] exe=${key} source=${session.source} pid=${candidatePid} total=${session.pids.size}`)
    }
    return session.source
  }

  recordProcessStart(pid: number): void {
    for (const [key, session] of this.sessions) {
      if (session.source !== 'pre-existing' || !session.pids.delete(pid)) continue
      this.pruneSession(key)
    }
  }

  pruneAll(): void {
    for (const key of [...this.sessions.keys()]) {
      this.pruneSession(key)
    }
  }

  clear(): void {
    this.sessions.clear()
  }

  private pruneSession(key: string): ApplicationSession | null {
    const session = this.sessions.get(key)
    if (!session) return null

    for (const pid of session.pids) {
      if (!this.isPidAlive(pid)) session.pids.delete(pid)
    }

    if (session.pids.size > 0) return session

    this.sessions.delete(key)
    this.log(`[APP SESSION CLOSED] exe=${key} source=${session.source}`)
    return null
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function logSessionEvent(message: string): void {
  console.log(`[${new Date().toLocaleTimeString()}] ${message}`)
  debugLog(message)
}

export const applicationSessionRegistry = new ApplicationSessionRegistry(isProcessAlive, logSessionEvent)

let pruneTimer: ReturnType<typeof setInterval> | null = null

export function startApplicationSessionTracking(): void {
  if (pruneTimer) return
  pruneTimer = setInterval(() => applicationSessionRegistry.pruneAll(), 1_000)
  pruneTimer.unref?.()
}

export function stopApplicationSessionTracking(): void {
  if (pruneTimer) {
    clearInterval(pruneTimer)
    pruneTimer = null
  }
  applicationSessionRegistry.clear()
}
