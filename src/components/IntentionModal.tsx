import { useState, useEffect, useRef, useCallback } from 'react'
import type { InterceptionPayload, AppSettings } from '../../shared/ipc-types'
import { CountdownRing } from './CountdownRing'
import { WordCounter } from './WordCounter'
import { IoCubeOutline } from 'react-icons/io5'

interface IntentionModalProps {
  payload: InterceptionPayload
  settings: AppSettings
}

export function IntentionModal({ payload, settings }: IntentionModalProps) {
  const [countdownDone, setCountdownDone] = useState(false)
  const [purpose, setPurpose] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const wordCount = purpose.trim() === '' ? 0 : purpose.trim().split(/\s+/).length
  const wordsMet = wordCount >= settings.minWordCount
  const canSubmit = countdownDone && wordsMet && !submitting

  const handleCountdownDone = useCallback(() => {
    setCountdownDone(true)
    setTimeout(() => textareaRef.current?.focus(), 50)
  }, [])

  // Send resume signal to main process via the preload bridge
  useEffect(() => {
    if (!submitting) return
    // After submitIntention resolves, main handles the resume via 'intention:resume' IPC
  }, [submitting])

  const handleOpen = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      await window.electronAPI.submitIntention({
        appName: payload.appName,
        exePath: payload.exePath,
        purpose,
        wordCount,
        resumed: payload.suspended,
      })
      // Resume the suspended process then close modal
      window.electronAPI.resumeIntention(payload.exePath)
    } catch (err) {
      console.error(err)
      setSubmitting(false)
    }
  }

  const handleCancel = () => {
    // Kill the suspended process and close the modal
    window.electronAPI.cancelIntention()
  }

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-base)',
      padding: 32,
      gap: 0,
    }}>
      {/* Decorative background */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(124,110,245,0.07) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div className="animate-scale-in" style={{
        width: '100%',
        maxWidth: 480,
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
        position: 'relative',
      }}>
        {/* App icon + name */}
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
          {payload.icon ? (
            <img
              src={payload.icon}
              alt={payload.appName}
              style={{
                width: 48,
                height: 48,
                objectFit: 'contain',
                marginBottom: 12,
                filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.4))',
              }}
            />
          ) : (
            <div style={{
              width: 48,
              height: 48,
              background: 'var(--bg-elevated)',
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
              margin: '0 auto 12px',
              border: '1px solid var(--border)',
            }}>
              <IoCubeOutline style={{ fontSize: 24, color: 'var(--text-muted)' }} />
            </div>
          )}
          <h1 style={{
            fontSize: 18,
            fontWeight: 600,
            color: 'var(--text-primary)',
            marginBottom: 4,
            lineHeight: 1.3,
          }}>
            Why are you opening{' '}
            <span style={{ color: 'var(--accent-bright)' }}>{payload.appName}</span>?
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            State your intention before proceeding
          </p>
        </div>

        {/* Countdown ring */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <CountdownRing
            duration={settings.countdownDelay}
            onComplete={handleCountdownDone}
            size={120}
            strokeWidth={7}
          />
        </div>

        {/* Textarea */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <textarea
            ref={textareaRef}
            value={purpose}
            onChange={e => setPurpose(e.target.value)}
            disabled={!countdownDone}
            placeholder={
              countdownDone
                ? 'Describe what you need to do…'
                : 'You\'ll be able to type in a moment…'
            }
            rows={4}
            style={{
              width: '100%',
              resize: 'none',
              fontSize: 14,
              lineHeight: 1.6,
              padding: '12px 14px',
              background: countdownDone ? 'var(--bg-elevated)' : 'var(--bg-surface)',
              border: `1px solid ${countdownDone ? 'var(--border-strong)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              cursor: countdownDone ? 'text' : 'not-allowed',
              transition: 'all 0.3s ease',
              fontFamily: 'var(--font-sans)',
            }}
          />
          <WordCounter text={purpose} minimum={settings.minWordCount} />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={handleOpen}
            disabled={!canSubmit}
            style={{
              width: '100%',
              padding: '11px 20px',
              background: canSubmit ? 'var(--accent)' : 'var(--bg-elevated)',
              color: canSubmit ? 'white' : 'var(--text-muted)',
              borderRadius: 'var(--radius-md)',
              fontSize: 14,
              fontWeight: 600,
              justifyContent: 'center',
              boxShadow: canSubmit ? '0 0 16px var(--accent-glow)' : 'none',
              transition: 'all 0.2s ease',
            }}
          >
            {submitting ? 'Opening…' : `Open ${payload.appName}`}
          </button>

          <button
            onClick={handleCancel}
            disabled={submitting}
            style={{
              width: '100%',
              padding: '11px 20px',
              background: 'transparent',
              color: 'white',
              borderRadius: 'var(--radius-md)',
              fontSize: 14,
              fontWeight: 600,
              border: '1px solid var(--border)',
              transition: 'all 0.2s ease',
              cursor: submitting ? 'not-allowed' : 'pointer',
              justifyContent: 'center',
            }}
            onMouseEnter={e => {
              if (!submitting) {
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-elevated)'
                ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)'
                ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-strong)'
              }
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
              ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'
              ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'
            }}
          >
            Don't Open
          </button>
        </div>

        {/* Fine print */}
        <p style={{
          textAlign: 'center',
          fontSize: 11,
          color: 'var(--text-muted)',
          lineHeight: 1.5,
        }}>
          Write your intention to open, or dismiss to cancel.
        </p>
      </div>
    </div>
  )
}