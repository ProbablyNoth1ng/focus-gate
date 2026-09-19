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
