import { useState, useEffect } from 'react'
import type { AppSettings, InterceptionPayload } from '../shared/ipc-types'
import { DEFAULT_SETTINGS } from '../shared/ipc-types'
import { Settings } from './pages/Settings'
import { History } from './pages/History'
import { Stats } from './pages/Stats'
import { Activity } from './pages/Activity'
import { IntentionModal } from './components/IntentionModal'
import { ToastContainer } from './components/Toast'
import { IoSettingsSharp, IoDocumentText, IoBarChart, IoStopwatch, IoPause, IoPlay, IoRemove, IoCopyOutline, IoClose } from 'react-icons/io5'
import './styles/global.css'

type Tab = 'settings' | 'history' | 'stats' | 'activity'

const isModal = new URLSearchParams(window.location.search).get('modal') === 'true'

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [activeTab, setActiveTab] = useState<Tab>('settings')
  const [interception, setInterception] = useState<InterceptionPayload | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!window.electronAPI) {
 
      const retryTimer = setTimeout(() => {
        window.electronAPI?.getSettings().then(s => {
          setSettings(s)
          setLoading(false)
          document.documentElement.classList.toggle('light-mode', !s.darkMode)
        }).catch(() => setLoading(false))
      }, 300)
      return () => clearTimeout(retryTimer)
    }
    window.electronAPI.getSettings().then(s => {
      setSettings(s)
      setLoading(false)
      document.documentElement.classList.toggle('light-mode', !s.darkMode)
    }).catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    const unsub = window.electronAPI?.onSettingsUpdated((s) => {
      setSettings(s)
      document.documentElement.classList.toggle('light-mode', !s.darkMode)
    })
    return unsub
  }, [])

  useEffect(() => {
    if (!isModal) return

    // Subscribe to future events
    const unsub = window.electronAPI?.onInterceptionStart((payload) => {
      setInterception(payload)
    })

    // Actively fetch in case the event already fired before this listener registered
    // (race condition: did-finish-load can precede React useEffect subscription)
    window.electronAPI?.getCurrentInterception?.().then((payload) => {
      if (payload) setInterception(payload)
    }).catch(() => {})

    return unsub
  }, [])

  const handleSave = async (partial: Partial<AppSettings>) => {
    const updated = await window.electronAPI?.setSettings(partial)
    if (updated) {
      setSettings(updated)
      document.documentElement.classList.toggle('light-mode', !updated.darkMode)
    }
  }

  // ── Modal mode ──────────────────────────────────────────────────────────────
  if (isModal) {
    if (!interception) {
      return (
        <div style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-base)',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-sans)',
        }}>
          Waiting for interception data…
        </div>
      )
    }
    return (
      <>
        <IntentionModal payload={interception} settings={settings} />
        <ToastContainer />
      </>
    )
  }

  if (loading) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-base)',
        color: 'var(--text-muted)',
        fontSize: 13,
        fontFamily: 'Segoe UI, system-ui, sans-serif',
      }}>
        Loading…
      </div>
    )
  }

  // ── Main window ─────────────────────────────────────────────────────────────
  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-base)',
      overflow: 'hidden',
    }}>
      {/* Custom Titlebar */}
      <div
        className="titlebar-drag"
        style={{
          height: 44,
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 16,
          paddingRight: 8,
          flexShrink: 0,
          gap: 12,
        }}
      >
   
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        
          <span style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-primary)',
            letterSpacing: '-0.01em',
          }}>
            FocusGate
          </span>
        </div>

     
        <div className="titlebar-no-drag" style={{
          padding: '3px 8px',
          borderRadius: 20,
          fontSize: 11,
          fontWeight: 500,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          background: settings.isPaused ? 'rgba(245,166,35,0.15)' : 'var(--success-dim)',
          color: settings.isPaused ? 'var(--warning)' : 'var(--success)',
          border: `1px solid ${settings.isPaused ? 'rgba(245,166,35,0.3)' : 'rgba(78,203,141,0.3)'}`,
          cursor: 'pointer',
        }}
        onClick={() => {
          window.electronAPI?.pauseToggle().then(() => window.electronAPI?.getSettings().then(s => {
            setSettings(s)
          }))
        }}
        >
          {settings.isPaused ? <><IoPause style={{ fontSize: 11 }} /> Paused</> : <><IoPlay style={{ fontSize: 9 }} /> Active</>}
        </div>
 
        <div style={{ flex: 1 }} />
 
<div className="titlebar-no-drag" style={{ display: 'flex', marginRight: -8 }}>
 
  <button
    onClick={() => window.electronAPI?.windowMinimize()}
    style={{
      width: 46, height: 44, border: 'none', background: 'transparent',
      color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'background 0.1s',
    }}
    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
  >
    <IoRemove style={{ fontSize: 16 }} />
  </button>

 
  <button
    onClick={() => window.electronAPI?.windowMaximize()}
    style={{
      width: 46, height: 44, border: 'none', background: 'transparent',
      color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'background 0.1s',
    }}
    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
  >
    <IoCopyOutline style={{ fontSize: 14 }} />
  </button>
 
  <button
    onClick={() => window.electronAPI?.windowClose()}
    style={{
      width: 46, height: 44, border: 'none', background: 'transparent',
      color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'background 0.1s',
    }}
    onMouseEnter={e => {
      e.currentTarget.style.background = '#c42b1c'
      e.currentTarget.style.color = '#fff'
    }}
    onMouseLeave={e => {
      e.currentTarget.style.background = 'transparent'
      e.currentTarget.style.color = 'var(--text-muted)'
    }}
  >
    <IoClose style={{ fontSize: 16 }} />
  </button>
</div>
      </div>
 
      <div style={{
        display: 'flex',
        gap: 2,
        padding: '8px 24px 0',
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        {(['settings', 'history', 'stats', 'activity'] as Tab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '8px 16px',
              background: 'transparent',
              color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-muted)',
              fontSize: 13,
              fontWeight: activeTab === tab ? 600 : 400,
              borderRadius: '6px 6px 0 0',
              borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1,
              transition: 'color 0.15s, border-color 0.15s',
              textTransform: 'capitalize',
            }}
            onMouseEnter={e => {
              if (activeTab !== tab) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'
            }}
            onMouseLeave={e => {
              if (activeTab !== tab) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {tab === 'settings' ? <IoSettingsSharp style={{ fontSize: 14 }} /> : tab === 'history' ? <IoDocumentText style={{ fontSize: 14 }} /> : tab === 'stats' ? <IoBarChart style={{ fontSize: 14 }} /> : <IoStopwatch style={{ fontSize: 14 }} />}
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </span>
          </button>
        ))}
      </div> 
      <div style={{ flex: 1, overflow: 'hidden', paddingTop: 16 }}>
        {activeTab === 'settings' && (
          <Settings settings={settings} onSave={handleSave} />
        )}
        {activeTab === 'history' && <History />}
        {activeTab === 'stats' && <Stats />}
        {activeTab === 'activity' && <Activity />}
      </div>

      <ToastContainer />
    </div>
  )
}