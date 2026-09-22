import { createHash } from 'crypto'
import type { ChromeAudibleTabObservation, ChromeTabIdentity, ChromeTabObservation } from '../shared/ipc-types'

const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'gbraid',
  'mc_cid',
  'mc_eid',
  'msclkid',
  'igshid',
])

const TITLE_SITE_DOMAINS = new Map([
  ['youtube', 'youtube.com'],
  ['github', 'github.com'],
  ['reddit', 'reddit.com'],
  ['x', 'x.com'],
  ['twitter', 'twitter.com'],
  ['facebook', 'facebook.com'],
  ['instagram', 'instagram.com'],
  ['linkedin', 'linkedin.com'],
  ['twitch', 'twitch.tv'],
  ['spotify', 'spotify.com'],
  ['soundcloud', 'soundcloud.com'],
  ['netflix', 'netflix.com'],
  ['google docs', 'docs.google.com'],
  ['google drive', 'drive.google.com'],
  ['gmail', 'mail.google.com'],
  ['apple music', 'music.apple.com'],
])

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function cleanTitle(title: string): string {
  return title
    .replace(/\s+-\s+Google Chrome$/i, '')
    .replace(/\s+\((Incognito|Guest)\)$/i, '')
    .trim()
}

function stableTitleKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function normalizeDomainLabel(value: string): string | null {
  const cleaned = value.trim().toLowerCase().replace(/^www\./, '')
  if (/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(cleaned)) {
    return cleaned
  }
  return TITLE_SITE_DOMAINS.get(stableTitleKey(value)) ?? null
}

export function normalizeUrlForIdentity(rawUrl: string): { normalizedUrl: string; hostname: string; urlHash: string } | null {
  const raw = rawUrl.trim()
  if (!raw) return null

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null

  url.protocol = url.protocol.toLowerCase()
  url.hostname = url.hostname.toLowerCase()
  url.hash = ''

  if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
    url.port = ''
  }

  const keptParams = [...url.searchParams.entries()]
    .filter(([key]) => !key.toLowerCase().startsWith('utm_') && !TRACKING_PARAMS.has(key.toLowerCase()))
    .sort(([aKey, aValue], [bKey, bValue]) => {
      const keyCompare = aKey.localeCompare(bKey)
      return keyCompare === 0 ? aValue.localeCompare(bValue) : keyCompare
    })

  url.search = ''
  for (const [key, value] of keptParams) {
    url.searchParams.append(key, value)
  }

  const normalizedUrl = url.toString()
  return {
    normalizedUrl,
    hostname: url.hostname,
    urlHash: sha256Hex(normalizedUrl),
  }
}

export function inferWebsiteFromTitle(title: string): string {
  const cleaned = cleanTitle(title)
  if (!cleaned) return ''

  const separators = [' — ', ' - ', ' | ']
  for (const separator of separators) {
    const parts = cleaned.split(separator).map((part) => part.trim()).filter(Boolean)
    if (parts.length > 1) return parts[parts.length - 1]
  }

  return cleaned
}

export function cleanChromeAccessibilityTitle(title: string): string {
  let cleaned = title
    .replace(/\s+\((Incognito|Guest)\)$/i, '')
    .replace(/\s+-\s+Google Chrome$/i, '')
    .replace(/\s+-\s+High memory usage\s+-\s+[\d.,]+\s*(B|KB|MB|GB)$/i, '')
    .replace(/\s+-\s+Memory usage:\s*[\d.,]+\s*(B|KB|MB|GB)$/i, '')
    .trim()
  cleaned = cleaned
    .replace(/\s+-\s+Audio playing$/i, '')
    .trim()
  return cleaned
}

function inferAudibleWebsiteFromTitle(cleanedTitle: string): string | null {
  const separators = [' — ', ' - ', ' | ']
  for (const separator of separators) {
    const parts = cleanedTitle.split(separator).map((part) => part.trim()).filter(Boolean)
    if (parts.length > 1) {
      const domain = normalizeDomainLabel(parts[parts.length - 1])
      if (domain) return domain
    }
  }
  return null
}

export function normalizeChromeWebsiteIdentityFromTitle(
  pageTitle: string,
  fallbackLabel = ''
): { websiteKey: string; websiteLabel: string } | null {
  const cleanedTitle = cleanChromeAccessibilityTitle(pageTitle)
  const inferredLabel = inferAudibleWebsiteFromTitle(cleanedTitle)
  const domainLabel = inferredLabel
    ? normalizeDomainLabel(inferredLabel)
    : normalizeDomainLabel(fallbackLabel)
  if (!domainLabel) return null

  return {
    websiteKey: `host:${domainLabel}`,
    websiteLabel: domainLabel,
  }
}

export function deriveChromeTabIdentity(
  observation: ChromeTabObservation,
  trackIncognitoTabs: boolean
): ChromeTabIdentity | null {
  if (!trackIncognitoTabs && observation.privacyMode !== 'normal') return null

  const pageTitle = cleanTitle(observation.title)
  const urlIdentity = normalizeUrlForIdentity(observation.url)
  if (urlIdentity) {
    return {
      websiteKey: `host:${urlIdentity.hostname}`,
      websiteLabel: urlIdentity.hostname,
      pageKey: `url:${urlIdentity.urlHash}`,
      pageTitle: pageTitle || urlIdentity.hostname,
      identitySource: 'url',
    }
  }

  const websiteLabel = inferWebsiteFromTitle(observation.title)
  const normalizedWebsite = stableTitleKey(websiteLabel)
  const normalizedPage = stableTitleKey(pageTitle)
  if (!normalizedWebsite || !normalizedPage) return null

  return {
    websiteKey: `title:${normalizedWebsite}`,
    websiteLabel,
    pageKey: `title:${sha256Hex(normalizedPage)}`,
    pageTitle,
    identitySource: 'title',
  }
}

export function deriveChromeAudibleTabIdentity(
  observation: ChromeAudibleTabObservation,
  trackIncognitoTabs: boolean
): ChromeTabIdentity | null {
  if (!trackIncognitoTabs && observation.privacyMode !== 'normal') return null

  const pageTitle = cleanChromeAccessibilityTitle(observation.title)
  const normalizedPage = stableTitleKey(pageTitle)
  if (!normalizedPage) return null

  const website = normalizeChromeWebsiteIdentityFromTitle(pageTitle)
  if (!website) return null

  return {
    websiteKey: website.websiteKey,
    websiteLabel: website.websiteLabel,
    pageKey: `title:${sha256Hex(normalizedPage)}`,
    pageTitle,
    identitySource: 'title',
  }
}

export function deriveChromeUsageIdentities(options: {
  focusedTab: ChromeTabObservation | null
  audibleTabs: ChromeAudibleTabObservation[]
  foregroundChromeWindowId: string | null
  trackIncognitoTabs: boolean
}): ChromeTabIdentity[] {
  const identities: ChromeTabIdentity[] = []

  if (options.focusedTab) {
    const focusedIdentity = deriveChromeTabIdentity(options.focusedTab, options.trackIncognitoTabs)
    if (focusedIdentity) identities.push(focusedIdentity)
  }

  for (const audibleTab of options.audibleTabs) {
    if (
      options.focusedTab &&
      options.foregroundChromeWindowId &&
      audibleTab.isSelected &&
      audibleTab.windowId === options.foregroundChromeWindowId
    ) {
      continue
    }

    const audibleIdentity = deriveChromeAudibleTabIdentity(audibleTab, options.trackIncognitoTabs)
    if (audibleIdentity) {
      identities.push(audibleIdentity)
    }
  }

  return identities
}
