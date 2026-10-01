const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { buildSync } = require('esbuild')

const filename = path.join(__dirname, '../src/components/activityTimelineFormat.ts')
const source = fs.readFileSync(filename, 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const formatModule = new Module(filename, module)
formatModule._compile(compiled, filename)
const { formatTimelineBlockDuration, formatTimelineBlockTime, getTimelineSegmentGeometry } = formatModule.exports

test('block durations retain seconds, including short and exact-minute intervals', () => {
  for (const [seconds, expected] of [
    [2, '2s'],
    [29, '29s'],
    [30, '30s'],
    [60, '1m 0s'],
    [960, '16m 0s'],
  ]) {
    assert.equal(formatTimelineBlockDuration(seconds * 1000), expected)
  }
  assert.equal(formatTimelineBlockDuration(1), '1s')
})

test('block endpoints include seconds', () => {
  const start = new Date(2026, 8, 19, 12, 34, 0).getTime()
  const end = start + 2000
  assert.notEqual(formatTimelineBlockTime(start), formatTimelineBlockTime(end))
  assert.match(formatTimelineBlockTime(start), /:\d{2}:\d{2}/)
})

test('geometry preserves actual widths and identifies subpixel spans and narrow gaps', () => {
  const geometry = getTimelineSegmentGeometry({
    startTimestamp: 0,
    endTimestamp: 30_000,
    timelineStart: 0,
    timelineEnd: 24 * 60 * 60 * 1000,
    renderedWidth: 600,
  })
  assert.equal(geometry.leftPercent, 0)
  assert.equal(geometry.widthPercent, 30_000 / (24 * 60 * 60 * 1000) * 100)
  assert.equal(geometry.isSubpixel, true)
  assert.equal(geometry.hasNarrowGapAfter, false)

  const oneMinute = getTimelineSegmentGeometry({
    startTimestamp: 0,
    endTimestamp: 60_000,
    timelineStart: 0,
    timelineEnd: 24 * 60 * 60 * 1000,
    renderedWidth: 600,
  })
  assert.equal(oneMinute.widthPercent, geometry.widthPercent * 2)

  const withGap = getTimelineSegmentGeometry({
    startTimestamp: 0,
    endTimestamp: 30_000,
    nextStartTimestamp: 30_100,
    timelineStart: 0,
    timelineEnd: 24 * 60 * 60 * 1000,
    renderedWidth: 600,
  })
  assert.equal(withGap.hasNarrowGapAfter, true)
})

test('a 16-minute row labels each shorter block with its own duration', () => {
  const componentFile = path.join(__dirname, '../src/components/ActivityTimeline.tsx')
  const { outputFiles } = buildSync({
    entryPoints: [componentFile],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    external: ['react', 'react/jsx-runtime', 'react-icons/io5'],
  })
  const componentModule = new Module(componentFile, module)
  componentModule.filename = componentFile
  componentModule.paths = Module._nodeModulePaths(path.dirname(componentFile))
  componentModule._compile(outputFiles[0].text, componentFile)

  const start = new Date(2026, 8, 19, 12, 0, 0).getTime()
  const durations = [2, 29, 30, 899]
  const segments = durations.map((seconds, index) => ({
    start_timestamp: start + index * 60_000,
    end_timestamp: start + index * 60_000 + seconds * 1000,
    mode: 'foreground',
    source: 'sampler',
  }))
  const markup = renderToStaticMarkup(React.createElement(componentModule.exports.ActivityTimeline, {
    timeline: { start_timestamp: start, end_timestamp: start + 24 * 60 * 60 * 1000, rows: [{ app_name: 'Example', total_seconds: 960, recorded_seconds: 960, segments }] },
    icons: {},
    selectedDate: '2026-09-19',
    loading: false,
    error: false,
  }))

  assert.match(markup, />16m 0s<\/span>/)
  const blockLabels = [...markup.matchAll(/<button[^>]*aria-label="([^"]+)" title="([^"]+)"/g)]
  assert.equal(blockLabels.length, 4)
  for (const [index, [, accessibleLabel, title]] of blockLabels.entries()) {
    assert.equal(accessibleLabel, title)
    assert.ok(accessibleLabel.includes(formatTimelineBlockDuration(durations[index] * 1000)))
  }
})
