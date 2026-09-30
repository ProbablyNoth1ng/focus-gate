import type { ChromeAudibleTabObservation, ChromeTabObservation } from '../shared/ipc-types'
import type { ActivitySample } from './processMonitor'
import { isRealApp, isSystemProcess } from './processMonitor'

interface ActivityAttributionSettings {
  trackBackgroundAudio: boolean
}

export interface ActivityAttribution {
  appNames: string[]
  focusedChromeTab: ChromeTabObservation | null
  audibleChromeTabs: ChromeAudibleTabObservation[]
  countDailyScreenTime: boolean
}

function normalizeTrackedAppName(name: string | null | undefined): string | null {
  if (!name) return null
  if (isSystemProcess(name) || !isRealApp(name)) return null
  return name.replace(/\.exe$/i, '').toLowerCase()
}

export function getActivityAttribution(
  sample: ActivitySample,
  settings: ActivityAttributionSettings
): ActivityAttribution {
  const appNames = new Set<string>()
  const userIsActive = sample.idleMs <= 120_000

  const addTrackedApp = (name: string | null | undefined) => {
    const normalized = normalizeTrackedAppName(name)
    if (normalized) appNames.add(normalized)
  }

  if (sample.foreground && userIsActive) {
    addTrackedApp(sample.foreground.name)
  }

  if (settings.trackBackgroundAudio) {
    for (const mediaApp of sample.mediaApps) {
      addTrackedApp(mediaApp.name)
    }

    if (sample.chromeAudibleTabs.length > 0) {
      addTrackedApp('chrome.exe')
    }
  }

  const foregroundName = sample.foreground?.name.replace(/\.exe$/i, '').toLowerCase()
  const focusedChromeTab = foregroundName === 'chrome' && userIsActive
    ? sample.chromeTab
    : null

  return {
    appNames: [...appNames],
    focusedChromeTab,
    audibleChromeTabs: settings.trackBackgroundAudio ? sample.chromeAudibleTabs : [],
    countDailyScreenTime: appNames.size > 0,
  }
}
