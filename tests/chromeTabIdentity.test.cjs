const assert = require('node:assert/strict')
const test = require('node:test')

const {
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
