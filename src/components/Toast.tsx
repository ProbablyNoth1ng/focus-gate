import { useEffect, useState } from 'react'

export interface ToastMessage {
  id: number
  text: string
  type?: 'success' | 'error' | 'info'
}

let nextId = 0
type ToastListener = (msg: ToastMessage) => void
const listeners: ToastListener[] = []

export function showToast(text: string, type: ToastMessage['type'] = 'success') {
  const msg: ToastMessage = { id: nextId++, text, type }
  listeners.forEach(l => l(msg))
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  useEffect(() => {
    const handler: ToastListener = (msg) => {
      setToasts(prev => [...prev, msg])
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== msg.id))
      }, 2200)
    }
    listeners.push(handler)
    return () => {
      const idx = listeners.indexOf(handler)
      if (idx >= 0) listeners.splice(idx, 1)
    }
  }, [])

  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      right: 20,
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      pointerEvents: 'none',
    }}>
      {toasts.map(toast => (
        <div
          key={toast.id}
          className="animate-fade-in"
          style={{
            background: toast.type === 'error' ? 'var(--danger-dim)' : 'var(--bg-elevated)',
            border: `1px solid ${toast.type === 'error' ? 'var(--danger)' : toast.type === 'success' ? 'var(--success)' : 'var(--border-strong)'}`,
            borderRadius: 'var(--radius-sm)',
            padding: '8px 14px',
            fontSize: 13,
            color: 'var(--text-primary)',
            boxShadow: 'var(--shadow-md)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            animation: 'fadeIn 0.2s ease, fadeOut 0.3s ease 1.9s forwards',
          }}
        >
          <span style={{
            color: toast.type === 'error' ? 'var(--danger)' : toast.type === 'success' ? 'var(--success)' : 'var(--accent)',
          }}>
            {toast.type === 'error' ? '✕' : toast.type === 'success' ? '✓' : 'ℹ'}
          </span>
          {toast.text}
        </div>
      ))}
    </div>
  )
}
