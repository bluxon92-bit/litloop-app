// src/components/ReportSheet.jsx
//
// Reusable bottom-sheet for reporting content or users.
// Props:
//   open          — boolean
//   onClose       — () => void
//   onSubmit      — (reason, note) => Promise<void>
//   title         — string, e.g. "Report comment" (default: "Report")
//   description   — optional string shown below title

import { useState } from 'react'

const REASONS = [
  { value: 'harassment',    label: 'Harassment or bullying' },
  { value: 'spam',          label: 'Spam or unwanted messages' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'other',         label: 'Something else' },
]

export default function ReportSheet({ open, onClose, onSubmit, title = 'Report', description }) {
  const [reason, setReason]   = useState('')
  const [note, setNote]       = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone]       = useState(false)

  if (!open) return null

  async function handleSubmit() {
    if (!reason || sending) return
    setSending(true)
    await onSubmit(reason, note.trim() || null)
    setSending(false)
    setDone(true)
  }

  function handleClose() {
    setReason(''); setNote(''); setDone(false)
    onClose()
  }

  return (
    <>
      <div className="rt-report-backdrop" onClick={e => { if (e.target === e.currentTarget) handleClose() }}>
        <div className="rt-report-sheet">

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div>
              <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.05rem', fontWeight: 700, color: 'var(--rt-navy)', marginBottom: description ? '0.2rem' : 0 }}>
                {title}
              </div>
              {description && (
                <div style={{ fontSize: '0.78rem', color: 'var(--rt-t3)' }}>{description}</div>
              )}
            </div>
            <button onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--rt-t3)', padding: '0 0 0 1rem', lineHeight: 1 }}>×</button>
          </div>

          {done ? (
            <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.6rem' }}>✓</div>
              <div style={{ fontWeight: 700, color: 'var(--rt-navy)', marginBottom: '0.4rem' }}>Report submitted</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--rt-t3)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
                Thanks for letting us know. We review all reports and will take action where needed.
              </div>
              <button onClick={handleClose} style={{ background: 'var(--rt-navy)', color: '#fff', border: 'none', borderRadius: 'var(--rt-r3)', padding: '0.65rem 2rem', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer' }}>
                Done
              </button>
            </div>
          ) : (
            <>
              {/* Reason selection */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                {REASONS.map(r => (
                  <button
                    key={r.value}
                    onClick={() => setReason(r.value)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.65rem',
                      padding: '0.7rem 0.85rem',
                      borderRadius: 'var(--rt-r3)',
                      border: reason === r.value ? '1.5px solid var(--rt-navy)' : '1px solid var(--rt-border-md)',
                      background: reason === r.value ? 'var(--rt-surface)' : 'var(--rt-bg)',
                      cursor: 'pointer', textAlign: 'left',
                      fontSize: '0.85rem', fontWeight: reason === r.value ? 700 : 400,
                      color: 'var(--rt-navy)',
                      transition: 'border 0.1s',
                    }}
                  >
                    <span style={{
                      width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                      border: reason === r.value ? '4px solid var(--rt-navy)' : '1.5px solid var(--rt-border-md)',
                      background: 'var(--rt-bg)',
                    }} />
                    {r.label}
                  </button>
                ))}
              </div>

              {reason === 'other' && (
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--rt-t2)', marginBottom: '0.35rem' }}>
                    Tell us more (optional)
                  </label>
                  <textarea
                    className="rt-textarea"
                    rows={3}
                    placeholder="Describe the issue…"
                    value={note}
                    onChange={e => setNote(e.target.value.slice(0, 500))}
                    style={{ width: '100%', resize: 'none' }}
                  />
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={!reason || sending}
                style={{
                  width: '100%', padding: '0.75rem', borderRadius: 'var(--rt-r3)', border: 'none',
                  fontWeight: 700, fontSize: '0.9rem',
                  background: reason && !sending ? 'var(--rt-navy)' : 'var(--rt-border-md)',
                  color: reason && !sending ? '#fff' : 'var(--rt-t3)',
                  cursor: reason && !sending ? 'pointer' : 'not-allowed',
                  transition: 'background 0.15s',
                }}
              >
                {sending ? 'Submitting…' : 'Submit report'}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  )
}