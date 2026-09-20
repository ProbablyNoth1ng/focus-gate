const assert = require('node:assert/strict')
const test = require('node:test')

const {
  cleanChromeAccessibilityTitle,
  deriveChromeUsageIdentities,
  deriveChromeTabIdentity,
  inferWebsiteFromTitle,
  normalizeUrlForIdentity,
} = require('../dist/electron/chromeTabIdentity.js')

test('normalizes URL identity deterministically without fragments, default ports, or tracking params', () => {
  const first = normalizeUrlForIdentity('HTTPS://Example.COM:443/Path/Page?utm_source=news&b=2&a=1&fbclid=abc#section')
  const second = normalizeUrlForIdentity('https://example.com/Path/Page?a=1&b=2')

  assert.equal(first.normalizedUrl, 'https://example.com/Path/Page?a=1&b=2')
  assert.equal(first.normalizedUrl, second.normalizedUrl)
  assert.equal(first.hostname, 'example.com')
})

test('keeps meaningful non-default ports and hashes complete normalized URL', () => {
  const first = normalizeUrlForIdentity('http://Example.com:8080/watch?v=1')
  const second = normalizeUrlForIdentity('http://example.com:8080/watch?v=2')

  assert.equal(first.normalizedUrl, 'http://example.com:8080/watch?v=1')
  assert.match(first.urlHash, /^[a-f0-9]{64}$/)
  assert.notEqual(first.urlHash, second.urlHash)
})

test('returns null for malformed or unsupported URLs', () => {
  assert.equal(normalizeUrlForIdentity('not a url'), null)
  assert.equal(normalizeUrlForIdentity('chrome://settings'), null)
  assert.equal(normalizeUrlForIdentity(''), null)
})

test('infers website from a cleaned Chrome title suffix', () => {
  assert.equal(inferWebsiteFromTitle('An article worth reading - Example News - Google Chrome'), 'Example News')
  assert.equal(inferWebsiteFromTitle('Inbox | Mail Service - Google Chrome'), 'Mail Service')
  assert.equal(inferWebsiteFromTitle('Untitled - Google Chrome'), 'Untitled')
})

test('derives URL identity with exact hostname grouping and latest page title', () => {
  const identity = deriveChromeTabIdentity({
    title: 'Docs - Product - Google Chrome',
    url: 'https://sub.example.com/docs?utm_campaign=x&q=focus',
    privacyMode: 'normal',
  }, false)

  assert.equal(identity.websiteKey, 'host:sub.example.com')
  assert.equal(identity.websiteLabel, 'sub.example.com')
  assert.match(identity.pageKey, /^url:[a-f0-9]{64}$/)
  assert.equal(identity.pageTitle, 'Docs - Product')
  assert.equal(identity.identitySource, 'url')
})

test('falls back to title identity when URL cannot be read', () => {
  const identity = deriveChromeTabIdentity({
    title: 'Reference Page | Example Docs - Google Chrome',
    url: '',
    privacyMode: 'normal',
  }, false)

  assert.equal(identity.websiteKey, 'title:example docs')
  assert.equal(identity.websiteLabel, 'Example Docs')
  assert.match(identity.pageKey, /^title:[a-f0-9]{64}$/)
  assert.equal(identity.identitySource, 'title')
})

test('fails closed for incognito and unknown privacy modes unless incognito tracking is enabled', () => {
  const incognito = { title: 'Secret - Google Chrome', url: 'https://example.com', privacyMode: 'incognito' }
  const unknown = { title: 'Maybe Secret - Google Chrome', url: 'https://example.com', privacyMode: 'unknown' }

  assert.equal(deriveChromeTabIdentity(incognito, false), null)
  assert.equal(deriveChromeTabIdentity(unknown, false), null)
  assert.ok(deriveChromeTabIdentity(incognito, true))
  assert.ok(deriveChromeTabIdentity(unknown, true))
})

test('cleans Chrome accessibility audio and memory annotations without damaging page title', () => {
  assert.equal(
    cleanChromeAccessibilityTitle('Long Mix - YouTube - Audio playing - Google Chrome'),
    'Long Mix - YouTube'
  )
  assert.equal(
    cleanChromeAccessibilityTitle('Reference Tab - Example Docs - Memory usage: 243 MB - Google Chrome'),
    'Reference Tab - Example Docs'
  )
  assert.equal(
    cleanChromeAccessibilityTitle('Audio playing with words in title - Example - Google Chrome'),
    'Audio playing with words in title - Example'
  )
  assert.equal(
    cleanChromeAccessibilityTitle('Song - Site - Audio playing - Memory usage: 243 MB - Google Chrome'),
    'Song - Site'
  )
  assert.equal(
    cleanChromeAccessibilityTitle('(30) 124 // Shear - 1 Hour Ambient Soundfield - YouTube - Audio playing - High memory usage - 1.3 GB'),
    '(30) 124 // Shear - 1 Hour Ambient Soundfield - YouTube'
  )
})

