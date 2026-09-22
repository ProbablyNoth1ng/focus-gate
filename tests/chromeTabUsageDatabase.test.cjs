const assert = require('node:assert/strict')
const test = require('node:test')
const initSqlJs = require('sql.js')

const {
  __createTestDatabase,
  __setTestDatabase,
  accumulateDailyScreenTime,
  accumulateUsage,
  accumulateChromeTabUsage,
  clearActivity,
  clearAll,
  getActivityData,
  getActivityForDate,
  getChromeTabUsageForDate,
  removeAppActivity,
  removeChromeWebsiteActivity,
  removeChromePageActivity,
} = require('../dist/electron/database.js')

async function withDb(fn) {
  const SQL = await initSqlJs()
  const db = new SQL.Database()
  __setTestDatabase(db)
  __createTestDatabase()
  try {
    await fn(db)
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

test('removes app activity for only the selected date and preserves daily screen time', async () => {
  await withDb((db) => {
    const today = new Date().toLocaleDateString('en-CA')
    db.run(
      `INSERT INTO app_usage (app_name, date, seconds) VALUES
       ('code.exe', '2026-09-18', 30),
       ('code.exe', '2026-09-19', 60),
       ('slack', '2026-09-19', 90)`
    )
    accumulateDailyScreenTime(120)

    removeAppActivity('2026-09-19', 'Code')

    assert.deepEqual(getActivityForDate('2026-09-19', []), [
      { app_name: 'slack', total_seconds: 90 },
    ])
    assert.deepEqual(getActivityForDate('2026-09-18', []), [
      { app_name: 'code', total_seconds: 30 },
    ])
    assert.deepEqual(getActivityData([]).dailyUsage, [
      { date: today, total_seconds: 120 },
    ])

    accumulateUsage('code.exe', 15)
    assert.deepEqual(getActivityForDate(today, []), [
      { app_name: 'code', total_seconds: 15 },
    ])
  })
})

test('removing Chrome app activity also removes Chrome website activity for that date', async () => {
  await withDb((db) => {
    db.run(
      `INSERT INTO app_usage (app_name, date, seconds) VALUES
       ('chrome.exe', '2026-09-19', 60),
       ('code.exe', '2026-09-19', 30)`
    )
    accumulateChromeTabUsage({
      date: '2026-09-19',
      websiteKey: 'host:example.com',
      websiteLabel: 'example.com',
      pageKey: 'url:abc',
      pageTitle: 'Example',
      identitySource: 'url',
    }, 60)

    removeAppActivity('2026-09-19', 'chrome')

    assert.deepEqual(getActivityForDate('2026-09-19', []), [
      { app_name: 'code', total_seconds: 30 },
    ])
    assert.deepEqual(getChromeTabUsageForDate('2026-09-19'), [])
  })
})

test('removes every Chrome page grouped under the displayed website', async () => {
  await withDb((db) => {
    db.run(
      `INSERT INTO app_usage (app_name, date, seconds) VALUES
       ('chrome.exe', '2026-09-19', 120),
       ('code.exe', '2026-09-19', 30)`
    )
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
    accumulateChromeTabUsage({
      date: '2026-09-19',
      websiteKey: 'host:example.com',
      websiteLabel: 'example.com',
      pageKey: 'url:example',
      pageTitle: 'Example',
      identitySource: 'url',
    }, 10)

    removeChromeWebsiteActivity('2026-09-19', 'host:youtube.com')

    const websites = getChromeTabUsageForDate('2026-09-19')
    assert.equal(websites.length, 1)
    assert.equal(websites[0].website_key, 'host:example.com')
    assert.deepEqual(
      new Map(getActivityForDate('2026-09-19', []).map((row) => [row.app_name, row.total_seconds])),
      new Map([
        ['chrome', 30],
        ['code', 30],
      ])
    )
  })
})

test('removes only the displayed Chrome page including merged title aliases', async () => {
  await withDb((db) => {
    db.run(
      `INSERT INTO app_usage (app_name, date, seconds) VALUES
       ('chrome.exe', '2026-09-18', 100),
       ('chrome.exe', '2026-09-19', 120),
       ('slack', '2026-09-19', 90)`
    )
    db.run(
      `INSERT INTO daily_screen_time (date, seconds) VALUES
       ('2026-09-19', 500)`
    )
    accumulateChromeTabUsage({
      date: '2026-09-19',
      websiteKey: 'host:youtube.com',
      websiteLabel: 'youtube.com',
      pageKey: 'url:abc',
      pageTitle: 'Focus Music - YouTube',
      identitySource: 'url',
    }, 45)
    accumulateChromeTabUsage({
      date: '2026-09-19',
      websiteKey: 'host:youtube.com',
      websiteLabel: 'youtube.com',
      pageKey: 'title:def',
      pageTitle: '  Focus   Music - YouTube  ',
      identitySource: 'title',
    }, 15)
    accumulateChromeTabUsage({
      date: '2026-09-19',
      websiteKey: 'host:youtube.com',
      websiteLabel: 'youtube.com',
      pageKey: 'url:other',
      pageTitle: 'Other Video - YouTube',
      identitySource: 'url',
    }, 30)

    removeChromePageActivity('2026-09-19', 'host:youtube.com', 'url:abc')

    const websites = getChromeTabUsageForDate('2026-09-19')
    assert.equal(websites.length, 1)
    assert.deepEqual(websites[0].pages, [
      { page_key: 'url:other', title: 'Other Video - YouTube', total_seconds: 30 },
    ])
    assert.deepEqual(getActivityForDate('2026-09-19', []), [
      { app_name: 'slack', total_seconds: 90 },
      { app_name: 'chrome', total_seconds: 60 },
    ])
    assert.deepEqual(getActivityForDate('2026-09-18', []), [
      { app_name: 'chrome', total_seconds: 100 },
    ])
    assert.deepEqual(getActivityData([]).dailyUsage, [
      { date: '2026-09-19', total_seconds: 500 },
    ])
  })
})

test('removing the final Chrome page removes the empty website group', async () => {
  await withDb(() => {
    accumulateChromeTabUsage({
      date: '2026-09-19',
      websiteKey: 'host:example.com',
      websiteLabel: 'example.com',
      pageKey: 'url:abc',
      pageTitle: 'Example',
      identitySource: 'url',
    }, 60)

    removeChromePageActivity('2026-09-19', 'host:example.com', 'url:abc')

    assert.deepEqual(getChromeTabUsageForDate('2026-09-19'), [])
  })
})

test('removing a missing Chrome website or page leaves Chrome app time unchanged', async () => {
  await withDb((db) => {
    db.run(
      `INSERT INTO app_usage (app_name, date, seconds) VALUES
       ('chrome.exe', '2026-09-19', 60)`
    )
    accumulateChromeTabUsage({
      date: '2026-09-19',
      websiteKey: 'host:example.com',
      websiteLabel: 'example.com',
      pageKey: 'url:abc',
      pageTitle: 'Example',
      identitySource: 'url',
    }, 20)

    removeChromeWebsiteActivity('2026-09-19', 'host:missing.example')
    removeChromePageActivity('2026-09-19', 'host:example.com', 'url:missing')

    assert.deepEqual(getActivityForDate('2026-09-19', []), [
      { app_name: 'chrome', total_seconds: 60 },
    ])
    assert.equal(getChromeTabUsageForDate('2026-09-19')[0].total_seconds, 20)
  })
})

test('removing Chrome page time clamps app total to zero and normalizes historical Chrome aliases', async () => {
  await withDb((db) => {
    db.run(
      `INSERT INTO app_usage (app_name, date, seconds) VALUES
       ('chrome.exe', '2026-09-19', 10),
       ('chrome', '2026-09-19', 5)`
    )
    accumulateChromeTabUsage({
      date: '2026-09-19',
      websiteKey: 'host:example.com',
      websiteLabel: 'example.com',
      pageKey: 'url:abc',
      pageTitle: 'Example',
      identitySource: 'url',
    }, 20)

    removeChromePageActivity('2026-09-19', 'host:example.com', 'url:abc')

    assert.deepEqual(getActivityForDate('2026-09-19', []), [])

    accumulateUsage('chrome.exe', 15)
    assert.deepEqual(getActivityForDate(new Date().toLocaleDateString('en-CA'), []), [
      { app_name: 'chrome', total_seconds: 15 },
    ])
  })
})
