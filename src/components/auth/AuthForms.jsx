import { useState } from 'react'
import { useAuthContext } from '../../context/AuthContext'

export default function AuthForms() {
  const { signIn, signUp, resetPassword } = useAuthContext()
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [msg, setMsg] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setMsg(null)
    setLoading(true)

    if (mode === 'signup') {
      if (password !== confirm) {
        setMsg({ text: 'Passwords do not match', error: true })
        setLoading(false)
        return
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
      else setMsg({ text: 'Password reset email sent', error: false })
    }

    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--rt-cream)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      fontFamily: 'var(--rt-font-body)'
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{
            fontFamily: 'var(--rt-font-display)',
            fontSize: '2.5rem',
            fontWeight: 700,
            color: 'var(--rt-navy)',
            margin: 0
          }}>LitLoop</h1>
          <p style={{ color: 'var(--rt-t3)', fontSize: '0.9rem', marginTop: '0.4rem' }}>
            Your reading life, connected
          </p>
        </div>

        {/* Card */}
        <div className="rt-card" style={{ padding: '2rem' }}>

          {/* Tabs */}
          {mode !== 'forgot' && (
            <div className="rt-status-tabs" style={{ marginBottom: '1.5rem' }}>
              <button
                className={`rt-status-tab ${mode === 'login' ? 'active' : ''}`}
                onClick={() => setMode('login')}
              >Log in</button>
              <button
                className={`rt-status-tab ${mode === 'signup' ? 'active' : ''}`}
                onClick={() => setMode('signup')}
              >Sign up</button>
            </div>
          )}

          {mode === 'forgot' && (
            <div style={{ marginBottom: '1.5rem' }}>
              <button
                onClick={() => setMode('login')}
                style={{ background: 'none', border: 'none', color: 'var(--rt-t3)', cursor: 'pointer', fontSize: '0.85rem', padding: 0 }}
              >← Back to log in</button>
              <h2 style={{ fontFamily: 'var(--rt-font-display)', color: 'var(--rt-navy)', margin: '0.5rem 0 0' }}>
                Reset password
              </h2>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div className="rt-field" style={{ marginBottom: '1rem' }}>
              <label>Email</label>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>

            {mode !== 'forgot' && (
              <div className="rt-field" style={{ marginBottom: '1rem' }}>
                <label>Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
              </div>
            )}

            {mode === 'signup' && (
              <div className="rt-field" style={{ marginBottom: '1rem' }}>
                <label>Confirm password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                />
              </div>
            )}

            <button
              type="submit"
              className="rt-submit-btn"
              disabled={loading}
              style={{ marginTop: '0.5rem' }}
            >
              {loading ? 'Please wait…' : mode === 'login' ? 'Log in' : mode === 'signup' ? 'Create account' : 'Send reset email'}
            </button>
          </form>

          {msg && (
            <p style={{
              marginTop: '1rem',
              fontSize: '0.85rem',
              color: msg.error ? '#991b1b' : '#166534',
              background: msg.error ? '#fef2f2' : '#f0fdf4',
              padding: '0.6rem 0.8rem',
              borderRadius: 'var(--rt-r4)',
              margin: '1rem 0 0'
            }}>{msg.text}</p>
          )}

          {mode === 'login' && (
            <p style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.82rem', color: 'var(--rt-t3)' }}>
              <button
                onClick={() => setMode('forgot')}
                className="btn-text-link"
              >Forgot password?</button>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}