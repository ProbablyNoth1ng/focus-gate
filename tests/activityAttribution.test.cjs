const assert = require('node:assert/strict')
const test = require('node:test')

const {
  getActivityAttribution,
} = require('../dist/electron/activityAttribution.js')

function sample(overrides = {}) {
  return {
    timestamp: '2026-09-19T10:00:05.000Z',
    foreground: { pid: 1, name: 'chrome.exe' },
    idleMs: 100,
    mediaApps: [
      { pid: 1, name: 'chrome.exe' },
      { pid: 2, name: 'spotify.exe' },
      { pid: 3, name: 'vlc.exe' },
    ],
    chromeTab: {
      title: 'Docs - Example - Google Chrome',
      url: 'https://docs.example/page',
      privacyMode: 'normal',
    },
    foregroundWindowId: '100',
    chromeAudibleTabs: [
      {
        title: 'Focus Mix - YouTube - Audio playing - Google Chrome',
        url: '',
        privacyMode: 'normal',
        windowId: '200',
        isSelected: false,
      },
    ],
    ...overrides,
  }
}

test('disabled background audio tracks only active foreground app and focused Chrome tab', () => {
  const attribution = getActivityAttribution(sample(), {
    trackBackgroundAudio: false,
    trackIncognitoTabs: false,
  })

  assert.deepEqual(attribution.appNames, ['chrome'])
  assert.ok(attribution.focusedChromeTab)
  assert.deepEqual(attribution.audibleChromeTabs, [])
  assert.equal(attribution.countDailyScreenTime, true)
})

test('enabled background audio includes audio apps and audible Chrome tabs without duplicating focused app', () => {
  const attribution = getActivityAttribution(sample(), {
    trackBackgroundAudio: true,
    trackIncognitoTabs: false,
  })

  assert.deepEqual(attribution.appNames, ['chrome', 'spotify', 'vlc'])
  assert.ok(attribution.focusedChromeTab)
  assert.deepEqual(attribution.audibleChromeTabs.map((tab) => tab.title), [
    'Focus Mix - YouTube - Audio playing - Google Chrome',
  ])
  assert.equal(attribution.countDailyScreenTime, true)
})

test('disabled background audio ignores idle audio-only samples', () => {
  const attribution = getActivityAttribution(sample({
    foreground: { pid: 1, name: 'code.exe' },
    idleMs: 121_000,
    chromeTab: null,
  }), {
    trackBackgroundAudio: false,
    trackIncognitoTabs: false,
  })

  assert.deepEqual(attribution.appNames, [])
  assert.equal(attribution.focusedChromeTab, null)
  assert.deepEqual(attribution.audibleChromeTabs, [])
  assert.equal(attribution.countDailyScreenTime, false)
})

test('enabled background audio counts audio-only samples during idle time', () => {
  const attribution = getActivityAttribution(sample({
    foreground: { pid: 1, name: 'code.exe' },
    idleMs: 121_000,
    chromeTab: null,
  }), {
    trackBackgroundAudio: true,
    trackIncognitoTabs: false,
  })

  assert.deepEqual(attribution.appNames, ['chrome', 'spotify', 'vlc'])
  assert.equal(attribution.focusedChromeTab, null)
  assert.equal(attribution.audibleChromeTabs.length, 1)
  assert.equal(attribution.countDailyScreenTime, true)
})
