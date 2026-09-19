import { createHash } from 'crypto'
import type { ChromeTabIdentity, ChromeTabObservation } from '../shared/ipc-types'

const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'gbraid',
  'mc_cid',
  'mc_eid',
  'msclkid',
  'igshid',
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
