import { useState } from 'react'
import { useAuthContext } from '../../context/AuthContext'

function LogoMark() {
  return (
    <img
      src="/assets/Ltiloop-logo-b-w.png"
      alt="Litloop"
      style={{ height: 36, width: 'auto', filter: 'brightness(0) invert(1)' }}
    />
  )
}

function Field({ type = 'text', placeholder, value, onChange, required }) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      required={required}
      style={{
        width: '100%',
        boxSizing: 'border-box',
        padding: '0.8rem 1rem',
        border: '1.5px solid var(--rt-border-md)',
        borderRadius: 12,
        fontFamily: 'var(--rt-font-body)',
        fontSize: '0.95rem',
        color: 'var(--rt-navy)',
        background: 'var(--rt-white)',
        outline: 'none',
        transition: 'border-color 0.15s',
        display: 'block',
        marginBottom: '0.75rem',
      }}
      onFocus={e => e.target.style.borderColor = 'var(--rt-navy)'}
      onBlur={e => e.target.style.borderColor = 'var(--rt-border-md)'}
    />
  )
}

export default function AuthForms() {
  const { signIn, signUp, resetPassword } = useAuthContext()
  const [mode, setMode]         = useState('login')
  const [email, setEmail]       = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [msg, setMsg]           = useState(null)
  const [loading, setLoading]   = useState(false)

  function switchMode(next) {
    setMode(next)
    setMsg(null)
    setEmail(''); setPassword(''); setConfirm(''); setUsername('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setMsg(null)
    setLoading(true)

    if (mode === 'signup') {
      if (password.length < 8) {
        setMsg({ text: 'Password must be at least 8 characters.', error: true })
        setLoading(false); return
      }
      if (password !== confirm) {
        setMsg({ text: 'Passwords do not match.', error: true })
        setLoading(false); return
      }
      const { error } = await signUp(email, password)
      if (error) setMsg({ text: error.message, error: true })
      else setMsg({ text: 'Check your email to confirm your account.', error: false })
    }

    if (mode === 'login') {
      const { error } = await signIn(email, password)
      if (error) setMsg({ text: 'Incorrect email or password.', error: true })
    }

    if (mode === 'forgot') {
      const { error } = await resetPassword(email)
      if (error) setMsg({ text: error.message, error: true })
      else setMsg({ text: 'Reset link sent — check your inbox.', error: false })
    }

    setLoading(false)
  }

  const curveId = 'auth-curve'

  const heroSection = (
    <div style={{
      background: 'var(--rt-navy)',
      paddingTop: '2.25rem',
      paddingBottom: 0,
      textAlign: 'center',
      position: 'relative',
    }}>
      <LogoMark />
      {/* Curved cream drop */}
      <svg
        viewBox="0 0 400 36"
        preserveAspectRatio="none"
        style={{ display: 'block', width: '100%', height: 36, marginTop: '1.75rem' }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M0 0 Q200 36 400 0 L400 36 L0 36 Z" fill="var(--rt-cream)" />
      </svg>
    </div>
  )

  const msgEl = msg && (
    <p style={{
      fontSize: '0.82rem',
      color: msg.error ? '#991b1b' : '#166534',
      background: msg.error ? '#fef2f2' : '#f0fdf4',
      padding: '0.6rem 0.85rem',
      borderRadius: 10,
      marginBottom: '0.9rem',
      lineHeight: 1.5,
    }}>{msg.text}</p>
  )

  const submitStyle = {
    width: '100%',
    background: 'var(--rt-amber)',
    color: '#fff',
    border: 'none',
    borderRadius: 12,
    padding: '0.9rem',
    fontFamily: 'var(--rt-font-body)',
    fontSize: '0.95rem',
    fontWeight: 700,
    cursor: loading ? 'default' : 'pointer',
    opacity: loading ? 0.7 : 1,
    transition: 'opacity 0.15s',
    marginBottom: '0.75rem',
  }

  const smallLink = {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    fontFamily: 'var(--rt-font-body)',
    fontSize: '0.82rem',
  }

  // ── Forgot password ───────────────────────────────────────
  if (mode === 'forgot') {
    return (
      <div style={pageStyle}>
        {heroSection}
        <div style={formWrap}>
          <h2 style={headingStyle}>Reset password</h2>
          <p style={subStyle}>Enter your email and we'll send you a reset link.</p>
          <form onSubmit={handleSubmit}>
            <Field type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} required />
            {msgEl}
            <button type="submit" disabled={loading} style={submitStyle}>
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
          <p style={{ textAlign: 'center', fontSize: '0.82rem', color: 'var(--rt-t3)', marginTop: '0.5rem' }}>
            <button onClick={() => switchMode('login')} style={{ ...smallLink, color: 'var(--rt-t3)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
              Back to sign in
            </button>
          </p>
        </div>
      </div>
    )
  }

  // ── Login ─────────────────────────────────────────────────
  if (mode === 'login') {
    return (
      <div style={pageStyle}>
        {heroSection}
        <div style={formWrap}>
          <h2 style={headingStyle}>Welcome back</h2>
          <p style={subStyle}>Good to see you. Your reading list is waiting.</p>
          <form onSubmit={handleSubmit}>
            <Field type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} required />
            <Field type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
            {msgEl}
            <button type="submit" disabled={loading} style={submitStyle}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <p style={{ textAlign: 'center', fontSize: '0.82rem', color: 'var(--rt-t3)', marginBottom: '1.25rem' }}>
            <button onClick={() => switchMode('forgot')} style={{ ...smallLink, color: 'var(--rt-t3)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
              Forgotten password?
            </button>
          </p>
          <p style={{ textAlign: 'center', fontSize: '0.82rem', color: 'var(--rt-t3)' }}>
            Don't have an account?{' '}
            <button onClick={() => switchMode('signup')} style={{ ...smallLink, color: 'var(--rt-amber)', fontWeight: 700 }}>
              Sign up free
            </button>
          </p>
        </div>
      </div>
    )
  }

  // ── Sign up ───────────────────────────────────────────────
  return (
    <div style={pageStyle}>
      {heroSection}
      <div style={formWrap}>
        <h2 style={headingStyle}>Join Litloop</h2>
        <p style={subStyle}>Because books are better shared. The reading tracker app built for real conversations.</p>
        <form onSubmit={handleSubmit}>
          <Field type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} required />
          <Field type="text" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} required />
          <Field type="password" placeholder="Password (min. 8 characters)" value={password} onChange={e => setPassword(e.target.value)} required />
          <Field type="password" placeholder="Confirm password" value={confirm} onChange={e => setConfirm(e.target.value)} required />
          {msgEl}
          <button type="submit" disabled={loading} style={submitStyle}>
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p style={{ textAlign: 'center', fontSize: '0.82rem', color: 'var(--rt-t3)' }}>
          Already have an account?{' '}
          <button onClick={() => switchMode('login')} style={{ ...smallLink, color: 'var(--rt-amber)', fontWeight: 700 }}>
            Sign in
          </button>
        </p>
      </div>
    </div>
  )
}

const pageStyle = {
  minHeight: '100vh',
  background: 'var(--rt-cream)',
  fontFamily: 'var(--rt-font-body)',
  display: 'flex',
  flexDirection: 'column',
}

const formWrap = {
  flex: 1,
  maxWidth: 400,
  width: '100%',
  margin: '0 auto',
  padding: '1.75rem 1.5rem 3rem',
  boxSizing: 'border-box',
}

const headingStyle = {
  fontFamily: 'var(--rt-font-display)',
  fontSize: 'clamp(1.5rem, 4vw, 1.85rem)',
  fontWeight: 700,
  color: 'var(--rt-navy)',
  marginBottom: '0.4rem',
  textAlign: 'center',
}

const subStyle = {
  fontSize: '0.88rem',
  color: 'var(--rt-t2)',
  textAlign: 'center',
  lineHeight: 1.6,
  marginBottom: '1.75rem',
  maxWidth: 300,
  margin: '0 auto 1.75rem',
}