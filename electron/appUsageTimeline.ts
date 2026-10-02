export type TimelineMode = 'foreground' | 'audio'
export type TimelineSource = 'sampler' | 'fallback'

export interface TimelineSpan {
  app_name: string
  start_timestamp: number
  end_timestamp: number
  mode: TimelineMode
  source: TimelineSource
  website_key: string | null
  page_key: string | null
}

export interface DatedTimelinePiece {
  date: string
  start_timestamp: number
  end_timestamp: number
}

const TIMELINE_JOIN_GAP_MS = 60_000

function mergeCompatibleSpans(spans: TimelineSpan[]): TimelineSpan[] {
  const result: TimelineSpan[] = []
  for (const span of spans) {
    const previous = result[result.length - 1]
    if (previous && span.start_timestamp - previous.end_timestamp < TIMELINE_JOIN_GAP_MS) {
      previous.end_timestamp = Math.max(previous.end_timestamp, span.end_timestamp)
    } else {
      result.push({ ...span })
    }
  }
  return result
}

/** Splits an interval using real local-day boundaries, including DST transitions. */
export function splitSpanByLocalDate(span: Pick<TimelineSpan, 'start_timestamp' | 'end_timestamp'>): DatedTimelinePiece[] {
  if (!Number.isFinite(span.start_timestamp) || !Number.isFinite(span.end_timestamp) || span.end_timestamp <= span.start_timestamp) return []
  const pieces: DatedTimelinePiece[] = []
  let start = span.start_timestamp
  while (start < span.end_timestamp) {
    const local = new Date(start)
    const nextMidnight = new Date(local.getFullYear(), local.getMonth(), local.getDate() + 1).getTime()
    const end = Math.min(span.end_timestamp, nextMidnight)
    pieces.push({ date: local.toLocaleDateString('en-CA'), start_timestamp: start, end_timestamp: end })
    start = end
  }
  return pieces
}

/** Returns display spans per app, merging same-mode/source spans separated by less than one minute. */
export function normalizeTimelineSpans(spans: TimelineSpan[]): Map<string, TimelineSpan[]> {
  const byApp = new Map<string, TimelineSpan[]>()
  for (const span of spans) {
    if (!Number.isFinite(span.start_timestamp) || !Number.isFinite(span.end_timestamp) || span.end_timestamp <= span.start_timestamp) continue
    const app = span.app_name.toLowerCase().replace(/\.exe$/i, '')
    const existing = byApp.get(app) ?? []
    existing.push({ ...span, app_name: app })
    byApp.set(app, existing)
  }

  for (const [app, appSpans] of byApp) {
    const compatibleGroups = new Map<string, TimelineSpan[]>()
    for (const span of appSpans) {
      const key = `${span.mode}:${span.source}`
      const group = compatibleGroups.get(key) ?? []
      group.push(span)
      compatibleGroups.set(key, group)
    }
    const merged = [...compatibleGroups.values()].flatMap(group => {
      group.sort((left, right) => left.start_timestamp - right.start_timestamp || left.end_timestamp - right.end_timestamp)
      return mergeCompatibleSpans(group)
    })
    merged.sort((left, right) => left.start_timestamp - right.start_timestamp || left.end_timestamp - right.end_timestamp || left.mode.localeCompare(right.mode) || left.source.localeCompare(right.source))
    byApp.set(app, merged)
  }
  return byApp
}

/** Counts the union of all recorded spans for one app, so foreground/audio overlap is counted once. */
export function observedTimelineDurationSeconds(spans: TimelineSpan[]): number {
  let milliseconds = 0
  const ordered = [...spans]
    .filter(span => Number.isFinite(span.start_timestamp) && Number.isFinite(span.end_timestamp) && span.end_timestamp > span.start_timestamp)
    .sort((left, right) => left.start_timestamp - right.start_timestamp || left.end_timestamp - right.end_timestamp)
  let end = -Infinity
  for (const span of ordered) {
    milliseconds += Math.max(0, span.end_timestamp - Math.max(span.start_timestamp, end))
    end = Math.max(end, span.end_timestamp)
  }
  return milliseconds / 1000
}

export function timelineDurationSeconds(spans: TimelineSpan[]): number {
  return observedTimelineDurationSeconds(spans)
}
