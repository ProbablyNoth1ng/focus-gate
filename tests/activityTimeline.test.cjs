const assert = require('node:assert/strict')
const test = require('node:test')

const { normalizeTimelineSpans, observedTimelineDurationSeconds, splitSpanByLocalDate } = require('../dist/electron/appUsageTimeline.js')

test('foreground and background audio remain separate while other apps stay independent', () => {
  const rows = normalizeTimelineSpans([
    { app_name: 'chrome', start_timestamp: 0, end_timestamp: 10_000, mode: 'audio', source: 'sampler', website_key: null, page_key: null },
    { app_name: 'chrome', start_timestamp: 2_000, end_timestamp: 8_000, mode: 'foreground', source: 'sampler', website_key: null, page_key: null },
    { app_name: 'spotify', start_timestamp: 2_000, end_timestamp: 8_000, mode: 'audio', source: 'sampler', website_key: null, page_key: null },
  ])

  assert.deepEqual(rows.get('chrome').map(({ start_timestamp, end_timestamp, mode }) => ({ start_timestamp, end_timestamp, mode })), [
    { start_timestamp: 0, end_timestamp: 10_000, mode: 'audio' },
    { start_timestamp: 2_000, end_timestamp: 8_000, mode: 'foreground' },
  ])
  assert.equal(rows.get('spotify')[0].mode, 'audio')
})

test('merges compatible spans across a gap shorter than one minute', () => {
  const rows = normalizeTimelineSpans([
    { app_name: 'code', start_timestamp: 0, end_timestamp: 5_000, mode: 'foreground', source: 'sampler', website_key: null, page_key: null },
    { app_name: 'code', start_timestamp: 5_001, end_timestamp: 10_000, mode: 'foreground', source: 'sampler', website_key: null, page_key: null },
    { app_name: 'code', start_timestamp: 10_000, end_timestamp: 12_000, mode: 'foreground', source: 'sampler', website_key: null, page_key: null },
  ])
  assert.equal(rows.get('code').length, 1)
  assert.deepEqual(rows.get('code').map(({ start_timestamp, end_timestamp }) => ({ start_timestamp, end_timestamp })), [
    { start_timestamp: 0, end_timestamp: 12_000 },
  ])
})

test('merges compatible spans across interleaved modes without hiding a source transition', () => {
  const rows = normalizeTimelineSpans([
    { app_name: 'chrome', start_timestamp: 0, end_timestamp: 2_150, mode: 'audio', source: 'sampler', website_key: 'host:one.example', page_key: 'url:one' },
    { app_name: 'code', start_timestamp: 2_200, end_timestamp: 3_000, mode: 'foreground', source: 'sampler', website_key: null, page_key: null },
    { app_name: 'chrome', start_timestamp: 2_300, end_timestamp: 4_450, mode: 'audio', source: 'sampler', website_key: 'host:two.example', page_key: 'url:two' },
    { app_name: 'chrome', start_timestamp: 4_450, end_timestamp: 5_000, mode: 'audio', source: 'fallback', website_key: 'host:two.example', page_key: 'url:two' },
  ])

  assert.deepEqual(rows.get('chrome').map(({ start_timestamp, end_timestamp, mode }) => ({ start_timestamp, end_timestamp, mode })), [
    { start_timestamp: 0, end_timestamp: 4_450, mode: 'audio' },
    { start_timestamp: 4_450, end_timestamp: 5_000, mode: 'audio' },
  ])
})

test('counts foreground and audio overlap once for a row total', () => {
  const seconds = observedTimelineDurationSeconds([
    { app_name: 'chrome', start_timestamp: 0, end_timestamp: 10_000, mode: 'audio', source: 'sampler', website_key: null, page_key: null },
    { app_name: 'chrome', start_timestamp: 2_000, end_timestamp: 8_000, mode: 'foreground', source: 'sampler', website_key: null, page_key: null },
  ])
  assert.equal(seconds, 10)
})

test('keeps the exact one-minute boundary and mode changes as separate segments', () => {
  const rows = normalizeTimelineSpans([
    { app_name: 'chrome', start_timestamp: 0, end_timestamp: 2_000, mode: 'foreground', source: 'sampler', website_key: 'host:one.example', page_key: 'url:one' },
    { app_name: 'chrome', start_timestamp: 62_000, end_timestamp: 64_000, mode: 'foreground', source: 'sampler', website_key: 'host:two.example', page_key: 'url:two' },
    { app_name: 'chrome', start_timestamp: 64_000, end_timestamp: 66_000, mode: 'audio', source: 'sampler', website_key: 'host:two.example', page_key: 'url:two' },
  ])

  assert.deepEqual(rows.get('chrome').map(({ start_timestamp, end_timestamp, mode }) => ({ start_timestamp, end_timestamp, mode })), [
    { start_timestamp: 0, end_timestamp: 2_000, mode: 'foreground' },
    { start_timestamp: 62_000, end_timestamp: 64_000, mode: 'foreground' },
    { start_timestamp: 64_000, end_timestamp: 66_000, mode: 'audio' },
  ])
})

test('splits intervals at local midnight without changing UTC durations', () => {
  const start = new Date(2026, 8, 19, 23, 59, 58).getTime()
  const end = new Date(2026, 8, 20, 0, 0, 2).getTime()
  const pieces = splitSpanByLocalDate({ start_timestamp: start, end_timestamp: end })
  assert.equal(pieces.length, 2)
  assert.equal(pieces[0].date, '2026-09-19')
  assert.equal(pieces[1].date, '2026-09-20')
  assert.equal(pieces.reduce((total, piece) => total + piece.end_timestamp - piece.start_timestamp, 0), end - start)
})
