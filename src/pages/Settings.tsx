import { useState, useRef, useCallback, useEffect } from 'react'
import type { AppSettings, BlockedApp } from '../../shared/ipc-types'
import { AppListItem } from '../components/AppListItem'
import { Toggle } from '../components/Toggle'
import { showToast } from '../components/Toast'
import { IoShieldCheckmarkOutline, IoPause, IoPlay, IoDownloadOutline, IoTrash } from 'react-icons/io5'

interface SettingsProps {
  settings: AppSettings
  onSave: (partial: Partial<AppSettings>) => void
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</h2>
      {subtitle && <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 3 }}>{subtitle}</p>}
    </div>
  )
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding: 20,
      marginBottom: 16,
    }}>
      {children}
    </div>
  )
}

function FieldRow({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      padding: '10px 0',
      borderBottom: '1px solid var(--border)',
    }}>
      <div>
        <div style={{ fontSize: 14, color: 'var(--text-primary)' }}>{label}</div>
        {hint && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{hint}</div>}
      </div>
      <div className="titlebar-no-drag">{children}</div>
    </div>
  )
}

const DEBOUNCE_MS = 500

export function Settings({ settings, onSave }: SettingsProps) {

  const [hiddenApps, setHiddenApps] = useState<string[]>(settings.hiddenApps ?? [])

  const [minWordCount, setMinWordCount] = useState(settings.minWordCount)
  const [countdownDelay, setCountdownDelay] = useState(settings.countdownDelay)
  const [focusStart, setFocusStart] = useState(settings.focusStart)
  const [focusEnd, setFocusEnd] = useState(settings.focusEnd)
  const [localLaunchAtStartup, setLocalLaunchAtStartup] = useState(settings.launchAtStartup)
  const [localDarkMode, setLocalDarkMode] = useState(settings.darkMode)
  const [localFocusHoursEnabled, setLocalFocusHoursEnabled] = useState(settings.focusHoursEnabled)

  useEffect(() => { setHiddenApps(settings.hiddenApps ?? []) }, [settings.hiddenApps])
  useEffect(() => { setMinWordCount(settings.minWordCount) }, [settings.minWordCount])
  useEffect(() => { setCountdownDelay(settings.countdownDelay) }, [settings.countdownDelay])
  useEffect(() => { setFocusStart(settings.focusStart) }, [settings.focusStart])
  useEffect(() => { setFocusEnd(settings.focusEnd) }, [settings.focusEnd])
  useEffect(() => { setLocalLaunchAtStartup(settings.launchAtStartup) }, [settings.launchAtStartup])
  useEffect(() => { setLocalDarkMode(settings.darkMode) }, [settings.darkMode])
  useEffect(() => { setLocalFocusHoursEnabled(settings.focusHoursEnabled) }, [settings.focusHoursEnabled])

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingPartial = useRef<Partial<AppSettings>>({})

  const debouncedSave = useCallback((partial: Partial<AppSettings>) => {
    pendingPartial.current = { ...pendingPartial.current, ...partial }
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      onSave(pendingPartial.current)
      showToast('Settings saved')
      pendingPartial.current = {}
    }, DEBOUNCE_MS)
  }, [onSave])

  const save = useCallback((partial: Partial<AppSettings>) => {
    onSave(partial)
    showToast('Settings saved')
  }, [onSave])

  const addApp = async () => {
    const result = await window.electronAPI.pickExe()
    if (!result) return

    const newApp: BlockedApp = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: result.name,
      exePath: result.exePath,
      icon: result.icon,
      enabled: true,
    }

    const updated = [...settings.blockedApps, newApp]
    save({ blockedApps: updated })
  }

  const toggleApp = (id: string, enabled: boolean) => {
    const updated = settings.blockedApps.map(a => a.id === id ? { ...a, enabled } : a)
    save({ blockedApps: updated })
  }

  const removeApp = (id: string) => {
    const updated = settings.blockedApps.filter(a => a.id !== id)
    save({ blockedApps: updated })
  }

  const handleClearLogs = async () => {
    if (!confirm('Clear all intention logs? This cannot be undone.')) return
    await window.electronAPI.clearLogs()
    showToast('Intention logs cleared')
  }

  const handleClearActivity = async () => {
    if (!confirm('Clear all app activity stats? This cannot be undone.')) return
    await window.electronAPI.clearActivity()
    setHiddenApps([])
    showToast('Activity stats cleared')
  }

  const handleClearAll = async () => {
    if (!confirm('Clear ALL data (activity stats + intention logs)? This cannot be undone.')) return
    await window.electronAPI.clearAll()
    showToast('All data cleared')
  }

  const handleUnhideApp = async (appName: string) => {
    await window.electronAPI.unhideApp(appName)
    const updated = hiddenApps.filter(h => h !== appName)
    setHiddenApps(updated)
    showToast(`"${appName}" restored to tracking`)
  }

  const handleExport = async () => {
    const r = await window.electronAPI.exportCsv()
    if (r.success) showToast(`Exported to ${r.filePath?.split('\\').pop() ?? 'file'}`)
    else showToast('Export cancelled', 'info')
  }

  return (
    <div style={{ padding: '4px 24px 24px', overflowY: 'auto', height: '100%' }}>

      <Section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <SectionHeader
            title="Blocked Apps"
            subtitle="Apps that will require an intention statement before opening"
          />
          <button
            onClick={addApp}
            style={{
              padding: '7px 14px',
              background: 'var(--accent)',
              color: 'white',
              borderRadius: 'var(--radius-sm)',
              fontSize: 13,
              fontWeight: 500,
              flexShrink: 0,
              marginBottom: 19,
            }}
          >
            + Add App
          </button>
        </div>

        {settings.blockedApps.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '24px 0',
            color: 'var(--text-muted)',
            fontSize: 13,
          }}>
            <div style={{ fontSize: 28, marginBottom: 8, color: 'var(--text-muted)' }}><IoShieldCheckmarkOutline /></div>
            No apps blocked yet. Click "Add App" to get started.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {settings.blockedApps.map(app => (
              <AppListItem
                key={app.id}
                app={app}
                onToggle={toggleApp}
                onRemove={removeApp}
              />
            ))}
          </div>
        )}
      </Section>

      <Section>
        <SectionHeader
          title="Interception Rules"
          subtitle="Configure how the intention dialog behaves"
        />
        <FieldRow
          label="Minimum word count"
          hint="Minimum words required in the intention field"
        >
          <input
            type="number"
            min={5} max={100}
            value={minWordCount}
            onChange={e => {
              setMinWordCount(+e.target.value)
              debouncedSave({ minWordCount: +e.target.value })
            }}
            style={{ width: 70, textAlign: 'center' }}
          />
        </FieldRow>
        <FieldRow
          label="Countdown delay"
          hint="Seconds before the text field becomes active"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="number"
              min={0} max={120}
              value={countdownDelay}
              onChange={e => {
                setCountdownDelay(+e.target.value)
                debouncedSave({ countdownDelay: +e.target.value })
              }}
              style={{ width: 70, textAlign: 'center' }}
            />
          </div>
        </FieldRow>
        <FieldRow
          label="Focus hours only"
          hint="Only intercept within the configured time window"
        >
          <Toggle
            checked={localFocusHoursEnabled}
            onChange={v => {
              setLocalFocusHoursEnabled(v)
              debouncedSave({ focusHoursEnabled: v })
            }}
          />
        </FieldRow>
        {localFocusHoursEnabled && (
          <>
            <FieldRow label="Focus start time">
              <input
                type="time"
                value={focusStart}
                onChange={e => {
                  setFocusStart(e.target.value)
                  debouncedSave({ focusStart: e.target.value })
                }}
                style={{ width: 110 }}
              />
            </FieldRow>
            <FieldRow label="Focus end time">
              <input
                type="time"
                value={focusEnd}
                onChange={e => {
                  setFocusEnd(e.target.value)
                  debouncedSave({ focusEnd: e.target.value })
                }}
                style={{ width: 110 }}
              />
            </FieldRow>
          </>
        )}
      </Section>

      <Section>
        <SectionHeader title="Startup & Tray" />
        <FieldRow
          label="Launch at Windows startup"
          hint="Start FocusGate automatically when you log in"
        >
          <Toggle
            checked={localLaunchAtStartup}
            onChange={v => {
              setLocalLaunchAtStartup(v)
              debouncedSave({ launchAtStartup: v })
            }}
          />
        </FieldRow>
        <FieldRow
          label="Dark mode"
        >
          <Toggle
            checked={localDarkMode}
            onChange={v => {
              setLocalDarkMode(v)
              debouncedSave({ darkMode: v })
            }}
          />
        </FieldRow>
        <FieldRow
          label="Interception status"
        >
          <div style={{
            padding: '4px 10px',
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 500,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            background: settings.isPaused ? 'rgba(245,166,35,0.15)' : 'var(--success-dim)',
            color: settings.isPaused ? 'var(--warning)' : 'var(--success)',
            border: `1px solid ${settings.isPaused ? 'rgba(245,166,35,0.3)' : 'rgba(78,203,141,0.3)'}`,
          }}>
            {settings.isPaused ? <><IoPause style={{ fontSize: 11 }} /> Paused</> : <><IoPlay style={{ fontSize: 9 }} /> Active</>}
          </div>
        </FieldRow>
      </Section>

      <Section>
        <SectionHeader
          title="Hidden from Tracking"
          subtitle="Apps removed from activity tracking. Click restore to bring them back."
        />
        {hiddenApps.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '20px 0',
            color: 'var(--text-muted)',
            fontSize: 13,
          }}>
            Nothing hidden yet
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {hiddenApps.map(name => (
              <div key={name} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
              }}>
                <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{name}</span>
                <button
                  onClick={() => handleUnhideApp(name)}
                  style={{
                    padding: '4px 10px',
                    background: 'var(--bg-active)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section>
        <SectionHeader
          title="Data"
          subtitle="Manage your stored logs and statistics"
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
          <button
            onClick={handleExport}
            style={{
              padding: '8px 16px',
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><IoDownloadOutline /> Export CSV</span>
          </button>
          <button
            onClick={handleClearLogs}
            style={{
              padding: '8px 16px',
              background: 'var(--danger-dim)',
              color: 'var(--danger)',
              border: '1px solid rgba(242,92,92,0.3)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            Clear History
          </button>
          <button
            onClick={handleClearActivity}
            style={{
              padding: '8px 16px',
              background: 'var(--danger-dim)',
              color: 'var(--danger)',
              border: '1px solid rgba(242,92,92,0.3)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            Clear Activity Stats
          </button>
          <button
            onClick={handleClearAll}
            style={{
              padding: '8px 16px',
              background: 'var(--danger-dim)',
              color: 'var(--danger)',
              border: '1px solid rgba(242,92,92,0.3)',
              borderRadius: 'var(--radius-sm)',
              fontWeight: 600,
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><IoTrash /> Clear All Data</span>
          </button>
        </div>
      </Section>
    </div>
  )
}