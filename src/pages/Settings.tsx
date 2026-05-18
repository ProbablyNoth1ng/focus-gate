import { useState } from 'react'
import type { AppSettings, BlockedApp } from '../../shared/ipc-types'
import { AppListItem } from '../components/AppListItem'
import { Toggle } from '../components/Toggle'
import { showToast } from '../components/Toast'

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

export function Settings({ settings, onSave }: SettingsProps) {
  const save = (partial: Partial<AppSettings>) => {
    onSave(partial)
    showToast('Settings saved')
  }

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
    showToast('Activity stats cleared')
  }

  const handleClearAll = async () => {
    if (!confirm('Clear ALL data (activity stats + intention logs)? This cannot be undone.')) return
    await window.electronAPI.clearAll()
    showToast('All data cleared')
  }

  const handleExport = async () => {
    const r = await window.electronAPI.exportCsv()
    if (r.success) showToast(`Exported to ${r.filePath?.split('\\').pop() ?? 'file'}`)
    else showToast('Export cancelled', 'info')
  }

  return (
    <div style={{ padding: '4px 24px 24px', overflowY: 'auto', height: '100%' }}>

      {/* Blocked Apps */}
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
            <div style={{ fontSize: 28, marginBottom: 8 }}>🛡️</div>
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

      {/* Interception Rules */}
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
            value={settings.minWordCount}
            onChange={e => save({ minWordCount: +e.target.value })}
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
              value={settings.countdownDelay}
              onChange={e => save({ countdownDelay: +e.target.value })}
              style={{ width: 70, textAlign: 'center' }}
            />
            
          </div>
        </FieldRow>
        <FieldRow
          label="Focus hours only"
          hint="Only intercept within the configured time window"
        >
          <Toggle
            checked={settings.focusHoursEnabled}
            onChange={v => save({ focusHoursEnabled: v })}
          />
        </FieldRow>
        {settings.focusHoursEnabled && (
          <>
            <FieldRow label="Focus start time">
              <input
                type="time"
                value={settings.focusStart}
                onChange={e => save({ focusStart: e.target.value })}
                style={{ width: 110 }}
              />
            </FieldRow>
            <FieldRow label="Focus end time">
              <input
                type="time"
                value={settings.focusEnd}
                onChange={e => save({ focusEnd: e.target.value })}
                style={{ width: 110 }}
              />
            </FieldRow>
          </>
        )}
      </Section>

      {/* Startup & Tray */}
      <Section>
        <SectionHeader title="Startup & Tray" />
        <FieldRow
          label="Launch at Windows startup"
          hint="Start FocusGate automatically when you log in"
        >
          <Toggle
            checked={settings.launchAtStartup}
            onChange={v => save({ launchAtStartup: v })}
          />
        </FieldRow>
        <FieldRow
          label="Dark mode"
        >
          <Toggle
            checked={settings.darkMode}
            onChange={v => save({ darkMode: v })}
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
            background: settings.isPaused ? 'rgba(245,166,35,0.15)' : 'var(--success-dim)',
            color: settings.isPaused ? 'var(--warning)' : 'var(--success)',
            border: `1px solid ${settings.isPaused ? 'rgba(245,166,35,0.3)' : 'rgba(78,203,141,0.3)'}`,
          }}>
            {settings.isPaused ? '⏸ Paused' : '● Active'}
          </div>
        </FieldRow>
      </Section>

      {/* Data */}
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
            ↓ Export CSV
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
            🗑 Clear All Data
          </button>
        </div>
      </Section>
    </div>
  )
}
