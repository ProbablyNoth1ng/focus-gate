import { useEffect, useRef, useState } from 'react'

interface CountdownRingProps {
  duration: number       // seconds
  onComplete: () => void
  size?: number
  strokeWidth?: number
}

export function CountdownRing({ duration, onComplete, size = 160, strokeWidth = 8 }: CountdownRingProps) {
  const [elapsed, setElapsed] = useState(0)
  const [done, setDone] = useState(false)
  const startRef = useRef<number>(Date.now())
  const rafRef = useRef<number>(0)

  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const progress = Math.min(elapsed / duration, 1)
  const dashOffset = circumference * progress

  const remaining = Math.max(0, Math.ceil(duration - elapsed))

  useEffect(() => {
    startRef.current = Date.now()

    function tick() {
      const el = (Date.now() - startRef.current) / 1000
      setElapsed(el)
      if (el >= duration) {
        setDone(true)
        onComplete()
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [duration, onComplete])

  // Color interpolation: accent → success
  const hue = done ? 160 : Math.round(260 - progress * 100)
  const strokeColor = done ? 'var(--success)' : `hsl(${hue}, 75%, 65%)`

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg
        width={size}
        height={size}
        style={{ transform: 'rotate(-90deg)', display: 'block' }}
      >
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--bg-active)"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{
            transition: 'stroke 0.3s ease',
            filter: `drop-shadow(0 0 6px ${strokeColor}88)`,
          }}
        />
      </svg>
      {/* Center content */}
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
      }}>
        {done ? (
          <span style={{ fontSize: 28, color: 'var(--success)' }}>✓</span>
        ) : (
          <>
            <span style={{
              fontSize: 32,
              fontWeight: 600,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-primary)',
              lineHeight: 1,
            }}>
              {remaining}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              sec
            </span>
          </>
        )}
      </div>
    </div>
  )
}
