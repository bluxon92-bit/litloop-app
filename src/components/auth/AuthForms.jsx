import { useState } from 'react'
import { useAuthContext } from '../../context/AuthContext'

const FEATURES = [
  { icon: '✦', title: 'AI recommendations', desc: 'Claude reads your full history and finds books matched to your taste.' },
  { icon: '☁', title: 'Sync everywhere', desc: 'Phone, tablet, laptop — all in sync automatically.' },
  { icon: '💬', title: 'Book conversations', desc: 'Chat with friends about books you\'re both reading.' },
  { icon: '📚', title: 'My List', desc: 'Save books to read later and never forget a recommendation.' },
]

function Field({ label, sub, ...props }) {
  return (
    <div style={{ marginBottom: '1.1rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginBottom: '0.35rem' }}>
        <label style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)' }}>{label}</label>
        {sub && <span style={{ fontSize: '0.65rem', color: 'var(--rt-t3)', fontWeight: 400 }}>{sub}</span>}
      </div>
      <input
        {...props}
        style={{
          width: '100%', boxSizing: 'border-box',
          padding: '0.85rem 1rem',
          border: '1.5px solid var(--rt-border-md)',
          borderRadius: 'var(--rt-r3)',
          fontFamily: 'var(--rt-font-body)', fontSize: '0.95rem',
          color: 'var(--rt-navy)', background: 'var(--rt-white)',
          outline: 'none', transition: 'border-color 0.15s',
        }}
        onFocus={e => e.target.style.borderColor = 'var(--rt-navy)'}
        onBlur={e => e.target.style.borderColor = 'var(--rt-border-md)'}
      />
    </div>
  )
}

export default function AuthForms() {
  const { signIn, signUp, resetPassword } = useAuthContext()
  const [mode, setMode]       = useState('signup')   // 'signup' | 'login' | 'forgot'
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [msg, setMsg]         = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setMsg(null)
    setLoading(true)

    if (mode === 'signup') {
      if (password.length < 8) {
        setMsg({ text: 'Password must be at least 8 characters', error: true })
        setLoading(false); return
      }
      if (password !== confirm) {
        setMsg({ text: 'Passwords do not match', error: true })
        setLoading(false); return
      }
      const { error } = await signUp(email, password)
      if (error) setMsg({ text: error.message, error: true })
      else setMsg({ text: 'Check your email to confirm your account', error: false })
    }

    if (mode === 'login') {
      const { error } = await signIn(email, password)
      if (error) setMsg({ text: error.message, error: true })
    }

    if (mode === 'forgot') {
      const { error } = await resetPassword(email)
      if (error) setMsg({ text: error.message, error: true })
      else setMsg({ text: 'Password reset email sent — check your inbox', error: false })
    }

    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--rt-cream)',
      fontFamily: 'var(--rt-font-body)',
      display: 'flex',
      flexDirection: 'column',
      overflowX: 'hidden',
      boxSizing: 'border-box',
    }}>

      {/* ── Navy hero panel ── */}
      <div style={{
        background: 'linear-gradient(160deg, #111C35 0%, #1a2744 55%, #243A5E 100%)',
        padding: 'clamp(2rem, 5vw, 3.5rem) clamp(1.25rem, 5vw, 3rem) clamp(1.75rem, 4vw, 2.5rem)',
        textAlign: 'center',
        boxSizing: 'border-box',
        width: '100%',
      }}>
        {/* LitLoop wordmark — replace with logo when ready */}
        <div style={{
          fontFamily: 'var(--rt-font-display)',
          fontSize: 'clamp(2rem, 5vw, 2.8rem)',
          fontWeight: 700,
          color: '#fff',
          letterSpacing: '-0.02em',
          marginBottom: '0.3rem',
        }}>LitLoop</div>

        <p style={{
          color: 'rgba(255,255,255,0.55)',
          fontSize: 'clamp(0.82rem, 2vw, 0.95rem)',
          margin: '0 0 clamp(1.5rem, 4vw, 2rem)',
          lineHeight: 1.5,
        }}>
          {mode === 'signup' ? 'Create a free account to unlock everything.' : 'Welcome back — sign in to continue.'}
        </p>

        {/* Feature grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
          gap: '0.65rem',
          maxWidth: 640,
          margin: '0 auto',
          width: '100%',
          boxSizing: 'border-box',
        }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 12,
              padding: '0.85rem 1rem',
              textAlign: 'left',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                <span style={{ fontSize: '1rem', opacity: 0.85 }}>{f.icon}</span>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>{f.title}</span>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', margin: 0, lineHeight: 1.45 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Form area ── */}
      <div style={{ flex: 1, maxWidth: 640, width: '100%', margin: '0 auto', padding: 'clamp(0rem, 3vw, 1.5rem) clamp(1.25rem, 5vw, 2rem) 3rem' }}>

        {mode === 'forgot' ? (
          /* ── Forgot password ── */
          <div style={{ paddingTop: '1.5rem' }}>
            <button onClick={() => { setMode('login'); setMsg(null) }}
              style={{ background: 'none', border: 'none', color: 'var(--rt-t3)', cursor: 'pointer', fontSize: '0.85rem', padding: 0, marginBottom: '1.25rem', display: 'block' }}>
              ← Back to sign in
            </button>
            <h2 style={{ fontFamily: 'var(--rt-font-display)', color: 'var(--rt-navy)', margin: '0 0 1.25rem', fontSize: '1.25rem' }}>Reset your password</h2>
            <form onSubmit={handleSubmit}>
              <Field label="Email" type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)} required />
              {msg && <p style={{ fontSize: '0.83rem', color: msg.error ? '#991b1b' : '#166534', background: msg.error ? '#fef2f2' : '#f0fdf4', padding: '0.6rem 0.8rem', borderRadius: 'var(--rt-r4)', margin: '0 0 1rem' }}>{msg.text}</p>}
              <button type="submit" disabled={loading}
                style={{ width: '100%', background: 'var(--rt-navy)', color: '#fff', border: 'none', borderRadius: 'var(--rt-r3)', padding: '0.9rem', fontFamily: 'var(--rt-font-body)', fontSize: '0.95rem', fontWeight: 700, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Sending…' : 'Send reset email'}
              </button>
            </form>
          </div>
        ) : (
          <>
            {/* ── Full-width tabs ── */}
            <div style={{ display: 'flex', borderBottom: '2px solid var(--rt-border)', marginBottom: '1.5rem' }}>
              {[['signup', 'Create account'], ['login', 'Sign in']].map(([id, label]) => (
                <button key={id} onClick={() => { setMode(id); setMsg(null) }}
                  style={{
                    flex: 1, fontFamily: 'var(--rt-font-body)', fontSize: '0.9rem',
                    fontWeight: mode === id ? 700 : 500,
                    color: mode === id ? 'var(--rt-navy)' : 'var(--rt-t3)',
                    background: 'none', border: 'none',
                    borderBottom: `2.5px solid ${mode === id ? 'var(--rt-amber)' : 'transparent'}`,
                    marginBottom: -2, padding: '0.85rem 0.5rem',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >{label}</button>
              ))}
            </div>

            {/* ── Form ── */}
            <form onSubmit={handleSubmit}>
              <Field label="Email" type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)} required />

              {mode !== 'forgot' && (
                <Field
                  label="Password"
                  sub={mode === 'signup' ? '(min 8 characters)' : null}
                  type="password"
                  placeholder="Choose a password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
              )}

              {mode === 'signup' && (
                <Field label="Confirm password" type="password" placeholder="Repeat your password" value={confirm} onChange={e => setConfirm(e.target.value)} required />
              )}

              {msg && (
                <p style={{ fontSize: '0.83rem', color: msg.error ? '#991b1b' : '#166534', background: msg.error ? '#fef2f2' : '#f0fdf4', padding: '0.65rem 0.9rem', borderRadius: 'var(--rt-r4)', margin: '0 0 1rem', lineHeight: 1.5 }}>{msg.text}</p>
              )}

              <button type="submit" disabled={loading}
                style={{
                  width: '100%', background: 'var(--rt-navy)', color: '#fff',
                  border: 'none', borderRadius: 'var(--rt-r3)', padding: '0.95rem',
                  fontFamily: 'var(--rt-font-body)', fontSize: '0.95rem', fontWeight: 700,
                  cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1,
                  marginTop: '0.25rem',
                }}>
                {loading ? 'Please wait…' : mode === 'signup' ? 'Create free account →' : 'Sign in →'}
              </button>
            </form>

            {mode === 'login' && (
              <p style={{ marginTop: '1.1rem', textAlign: 'center', fontSize: '0.82rem', color: 'var(--rt-t3)' }}>
                <button onClick={() => { setMode('forgot'); setMsg(null) }}
                  style={{ background: 'none', border: 'none', color: 'var(--rt-t3)', cursor: 'pointer', fontSize: '0.82rem', textDecoration: 'underline', padding: 0 }}>
                  Forgot password?
                </button>
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
