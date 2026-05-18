interface ToggleProps {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
  disabled?: boolean
}

export function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  return (
    <label style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
    }}>
      <div
        role="switch"
        aria-checked={checked}
        onClick={() => !disabled && onChange(!checked)}
        style={{
          width: 38,
          height: 22,
          background: checked ? 'var(--accent)' : 'var(--bg-active)',
          borderRadius: 11,
          position: 'relative',
          transition: 'background 0.2s ease',
          flexShrink: 0,
          boxShadow: checked ? '0 0 8px var(--accent-glow)' : 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <div style={{
          position: 'absolute',
          top: 3,
          left: checked ? 19 : 3,
          width: 16,
          height: 16,
          background: 'white',
          borderRadius: '50%',
          transition: 'left 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }} />
      </div>
      {label && (
        <span style={{ fontSize: 14, color: 'var(--text-primary)' }}>{label}</span>
      )}
    </label>
  )
}
