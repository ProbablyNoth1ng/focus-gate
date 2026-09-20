const assert = require('node:assert/strict')
const test = require('node:test')
const initSqlJs = require('sql.js')

const {
  __createTestDatabase,
  __setTestDatabase,
  accumulateChromeTabUsage,
  clearActivity,
  clearAll,
  getChromeTabUsageForDate,
} = require('../dist/electron/database.js')

async function withDb(fn) {
  const SQL = await initSqlJs()
  const db = new SQL.Database()
  __setTestDatabase(db)
  __createTestDatabase()
  try {
    await fn()
  } finally {
    db.close()
    __setTestDatabase(null)
  }
}

test('creates Chrome tab usage schema over an existing app-usage database', async () => {
  await withDb(() => {
    const rows = getChromeTabUsageForDate('2026-09-19')
    assert.deepEqual(rows, [])
  })
})

test('accumulates daily page time, merges same page, and keeps latest non-empty title', async () => {
  await withDb(() => {
    accumulateChromeTabUsage({
      date: '2026-09-19',
      websiteKey: 'host:example.com',
      websiteLabel: 'example.com',
      pageKey: 'url:abc',
      pageTitle: 'Old title',
      identitySource: 'url',
    }, 2)
    accumulateChromeTabUsage({
      date: '2026-09-19',
      websiteKey: 'host:example.com',
      websiteLabel: 'example.com',
      pageKey: 'url:abc',
      pageTitle: 'New title',
      identitySource: 'url',
    }, 3)

    const websites = getChromeTabUsageForDate('2026-09-19')
    assert.equal(websites.length, 1)
    assert.equal(websites[0].total_seconds, 5)
    assert.deepEqual(websites[0].pages, [
      { page_key: 'url:abc', title: 'New title', total_seconds: 5 },
    ])
  })
})

test('orders websites and nested pages by focused time descending', async () => {
  await withDb(() => {
    accumulateChromeTabUsage({
      date: '2026-09-19',
      websiteKey: 'host:docs.example',
      websiteLabel: 'docs.example',
      pageKey: 'url:docs-1',
      pageTitle: 'Short page',
      identitySource: 'url',
    }, 4)
    accumulateChromeTabUsage({
      date: '2026-09-19',
      websiteKey: 'host:docs.example',
      websiteLabel: 'docs.example',
      pageKey: 'url:docs-2',
      pageTitle: 'Long page',
      identitySource: 'url',
    }, 9)
    accumulateChromeTabUsage({
      date: '2026-09-19',
      websiteKey: 'host:video.example',
      websiteLabel: 'video.example',
      pageKey: 'url:video',
      pageTitle: 'Video',
      identitySource: 'url',
    }, 20)

    const websites = getChromeTabUsageForDate('2026-09-19')
    assert.deepEqual(websites.map((site) => site.website_label), ['video.example', 'docs.example'])
    assert.deepEqual(websites[1].pages.map((page) => page.title), ['Long page', 'Short page'])
  })
})

test('merges identical visible page titles even when stored with different keys', async () => {
  await withDb(() => {
    accumulateChromeTabUsage({
      date: '2026-09-19',
      websiteKey: 'host:youtube.com',
      websiteLabel: 'youtube.com',
      pageKey: 'url:abc',
      pageTitle: 'Как перестать прокрастинировать - YouTube',
      identitySource: 'url',
    }, 45)
    accumulateChromeTabUsage({
      date: '2026-09-19',
      websiteKey: 'host:youtube.com',
      websiteLabel: 'youtube.com',
      pageKey: 'title:def',
      pageTitle: '  Как перестать   прокрастинировать - YouTube  ',
      identitySource: 'title',
    }, 15)

    const websites = getChromeTabUsageForDate('2026-09-19')

    assert.equal(websites.length, 1)
    assert.equal(websites[0].pages.length, 1)
    assert.equal(websites[0].pages[0].title, 'Как перестать прокрастинировать - YouTube')
    assert.equal(websites[0].pages[0].total_seconds, 60)
  })
})

test('clears Chrome tab usage with activity and all-data clearing', async () => {
  await withDb(() => {
    accumulateChromeTabUsage({
      date: '2026-09-19',
      websiteKey: 'host:example.com',
      websiteLabel: 'example.com',
      pageKey: 'url:abc',
      pageTitle: 'Title',
      identitySource: 'url',
    }, 2)
    clearActivity()
    assert.deepEqual(getChromeTabUsageForDate('2026-09-19'), [])

    accumulateChromeTabUsage({
      date: '2026-09-19',
      websiteKey: 'host:example.com',
      websiteLabel: 'example.com',
      pageKey: 'url:abc',
      pageTitle: 'Title',
      identitySource: 'url',
    }, 2)
    clearAll()
    assert.deepEqual(getChromeTabUsageForDate('2026-09-19'), [])
  })
})

test('hides Chrome website usage when Chrome is hidden from activity tracking', async () => {
  await withDb(() => {
    accumulateChromeTabUsage({
      date: '2026-09-19',
      websiteKey: 'title:youtube',
      websiteLabel: 'YouTube',
      pageKey: 'title:music',
      pageTitle: 'Music - YouTube',
      identitySource: 'title',
    }, 60)

    assert.equal(getChromeTabUsageForDate('2026-09-19').length, 1)
    assert.deepEqual(getChromeTabUsageForDate('2026-09-19', ['chrome']), [])
    assert.deepEqual(getChromeTabUsageForDate('2026-09-19', ['chrome.exe']), [])
  })
})

test('normalizes noisy historical Chrome website labels into domain buckets', async () => {
  await withDb(() => {
    accumulateChromeTabUsage({
      date: '2026-09-19',
      websiteKey: 'title:516 mb',
      websiteLabel: '516 MB',
      pageKey: 'title:old-memory-row',
      pageTitle: '(30) 124 // Shear - 1 Hour Ambient Soundfield - YouTube - Audio playing - High memory usage - 516 MB',
      identitySource: 'title',
    }, 60)
    accumulateChromeTabUsage({
      date: '2026-09-19',
      websiteKey: 'title:1.3 gb',
      websiteLabel: '1.3 GB',
      pageKey: 'title:old-memory-row-2',
      pageTitle: '(30) 124 // Shear - 1 Hour Ambient Soundfield - YouTube - Audio playing - High memory usage - 1.3 GB',
      identitySource: 'title',
    }, 30)

    const websites = getChromeTabUsageForDate('2026-09-19')

    assert.equal(websites.length, 1)
    assert.equal(websites[0].website_label, 'youtube.com')
    assert.equal(websites[0].website_key, 'host:youtube.com')
    assert.equal(websites[0].total_seconds, 90)
    assert.deepEqual(websites[0].pages.map((page) => page.title), [
      '(30) 124 // Shear - 1 Hour Ambient Soundfield - YouTube - Audio playing - High memory usage - 516 MB',
      '(30) 124 // Shear - 1 Hour Ambient Soundfield - YouTube - Audio playing - High memory usage - 1.3 GB',
    ])
  })
})
