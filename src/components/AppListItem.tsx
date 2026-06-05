import type { BlockedApp } from '../../shared/ipc-types'
import { Toggle } from './Toggle'
import { IoCubeOutline, IoClose } from 'react-icons/io5'

interface AppListItemProps {
  app: BlockedApp
  onToggle: (id: string, enabled: boolean) => void
  onRemove: (id: string) => void
}

export function AppListItem({ app, onToggle, onRemove }: AppListItemProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '10px 14px',
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)',
      transition: 'border-color 0.15s, background 0.15s',
    }}
    onMouseEnter={e => {
      (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-strong)'
    }}
    onMouseLeave={e => {
      (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'
    }}
    >
      {/* Icon */}
      {app.icon ? (
        <img src={app.icon} alt={app.name} style={{ width: 28, height: 28, objectFit: 'contain', flexShrink: 0 }} />
      ) : (
        <div style={{
          width: 28,
          height: 28,
          background: 'var(--bg-active)',
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 14,
          flexShrink: 0,
        }}><IoCubeOutline style={{ fontSize: 16, color: 'var(--text-muted)' }} /></div>
      )}

      {/* Name + path */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: 14 }}>{app.name}</div>
        <div style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontFamily: 'var(--font-mono)',
        }}>
          {app.exePath}
        </div>
      </div>

      {/* Toggle */}
      <Toggle
        checked={app.enabled}
        onChange={(v) => onToggle(app.id, v)}
      />

      {/* Remove */}
      <button
        onClick={() => onRemove(app.id)}
        title="Remove"
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          background: 'transparent',
          color: 'var(--text-muted)',
          fontSize: 16,
          justifyContent: 'center',
          padding: 0,
          flexShrink: 0,
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--danger-dim)'
          ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--danger)'
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
          ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'
        }}
      >
        <IoClose style={{ fontSize: 16 }} />
      </button>
    </div>
  )
}
