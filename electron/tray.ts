import { Tray, Menu, app, nativeImage, Notification } from 'electron'
import path from 'path'
import Store from 'electron-store'
import { AppSettings } from '../shared/ipc-types'

let tray: Tray | null = null
let isPaused = false
let pauseTimer: ReturnType<typeof setTimeout> | null = null

function isTrayAlive(): boolean {
  return tray !== null && !tray.isDestroyed()
}

export function initTray(
  store: Store<AppSettings>,
  showMainWindow: () => void,
  getMainWindow: () => Electron.BrowserWindow | null,
  onPauseChange: (paused: boolean) => void
): Tray {
  const activeIcon = getIconPath('tray-active')
  const icon = nativeImage.createFromPath(activeIcon)
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon)
  tray.setToolTip('FocusGate — Active')

  function buildMenu() {
    const pauseLabel = isPaused ? 'Resume' : 'Pause'
    return Menu.buildFromTemplate([
      {
        label: 'Open FocusGate',
        click: () => showMainWindow(),
      },
      { type: 'separator' },
      {
        label: `${pauseLabel} Interception`,
        click: () => togglePause(store, onPauseChange),
      },
      {
        label: 'Pause for 15 min',
        click: () => pauseFor(15, store, onPauseChange),
      },
      {
        label: 'Pause for 30 min',
        click: () => pauseFor(30, store, onPauseChange),
      },
      {
        label: 'Pause for 60 min',
        click: () => pauseFor(60, store, onPauseChange),
      },
      { type: 'separator' },
      {
        label: 'Quit FocusGate',
        click: () => app.quit(),
      },
    ])
  }

  tray.setContextMenu(buildMenu())

  tray.on('click', () => {
    if (!isTrayAlive()) return
    showMainWindow()
  })

  tray.on('right-click', () => {
    if (!isTrayAlive()) return
    tray!.setContextMenu(buildMenu())
  })

  void getMainWindow // kept for future use
  return tray
}

function getIconPath(name: string): string {
  const isDev = process.env.NODE_ENV !== 'production'
  if (isDev) {
    return path.join(__dirname, '..', '..', 'assets', `${name}.png`)
  }
  return path.join(process.resourcesPath || '', `${name}.png`)
}

export function togglePause(
  store: Store<AppSettings>,
  onPauseChange: (paused: boolean) => void
): void {
  isPaused = !isPaused
  if (pauseTimer) { clearTimeout(pauseTimer); pauseTimer = null }
  store.set('isPaused', isPaused)
  store.set('pauseUntil', null)
  updateTrayState()
  onPauseChange(isPaused)
  showPauseNotification(
    isPaused ? 'Paused' : 'Resumed',
    isPaused ? 'Interception paused indefinitely' : 'Interception resumed'
  )
}

export function pauseFor(
  minutes: number,
  store: Store<AppSettings>,
  onPauseChange: (paused: boolean) => void
): void {
  isPaused = true
  const until = Date.now() + minutes * 60 * 1000
  if (pauseTimer) clearTimeout(pauseTimer)
  pauseTimer = setTimeout(() => {
    isPaused = false
    store.set('isPaused', false)
    store.set('pauseUntil', null)
    updateTrayState()
    onPauseChange(false)
    showPauseNotification('Resumed', `FocusGate resumed after ${minutes}-minute pause`)
  }, minutes * 60 * 1000)
  store.set('isPaused', true)
  store.set('pauseUntil', until)
  updateTrayState()
  onPauseChange(true)
  showPauseNotification('Paused', `Interception paused for ${minutes} minutes`)
}

export function setTrayPaused(paused: boolean): void {
  isPaused = paused
  updateTrayState()
}

function updateTrayState(): void {
  if (!isTrayAlive()) return
  tray!.setToolTip(isPaused ? 'FocusGate — Paused' : 'FocusGate — Active')
}

function showPauseNotification(title: string, body: string): void {
  if (Notification.isSupported()) {
    new Notification({ title: `FocusGate — ${title}`, body }).show()
  }
}

export function destroyTray(): void {
  if (isTrayAlive()) {
    tray!.removeAllListeners()
    tray!.destroy()
  }
  tray = null
}