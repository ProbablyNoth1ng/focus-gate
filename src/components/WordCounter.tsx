interface WordCounterProps {
  text: string
  minimum: number
}

export function WordCounter({ text, minimum }: WordCounterProps) {
  const count = text.trim() === '' ? 0 : text.trim().split(/\s+/).length
  const met = count >= minimum

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 12,
      fontFamily: 'var(--font-mono)',
      transition: 'all 0.2s ease',
    }}>
      {/* Mini progress bar */}
      <div style={{
        flex: 1,
        height: 3,
        background: 'var(--bg-active)',
        borderRadius: 2,
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${Math.min(100, (count / minimum) * 100)}%`,
          background: met ? 'var(--success)' : 'var(--accent)',
          borderRadius: 2,
          transition: 'width 0.2s ease, background 0.3s ease',
          boxShadow: met ? '0 0 6px var(--success)' : 'none',
        }} />
      </div>
      <span style={{
        color: met ? 'var(--success)' : 'var(--text-secondary)',
        transition: 'color 0.3s ease',
        transform: met ? 'scale(1.05)' : 'scale(1)',
        display: 'inline-block',
        minWidth: 60,
        textAlign: 'right',
      }}>
        {count} / {minimum} words
      </span>
    </div>
  )
}
