import { useState, useEffect, useMemo } from 'react'
import { useAuthContext } from '../../context/AuthContext'
import logoSrc from '../../assets/Litloop-logo-white-on-blue.png'

const QUOTES = [
  { text: 'A reader lives a thousand lives before he dies. The man who never reads lives only one.', attr: 'George R.R. Martin' },
  { text: 'Books are a uniquely portable magic.', attr: 'Stephen King' },
  { text: 'We read to know we are not alone.', attr: 'C.S. Lewis' },
  { text: 'A word after a word after a word is power.', attr: 'Margaret Atwood' },
  { text: 'Books and doors are the same thing. You open them, and you go through into another world.', attr: 'Jeanette Winterson' },
  { text: "I think books are like people, in the sense that they'll turn up in your life when you most need them.", attr: 'Emma Thompson' },
  { text: 'One glance at a book and you hear the voice of another person, perhaps someone dead for 1,000 years. To read is to voyage through time.', attr: 'Carl Sagan' },
  { text: "If you don't like to read, you haven't found the right book.", attr: 'J.K. Rowling' },
  { text: 'We tell ourselves stories in order to live.', attr: 'Joan Didion' },
  { text: 'Some books leave us free and some books make us free.', attr: 'Ralph Waldo Emerson' },
  { text: 'Think before you speak. Read before you think.', attr: 'Fran Lebowitz' },
  { text: 'Today a reader, tomorrow a leader.', attr: 'Margaret Fuller' },
]

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

const fieldStyle = {
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
}

const submitStyle = {
  width: '100%',
  background: 'var(--rt-amber)',
  color: '#fff',
  border: 'none',
  borderRadius: 12,
  padding: '0.88rem',
  fontFamily: 'var(--rt-font-body)',
  fontSize: '0.95rem',
  fontWeight: 700,
  marginBottom: '0.9rem',
  transition: 'opacity 0.15s',
  cursor: 'pointer',
}

const smallLink = {
  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
  fontFamily: 'var(--rt-font-body)', fontSize: '0.82rem',
}