test('derives focused and audible Chrome identities with full overlapping attribution', () => {
  const identities = deriveChromeUsageIdentities({
    focusedTab: {
      title: 'Article - Example News - Google Chrome',
      url: 'https://news.example/article',
      privacyMode: 'normal',
    },
    audibleTabs: [
      {
        title: 'Long Mix - YouTube - Audio playing - Google Chrome',
        url: '',
        privacyMode: 'normal',
        windowId: '200',
        isSelected: false,
      },
    ],
    foregroundChromeWindowId: '100',
    trackIncognitoTabs: false,
  })

  assert.equal(identities.length, 2)
  assert.equal(identities[0].websiteLabel, 'news.example')
  assert.equal(identities[0].identitySource, 'url')
  assert.equal(identities[1].websiteLabel, 'youtube.com')
  assert.equal(identities[1].websiteKey, 'host:youtube.com')
  assert.equal(identities[1].pageTitle, 'Long Mix - YouTube')
  assert.equal(identities[1].identitySource, 'title')
})

test('counts the selected audible foreground tab once with URL identity', () => {
  const identities = deriveChromeUsageIdentities({
    focusedTab: {
      title: 'Video - Example Video - Google Chrome',
      url: 'https://video.example/watch?v=1',
      privacyMode: 'normal',
    },
    audibleTabs: [
      {
        title: 'Video - Example Video - Audio playing - Google Chrome',
        url: '',
        privacyMode: 'normal',
        windowId: '500',
        isSelected: true,
      },
    ],
    foregroundChromeWindowId: '500',
    trackIncognitoTabs: false,
  })

  assert.equal(identities.length, 1)
  assert.equal(identities[0].websiteLabel, 'video.example')
  assert.equal(identities[0].identitySource, 'url')
})

test('uses the same identity for identical audible titles in different windows when website is known', () => {
  const identities = deriveChromeUsageIdentities({
    focusedTab: null,
    audibleTabs: [
      {
        title: 'Focus Music - YouTube - Audio playing - Google Chrome',
        url: '',
        privacyMode: 'normal',
        windowId: '100',
        isSelected: false,
      },
      {
        title: 'Focus Music - YouTube - Audio playing - Google Chrome',
        url: '',
        privacyMode: 'normal',
        windowId: '200',
        isSelected: false,
      },
      {
        title: 'Episode 2 | Twitch - Audio playing - Google Chrome',
        url: '',
        privacyMode: 'normal',
        windowId: '300',
        isSelected: false,
      },
    ],
    foregroundChromeWindowId: null,
    trackIncognitoTabs: false,
  })

  assert.deepEqual(identities.map((identity) => identity.websiteLabel), [
    'youtube.com',
    'youtube.com',
    'twitch.tv',
  ])
  assert.equal(identities[0].pageKey, identities[1].pageKey)
})

test('uses the same identity for same-titled audible tabs in the same window when website is known', () => {
  const identities = deriveChromeUsageIdentities({
    focusedTab: null,
    audibleTabs: [
      {
        title: 'Focus Music - YouTube - Audio playing - Google Chrome',
        url: '',
        privacyMode: 'normal',
        windowId: '100',
        isSelected: false,
      },
      {
        title: 'Focus Music - YouTube - Audio playing - Google Chrome',
        url: '',
        privacyMode: 'normal',
        windowId: '100',
        isSelected: false,
      },
    ],
    foregroundChromeWindowId: null,
    trackIncognitoTabs: false,
  })

  assert.equal(identities.length, 2)
  assert.equal(identities[0].pageKey, identities[1].pageKey)
})

test('preserves non-Latin Chrome titles in title-derived identities', () => {
  const identity = deriveChromeTabIdentity({
    title: 'Как перестать прокрастинировать - YouTube - Google Chrome',
    url: '',
    privacyMode: 'normal',
  }, false)

  assert.equal(identity.websiteLabel, 'YouTube')
  assert.equal(identity.pageTitle, 'Как перестать прокрастинировать - YouTube')
  assert.match(identity.pageKey, /^title:[a-f0-9]{64}$/)
})

test('skips audible tab website usage when there is no reliable website suffix', () => {
  const identities = deriveChromeUsageIdentities({
    focusedTab: null,
    audibleTabs: [
      {
        title: 'Standalone Player - Audio playing - Google Chrome',
        url: '',
        privacyMode: 'normal',
        windowId: '100',
        isSelected: false,
      },
    ],
    foregroundChromeWindowId: null,
    trackIncognitoTabs: false,
  })

  assert.deepEqual(identities, [])
})

test('filters audible incognito and unknown tabs unless incognito tracking is enabled', () => {
  const audibleTabs = [
    {
      title: 'Secret Mix - YouTube - Audio playing - Google Chrome (Incognito)',
      url: '',
      privacyMode: 'incognito',
      windowId: '100',
      isSelected: false,
    },
    {
      title: 'Mystery Mix - Twitch - Audio playing - Google Chrome',
      url: '',
      privacyMode: 'unknown',
      windowId: '200',
      isSelected: false,
    },
  ]

  assert.deepEqual(deriveChromeUsageIdentities({
    focusedTab: null,
    audibleTabs,
    foregroundChromeWindowId: null,
    trackIncognitoTabs: false,
  }), [])

  assert.equal(deriveChromeUsageIdentities({
    focusedTab: null,
    audibleTabs,
    foregroundChromeWindowId: null,
    trackIncognitoTabs: true,
  }).length, 2)
})
