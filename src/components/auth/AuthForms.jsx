import { useState } from 'react'
import { useAuthContext } from '../../context/AuthContext'

export default function AuthForms() {
  const { signIn, signUp, resetPassword } = useAuthContext()
  const [mode, setMode] = useState('login') // login | signup | forgot
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
    <div style={{ maxWidth: 400, margin: '4rem auto', padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1 style={{ marginBottom: '1.5rem' }}>LitLoop</h1>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
        <button onClick={() => setMode('login')} style={{ fontWeight: mode === 'login' ? 'bold' : 'normal' }}>Log in</button>
        <button onClick={() => setMode('signup')} style={{ fontWeight: mode === 'signup' ? 'bold' : 'normal' }}>Sign up</button>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          style={{ padding: '0.5rem', fontSize: '1rem' }}
        />
        {mode !== 'forgot' && (
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            style={{ padding: '0.5rem', fontSize: '1rem' }}
          />
        )}
        {mode === 'signup' && (
          <input
            type="password"
            placeholder="Confirm password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            required
            style={{ padding: '0.5rem', fontSize: '1rem' }}
          />
        )}
        <button type="submit" disabled={loading} style={{ padding: '0.5rem', fontSize: '1rem', cursor: 'pointer' }}>
          {loading ? 'Please wait…' : mode === 'login' ? 'Log in' : mode === 'signup' ? 'Sign up' : 'Send reset email'}
        </button>
      </form>

      {msg && <p style={{ marginTop: '1rem', color: msg.error ? 'red' : 'green' }}>{msg.text}</p>}

      {mode === 'login' && (
        <p style={{ marginTop: '1rem', fontSize: '0.85rem' }}>
          <button onClick={() => setMode('forgot')} style={{ background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
            Forgot password?
          </button>
        </p>
      )}
    </div>
  )
}