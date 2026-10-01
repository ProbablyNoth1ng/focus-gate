import { useEffect, useMemo, useRef, useState } from 'react'
import { IoRefreshOutline } from 'react-icons/io5'
import type { ActivityForDateResult } from '../../shared/ipc-types'
import { formatTimelineBlockDuration, formatTimelineBlockTime, getTimelineSegmentGeometry } from './activityTimelineFormat'

interface ActivityTimelineProps {
  readonly timeline: ActivityForDateResult['timeline']
  readonly icons: Record<string, string>
  readonly selectedDate: string
  readonly loading: boolean
  readonly error: boolean
}

const ZOOM_HOURS = [24, 12, 6, 3, 1] as const

function formatDuration(seconds: number): string {
  return formatTimelineBlockDuration(seconds * 1000)
}

export function ActivityTimeline({ timeline, icons, selectedDate, loading, error }: ActivityTimelineProps) {
  const [zoomHours, setZoomHours] = useState<number>(24)
  const [tooltip, setTooltip] = useState<string | null>(null)
  const [renderedWidth, setRenderedWidth] = useState(0)
  const viewportRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const duration = timeline.end_timestamp - timeline.start_timestamp
  const visibleDuration = Math.min(duration, zoomHours * 60 * 60 * 1000)
  const contentWidth = zoomHours === 24
    ? 'calc(100% - 24px)'
    : `calc(${Math.ceil((duration / visibleDuration) * 100)}% - 24px)`

  useEffect(() => {
    setZoomHours(24)
    setTooltip(null)
    if (viewportRef.current) viewportRef.current.scrollLeft = 0
  }, [selectedDate])

  useEffect(() => {
    const element = contentRef.current
    if (!element) return
    const updateWidth = () => setRenderedWidth(element.clientWidth)
    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(element)
    return () => observer.disconnect()
  }, [zoomHours])

  const marks = useMemo(() => {
    const stepHours = zoomHours <= 3 ? 1 : zoomHours <= 6 ? 2 : zoomHours <= 12 ? 3 : 6
    const values: number[] = []
    for (let at = timeline.start_timestamp; at <= timeline.end_timestamp; at += stepHours * 60 * 60 * 1000) values.push(at)
    return values
  }, [timeline.start_timestamp, timeline.end_timestamp, zoomHours])

  const hasTimelineData = timeline.rows.some(row => row.segments.length > 0)

  if (loading && !hasTimelineData) return <TimelineCard>Loading timeline…</TimelineCard>
  if (error && !hasTimelineData) return <TimelineCard>Timeline could not be loaded.</TimelineCard>
  if (!hasTimelineData) {
    return <TimelineCard>No timeline recorded for this day</TimelineCard>
  }

  return (
    <TimelineCard>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div>
          <h3 style={headingStyle}>APP TIMELINE</h3>
          <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>
            <span><i style={{ ...legendStyle, background: 'var(--accent)' }} />Foreground</span>
            <span><i style={{ ...legendStyle, backgroundImage: 'repeating-linear-gradient(135deg, var(--accent) 0 3px, transparent 3px 6px)', border: '1px solid var(--accent)' }} />Background audio</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }} aria-label="Timeline zoom">
          {ZOOM_HOURS.map(hours => <button key={hours} onClick={() => { setZoomHours(hours); requestAnimationFrame(() => { if (viewportRef.current) viewportRef.current.scrollLeft = 0 }) }} style={zoomButtonStyle(zoomHours === hours)} title={`Show ${hours === 24 ? 'full day' : `${hours} hours`}`}>{hours === 24 ? 'Day' : `${hours}h`}</button>)}
          <button onClick={() => { setZoomHours(24); if (viewportRef.current) viewportRef.current.scrollLeft = 0 }} style={zoomButtonStyle(false)} title="Reset timeline zoom" aria-label="Reset timeline zoom"><IoRefreshOutline size={14} /></button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '154px minmax(0, 1fr)', borderTop: '1px solid var(--border)' }}>
        <div>
          <div style={{ boxSizing: 'border-box', height: 34, padding: '10px 10px 8px', fontSize: 11, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>APP</div>
          {timeline.rows.map(row => <TimelineLabel key={row.app_name} row={row} icons={icons} />)}
        </div>
        <div ref={viewportRef} className="timeline-viewport" style={{ overflowX: 'auto', overflowY: 'hidden' }}>
          <div ref={contentRef} style={{ width: contentWidth, minWidth: 'calc(100% - 24px)', margin: '0 12px' }}>
            <div style={{ boxSizing: 'border-box', height: 34, position: 'relative', borderBottom: '1px solid var(--border)', paddingTop: 9 }}>
              {marks.map(mark => {
                const ratio = (mark - timeline.start_timestamp) / duration
                return <span key={mark} style={{ position: 'absolute', left: `${ratio * 100}%`, transform: ratio === 0 ? 'translateX(0)' : ratio === 1 ? 'translateX(-100%)' : 'translateX(-50%)', top: 9, fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{new Date(mark).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZoneName: zoomHours <= 6 ? 'short' : undefined })}</span>
              })}
            </div>
            {timeline.rows.map(row => <TimelineSegments key={row.app_name} row={row} start={timeline.start_timestamp} end={timeline.end_timestamp} renderedWidth={renderedWidth} onTooltip={setTooltip} />)}
          </div>
        </div>
      </div>
      {tooltip && <div role="status" style={{ marginTop: 10, fontSize: 12, color: 'var(--text-secondary)' }}>{tooltip}</div>}
    </TimelineCard>
  )
}

