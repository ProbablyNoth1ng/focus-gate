export function formatTimelineBlockDuration(durationMilliseconds: number): string {
  const totalSeconds = Math.ceil(durationMilliseconds / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

export function formatTimelineBlockTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

interface TimelineSegmentGeometryInput {
  startTimestamp: number
  endTimestamp: number
  nextStartTimestamp?: number
  timelineStart: number
  timelineEnd: number
  renderedWidth: number
}

export function getTimelineSegmentGeometry(input: TimelineSegmentGeometryInput) {
  const duration = input.timelineEnd - input.timelineStart
  const widthPercent = ((input.endTimestamp - input.startTimestamp) / duration) * 100
  const widthPixels = (input.endTimestamp - input.startTimestamp) / duration * input.renderedWidth
  const gapPixels = input.nextStartTimestamp === undefined
    ? Infinity
    : (input.nextStartTimestamp - input.endTimestamp) / duration * input.renderedWidth
  return {
    leftPercent: ((input.startTimestamp - input.timelineStart) / duration) * 100,
    widthPercent,
    isSubpixel: widthPixels < 1,
    hasNarrowGapAfter: gapPixels > 0 && gapPixels < 1,
  }
}