export default function AuthForms() {
  const { signIn, signUp, resetPassword } = useAuthContext()
  const isDesktop = useIsDesktop()
  const [mode, setMode]     = useState('login')
  const [email, setEmail]   = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [msg, setMsg]       = useState(null)
  const [loading, setLoading] = useState(false)
  const quote = useMemo(() => QUOTES[Math.floor(Math.random() * QUOTES.length)], [])

  function switchMode(next) {
    setMode(next); setMsg(null)
    setEmail(''); setPassword(''); setConfirm('')
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
    <p style={{ fontSize: '0.82rem', color: msg.error ? '#991b1b' : '#166534', background: msg.error ? '#fef2f2' : '#f0fdf4', padding: '0.6rem 0.85rem', borderRadius: 10, marginBottom: '0.75rem', lineHeight: 1.5 }}>
      {msg.text}
    </p>
  )

  const heading = mode === 'forgot' ? 'Reset password' : mode === 'login' ? 'Welcome back' : 'Join Litloop'

  // Sub rendered as two lines for login, single for others
  const subEl = mode === 'login'
    ? <p style={{ fontSize: '0.9rem', color: 'var(--rt-t2)', textAlign: isDesktop ? 'left' : 'center', lineHeight: 1.65, marginBottom: '1.5rem' }}>
        Good to see you again.<br />Your reading list is waiting.
      </p>
    : mode === 'signup'
    ? <p style={{ fontSize: '0.9rem', color: 'var(--rt-t2)', textAlign: isDesktop ? 'left' : 'center', lineHeight: 1.65, marginBottom: '1.5rem' }}>
        Because books are better shared.<br />The reading tracker app built for real conversations.
      </p>
    : <p style={{ fontSize: '0.9rem', color: 'var(--rt-t2)', textAlign: isDesktop ? 'left' : 'center', lineHeight: 1.65, marginBottom: '1.5rem' }}>
        Enter your email and we'll send you a reset link.
      </p>

  // ── Inline form JSX — no nested component functions to avoid remount bug ──
  const formEl = mode === 'forgot' ? (
    <form onSubmit={handleSubmit}>
      <input type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} required style={fieldStyle}
        onFocus={e => e.target.style.borderColor = 'var(--rt-navy)'} onBlur={e => e.target.style.borderColor = 'var(--rt-border-md)'} />
      {msgEl}
      <button type="submit" disabled={loading} style={{ ...submitStyle, opacity: loading ? 0.7 : 1, cursor: loading ? 'default' : 'pointer' }}>
        {loading ? 'Sending…' : 'Send reset link'}
      </button>
    </form>
  ) : mode === 'login' ? (
    <form onSubmit={handleSubmit}>
      <input type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} required style={fieldStyle}
        onFocus={e => e.target.style.borderColor = 'var(--rt-navy)'} onBlur={e => e.target.style.borderColor = 'var(--rt-border-md)'} />
      <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required style={fieldStyle}
        onFocus={e => e.target.style.borderColor = 'var(--rt-navy)'} onBlur={e => e.target.style.borderColor = 'var(--rt-border-md)'} />
      {msgEl}
      <button type="submit" disabled={loading} style={{ ...submitStyle, opacity: loading ? 0.7 : 1, cursor: loading ? 'default' : 'pointer' }}>
        {loading ? 'Signing in…' : 'Sign in'}
      </button>
      <p style={{ textAlign: isDesktop ? 'left' : 'center', fontSize: '0.82rem', color: 'var(--rt-t3)', marginBottom: 0 }}>
        <button type="button" onClick={() => switchMode('forgot')} style={{ ...smallLink, color: 'var(--rt-t3)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
          Forgotten password?
        </button>
      </p>
    </form>
  ) : (
    <form onSubmit={handleSubmit}>
      <input type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} required style={fieldStyle}
        onFocus={e => e.target.style.borderColor = 'var(--rt-navy)'} onBlur={e => e.target.style.borderColor = 'var(--rt-border-md)'} />
      <input type="password" placeholder="Password (min. 8 characters)" value={password} onChange={e => setPassword(e.target.value)} required style={fieldStyle}
        onFocus={e => e.target.style.borderColor = 'var(--rt-navy)'} onBlur={e => e.target.style.borderColor = 'var(--rt-border-md)'} />
      <input type="password" placeholder="Confirm password" value={confirm} onChange={e => setConfirm(e.target.value)} required style={fieldStyle}
        onFocus={e => e.target.style.borderColor = 'var(--rt-navy)'} onBlur={e => e.target.style.borderColor = 'var(--rt-border-md)'} />
      {msgEl}
      <button type="submit" disabled={loading} style={{ ...submitStyle, opacity: loading ? 0.7 : 1, cursor: loading ? 'default' : 'pointer' }}>
        {loading ? 'Creating account…' : 'Create account'}
      </button>
      {mode === 'signup' && (
        <p style={{ fontSize: '0.72rem', color: 'var(--rt-t3)', textAlign: 'center', marginTop: '0.75rem', lineHeight: 1.5 }}>
          By creating an account you agree to our{' '}
          <a href="https://www.litloop.co/terms/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--rt-t3)', textDecoration: 'underline', textUnderlineOffset: 2 }}>Terms</a>
          {' '}and{' '}
          <a href="https://www.litloop.co/cookie-policy/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--rt-t3)', textDecoration: 'underline', textUnderlineOffset: 2 }}>Privacy Policy</a>.
        </p>
      )}
    </form>
  )

  const switchLinkEl = mode === 'forgot' ? (
    <p style={{ textAlign: isDesktop ? 'left' : 'center', fontSize: '0.82rem', color: 'var(--rt-t3)' }}>
      <button type="button" onClick={() => switchMode('login')} style={{ ...smallLink, color: 'var(--rt-t3)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
        Back to sign in
      </button>
    </p>
  ) : mode === 'login' ? (
    <p style={{ textAlign: isDesktop ? 'left' : 'center', fontSize: '0.82rem', color: 'var(--rt-t3)' }}>
      Don't have an account?{' '}
      <button type="button" onClick={() => switchMode('signup')} style={{ ...smallLink, color: 'var(--rt-amber)', fontWeight: 700 }}>
        Sign up free
      </button>
    </p>
  ) : (
    <p style={{ textAlign: isDesktop ? 'left' : 'center', fontSize: '0.82rem', color: 'var(--rt-t3)' }}>
      Already have an account?{' '}
      <button type="button" onClick={() => switchMode('login')} style={{ ...smallLink, color: 'var(--rt-amber)', fontWeight: 700 }}>
        Sign in
      </button>
    </p>
  )

  // ── Desktop ────────────────────────────────────────────────
  if (isDesktop) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--rt-cream)', display: 'flex', alignItems: 'stretch' }}>
        <div style={{ width: '40%', maxWidth: 460, background: 'var(--rt-navy)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '2.5rem 2.75rem', flexShrink: 0 }}>
          <img src={logoSrc} alt="Litloop" style={{ height: 28, width: 'auto', objectFit: 'contain', objectPosition: 'left' }} />
          <div>
            <p style={{ fontFamily: 'var(--rt-font-display)', fontSize: 'clamp(0.95rem, 1.6vw, 1.2rem)', fontStyle: 'italic', color: 'rgba(255,255,255,0.78)', lineHeight: 1.7, borderLeft: '3px solid var(--rt-amber)', paddingLeft: '1rem', marginBottom: '0.75rem' }}>
              "{quote.text}"
            </p>
            <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)', paddingLeft: '1rem' }}>— {quote.attr}</p>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--rt-amber)', opacity: 0.7, lineHeight: 1.5 }}>
            Free forever · No ads · No algorithms
          </p>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem 2rem' }}>
          <div style={{ width: '100%', maxWidth: 360 }}>
            <h2 style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.35rem', fontWeight: 600, color: 'var(--rt-navy)', marginBottom: '0.4rem' }}>{heading}</h2>
            {subEl}
            {formEl}
            <div style={{ marginTop: '1.25rem' }}>{switchLinkEl}</div>
          </div>
        </div>
      </div>
    )
  }

  // ── Mobile ─────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--rt-cream)', fontFamily: 'var(--rt-font-body)', display: 'flex', flexDirection: 'column' }}>

      {/* Navy hero — paddingTop accounts for notch/safe area */}
      <div style={{ background: 'var(--rt-navy)', paddingTop: 'max(3.25rem, env(safe-area-inset-top, 3.25rem))', textAlign: 'center', flexShrink: 0 }}>
        <img src={logoSrc} alt="Litloop" style={{ height: 38, width: 'auto' }} />
        <svg viewBox="0 0 400 64" preserveAspectRatio="none"
          style={{ display: 'block', width: '100%', height: 64, marginTop: '2.75rem' }}>
          <path d="M0 0 Q200 64 400 0 L400 64 L0 64 Z" fill="var(--rt-cream)" />
        </svg>
      </div>

      {/* Form — centred in remaining space */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: 400, padding: '1.5rem 1.5rem 0', boxSizing: 'border-box' }}>
            <h2 style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.35rem', fontWeight: 600, color: 'var(--rt-navy)', marginBottom: '0.4rem', textAlign: 'center' }}>
              {heading}
            </h2>
            {subEl}
            {formEl}
          </div>
        </div>

        {/* Switch link — pinned to bottom, respects safe area */}
        <div style={{ padding: '1rem 1.5rem', paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 1.5rem))', textAlign: 'center' }}>
          {switchLinkEl}
        </div>
      </div>
    </div>
  )
}