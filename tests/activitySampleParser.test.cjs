const assert = require('node:assert/strict')
const test = require('node:test')

const {
  __parseActivitySample,
} = require('../dist/electron/processMonitor.js')

test('parses valid audible Chrome tab observations', () => {
  const sample = __parseActivitySample(JSON.stringify({
    timestamp: '2026-09-19T10:00:00.000Z',
    foreground: { pid: 10, name: 'chrome' },
    idleMs: 100,
    mediaApps: [{ pid: 10, name: 'chrome' }],
    chromeTab: { title: 'Docs - Google Chrome', url: 'https://docs.example', privacyMode: 'normal' },
    chromeAudibleTabs: [
      {
        title: 'Music - Example - Audio playing - Google Chrome',
        url: '',
        privacyMode: 'normal',
        windowId: '1234',
        isSelected: false,
      },
    ],
  }))

  assert.equal(sample.foreground.name, 'chrome.exe')
  assert.deepEqual(sample.chromeAudibleTabs, [
    {
      title: 'Music - Example - Audio playing - Google Chrome',
      url: '',
      privacyMode: 'normal',
      windowId: '1234',
      isSelected: false,
    },
  ])
})

test('defaults missing audible Chrome tabs to an empty array', () => {
  const sample = __parseActivitySample(JSON.stringify({
    timestamp: '2026-09-19T10:00:00.000Z',
    foreground: null,
    idleMs: 100,
    mediaApps: [],
    chromeTab: null,
  }))

  assert.deepEqual(sample.chromeAudibleTabs, [])
})

test('discards malformed audible Chrome tab entries independently', () => {
  const sample = __parseActivitySample(JSON.stringify({
    timestamp: '2026-09-19T10:00:00.000Z',
    foreground: null,
    idleMs: 100,
    mediaApps: [],
    chromeTab: null,
    chromeAudibleTabs: [
      {
        title: 'Valid - Site - Audio playing - Google Chrome',
        url: '',
        privacyMode: 'normal',
        windowId: '100',
        isSelected: true,
      },
      {
        title: 'Missing selected state',
        url: '',
        privacyMode: 'normal',
        windowId: '101',
      },
      {
        title: 'Bad privacy',
        url: '',
        privacyMode: 'private',
        windowId: '102',
        isSelected: false,
      },
      null,
    ],
  }))

  assert.deepEqual(sample.chromeAudibleTabs, [
    {
      title: 'Valid - Site - Audio playing - Google Chrome',
      url: '',
      privacyMode: 'normal',
      windowId: '100',
      isSelected: true,
    },
  ])
})

test('rejects malformed activity samples while keeping compatibility for malformed audible arrays', () => {
  assert.equal(__parseActivitySample('not json'), null)
  assert.equal(__parseActivitySample(JSON.stringify({
    timestamp: '2026-09-19T10:00:00.000Z',
    foreground: null,
    idleMs: '100',
    mediaApps: [],
    chromeTab: null,
    chromeAudibleTabs: [],
  })), null)

  const sample = __parseActivitySample(JSON.stringify({
    timestamp: '2026-09-19T10:00:00.000Z',
    foreground: null,
    idleMs: 100,
    mediaApps: [],
    chromeTab: null,
    chromeAudibleTabs: 'bad shape',
  }))
  assert.deepEqual(sample.chromeAudibleTabs, [])
})