function TimelineLabel({ row, icons }: { row: ActivityForDateResult['timeline']['rows'][number]; icons: Record<string, string> }) {
  const icon = icons[row.app_name]
  return <div style={{ height: 42, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)', overflow: 'hidden' }}>
      {icon ? <img src={icon} alt="" style={{ width: 20, height: 20, borderRadius: 4 }} /> : <span style={{ width: 20, height: 20, borderRadius: 4, background: 'var(--bg-active)', textAlign: 'center', lineHeight: '20px', fontSize: 10 }}>{row.app_name[0]?.toUpperCase()}</span>}
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>{row.app_name}</span>
      <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--accent-bright)', whiteSpace: 'nowrap' }} title={`Recorded ${formatDuration(row.total_seconds)}`}>{formatDuration(row.total_seconds)}</span>
    </div>
}

function TimelineSegments({ row, start, end, renderedWidth, onTooltip }: { row: ActivityForDateResult['timeline']['rows'][number]; start: number; end: number; renderedWidth: number; onTooltip: (value: string | null) => void }) {
  return <div style={{ height: 42, position: 'relative', borderBottom: '1px solid var(--border)', backgroundImage: 'linear-gradient(var(--border), var(--border)), linear-gradient(var(--border), var(--border)), linear-gradient(var(--border), var(--border))', backgroundPosition: '25% 0, 50% 0, 75% 0', backgroundRepeat: 'no-repeat', backgroundSize: '1px 100%' }}>
      {row.segments.map((segment, index) => {
        const label = `${row.app_name}: ${formatTimelineBlockTime(segment.start_timestamp)}–${formatTimelineBlockTime(segment.end_timestamp)} · ${formatTimelineBlockDuration(segment.end_timestamp - segment.start_timestamp)} · ${segment.mode === 'foreground' ? 'Foreground' : 'Background audio'}${segment.source === 'fallback' ? ' (estimated)' : ''}`
        const geometry = getTimelineSegmentGeometry({
          startTimestamp: segment.start_timestamp,
          endTimestamp: segment.end_timestamp,
          nextStartTimestamp: row.segments[index + 1]?.start_timestamp,
          timelineStart: start,
          timelineEnd: end,
          renderedWidth,
        })
        return <span key={`${segment.start_timestamp}-${index}`}>
          <button onFocus={() => onTooltip(label)} onBlur={() => onTooltip(null)} onMouseEnter={() => onTooltip(label)} onMouseLeave={() => onTooltip(null)} aria-label={label} title={label} style={{ position: 'absolute', left: `${geometry.leftPercent}%`, width: `${geometry.widthPercent}%`, minWidth: 0, top: 10, height: 21, padding: 0, border: segment.mode === 'audio' ? '1px solid var(--accent)' : 'none', borderRadius: 3, cursor: 'pointer', background: segment.mode === 'audio' ? 'repeating-linear-gradient(135deg, var(--accent) 0 3px, transparent 3px 6px)' : 'var(--accent)', opacity: segment.source === 'fallback' ? 0.62 : 1, overflow: 'visible' }}>
            {geometry.isSubpixel && <span aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, width: 1, height: '100%', background: 'var(--accent)' }} />}
          </button>
          {geometry.hasNarrowGapAfter && <span aria-label="Recorded gap too narrow to display at this zoom" title="Recorded gap too narrow to display at this zoom" style={{ position: 'absolute', left: `${((segment.end_timestamp - start) / (end - start)) * 100}%`, top: 8, height: 25, borderLeft: '1px solid var(--text-muted)', opacity: 0.8 }} />}
        </span>
      })}
    </div>
}

function TimelineCard({ children }: { children: React.ReactNode }) { return <section style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginTop: 20, color: 'var(--text-muted)', fontSize: 13 }}>{children}</section> }

const headingStyle = { fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.06em', margin: 0 }
const legendStyle = { display: 'inline-block', width: 10, height: 10, borderRadius: 2, marginRight: 4, verticalAlign: '-1px' }
const zoomButtonStyle = (active: boolean) => ({ border: '1px solid var(--border)', background: active ? 'var(--accent)' : 'var(--bg-elevated)', color: active ? 'white' : 'var(--text-secondary)', cursor: 'pointer', borderRadius: 4, minWidth: 30, height: 26, fontSize: 11, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' })
