import { useState, useEffect } from 'react'
import { useAuthContext } from '../../context/AuthContext'
import logoSrc from '../../assets/Litloop-logo-white-on-blue.png'

function useIsDesktop() {
  const [desktop, setDesktop] = useState(() => window.innerWidth >= 768)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const handler = e => setDesktop(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return desktop
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
        padding: '0.78rem 1rem',
        border: '1.5px solid var(--rt-border-md)',
        borderRadius: 12,
        fontFamily: 'var(--rt-font-body)',
        fontSize: '0.92rem',
        color: 'var(--rt-navy)',
        background: 'var(--rt-white)',
        outline: 'none',
        transition: 'border-color 0.15s',
        display: 'block',
        marginBottom: '0.6rem',
      }}
      onFocus={e => e.target.style.borderColor = 'var(--rt-navy)'}
      onBlur={e => e.target.style.borderColor = 'var(--rt-border-md)'}
    />
  )
}

const QUOTES = [
  { text: 'A reader lives a thousand lives before he dies. The man who never reads lives only one.', attr: 'George R.R. Martin' },
  { text: 'Not all those who wander are lost.', attr: 'J.R.R. Tolkien' },
  { text: 'There is no friend as loyal as a book.', attr: 'Ernest Hemingway' },
]

export default function AuthForms() {
  const { signIn, signUp, resetPassword } = useAuthContext()
  const isDesktop = useIsDesktop()
  const [mode, setMode]         = useState('login')
  const [email, setEmail]       = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [msg, setMsg]           = useState(null)
  const [loading, setLoading]   = useState(false)
  const quote = QUOTES[0]

  function switchMode(next) {
    setMode(next); setMsg(null)
    setEmail(''); setPassword(''); setConfirm(''); setUsername('')
  }

  async function handleSubmit(e) {
    e.preventDefault(); setMsg(null); setLoading(true)
    if (mode === 'signup') {
      if (password.length < 8) { setMsg({ text: 'Password must be at least 8 characters.', error: true }); setLoading(false); return }
      if (password !== confirm) { setMsg({ text: 'Passwords do not match.', error: true }); setLoading(false); return }
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

  const msgEl = msg && (
    <p style={{
      fontSize: '0.82rem',
      color: msg.error ? '#991b1b' : '#166534',
      background: msg.error ? '#fef2f2' : '#f0fdf4',
      padding: '0.6rem 0.85rem',
      borderRadius: 10,
      marginBottom: '0.75rem',
      lineHeight: 1.5,
    }}>{msg.text}</p>
  )

  const submitBtn = (label, loadingLabel) => (
    <button type="submit" disabled={loading} style={{
      width: '100%',
      background: 'var(--rt-amber)',
      color: '#fff',
      border: 'none',
      borderRadius: 12,
      padding: '0.88rem',
      fontFamily: 'var(--rt-font-body)',
      fontSize: '0.95rem',
      fontWeight: 700,
      cursor: loading ? 'default' : 'pointer',
      opacity: loading ? 0.7 : 1,
      marginBottom: '0.9rem',
      transition: 'opacity 0.15s',
    }}>{loading ? loadingLabel : label}</button>
  )

  const smallLink = {
    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
    fontFamily: 'var(--rt-font-body)', fontSize: '0.82rem',
  }

  // ── Form content (shared between mobile + desktop) ─────────
  function FormContent() {
    if (mode === 'forgot') return (
      <>
        <h2 style={headingStyle(isDesktop)}>Reset password</h2>
        <p style={subStyle(isDesktop)}>Enter your email and we'll send you a reset link.</p>
        <form onSubmit={handleSubmit}>
          <Field type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} required />
          {msgEl}
          {submitBtn('Send reset link', 'Sending…')}
        </form>
        <p style={{ textAlign: 'center', fontSize: '0.82rem', color: 'var(--rt-t3)' }}>
          <button onClick={() => switchMode('login')} style={{ ...smallLink, color: 'var(--rt-t3)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
            Back to sign in
          </button>
        </p>
      </>
    )

    if (mode === 'login') return (
      <>
        <h2 style={headingStyle(isDesktop)}>Welcome back</h2>
        <p style={subStyle(isDesktop)}>Good to see you. Your reading list is waiting.</p>
        <form onSubmit={handleSubmit}>
          <Field type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} required />
          <Field type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
          {msgEl}
          {submitBtn('Sign in', 'Signing in…')}
        </form>
        <p style={{ textAlign: 'center', fontSize: '0.82rem', color: 'var(--rt-t3)', marginBottom: '0.6rem' }}>
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
      </>
    )

    return (
      <>
        <h2 style={headingStyle(isDesktop)}>Join Litloop</h2>
        <p style={subStyle(isDesktop)}>Because books are better shared. The reading tracker app built for real conversations.</p>
        <form onSubmit={handleSubmit}>
          <Field type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} required />
          <Field type="text" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} required />
          <Field type="password" placeholder="Password (min. 8 characters)" value={password} onChange={e => setPassword(e.target.value)} required />
          <Field type="password" placeholder="Confirm password" value={confirm} onChange={e => setConfirm(e.target.value)} required />
          {msgEl}
          {submitBtn('Create account', 'Creating account…')}
        </form>
        <p style={{ textAlign: 'center', fontSize: '0.82rem', color: 'var(--rt-t3)' }}>
          Already have an account?{' '}
          <button onClick={() => switchMode('login')} style={{ ...smallLink, color: 'var(--rt-amber)', fontWeight: 700 }}>
            Sign in
          </button>
        </p>
      </>
    )
  }

  // ── Desktop layout ─────────────────────────────────────────
  if (isDesktop) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'var(--rt-cream)',
        display: 'flex',
        alignItems: 'stretch',
      }}>
        {/* Left — navy brand panel */}
        <div style={{
          width: '42%',
          maxWidth: 480,
          background: 'var(--rt-navy)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '3rem 3rem 2.5rem',
          flexShrink: 0,
        }}>
          {/* Logo */}
          <img src={logoSrc} alt="Litloop" style={{ height: 38, width: 'auto' }} />

          {/* Centre content */}
          <div>
            <p style={{
              fontFamily: 'var(--rt-font-display)',
              fontSize: 'clamp(1.1rem, 2vw, 1.35rem)',
              fontStyle: 'italic',
              color: 'rgba(255,255,255,0.75)',
              lineHeight: 1.65,
              borderLeft: '3px solid var(--rt-amber)',
              paddingLeft: '1rem',
              marginBottom: '0.75rem',
            }}>"{quote.text}"</p>
            <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)', paddingLeft: '1rem' }}>— {quote.attr}</p>
          </div>

          {/* Footer */}
          <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.25)', lineHeight: 1.5 }}>
            Free forever · No ads · No algorithms
          </p>
        </div>

        {/* Right — form panel */}
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '3rem 2rem',
        }}>
          <div style={{ width: '100%', maxWidth: 380 }}>
            <FormContent />
          </div>
        </div>
      </div>
    )
  }

  // ── Mobile layout ──────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--rt-cream)',
      fontFamily: 'var(--rt-font-body)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Navy hero with curve */}
      <div style={{ background: 'var(--rt-navy)', paddingTop: '2.75rem', paddingBottom: 0, textAlign: 'center' }}>
        <img src={logoSrc} alt="Litloop" style={{ height: 38, width: 'auto' }} />
        <svg viewBox="0 0 400 48" preserveAspectRatio="none"
          style={{ display: 'block', width: '100%', height: 48, marginTop: '2.5rem' }}>
          <path d="M0 0 Q200 48 400 0 L400 48 L0 48 Z" fill="var(--rt-cream)" />
        </svg>
      </div>

      {/* Form */}
      <div style={{
        flex: 1,
        maxWidth: 400,
        width: '100%',
        margin: '0 auto',
        padding: '1.5rem 1.5rem 3rem',
        boxSizing: 'border-box',
      }}>
        <FormContent />
      </div>
    </div>
  )
}

const headingStyle = (desktop) => ({
  fontFamily: 'var(--rt-font-display)',
  fontSize: desktop ? '1.6rem' : '1.75rem',
  fontWeight: 700,
  color: 'var(--rt-navy)',
  marginBottom: '0.4rem',
  textAlign: desktop ? 'left' : 'center',
})

const subStyle = (desktop) => ({
  fontSize: '0.87rem',
  color: 'var(--rt-t2)',
  textAlign: desktop ? 'left' : 'center',
  lineHeight: 1.6,
  marginBottom: '1.5rem',
})