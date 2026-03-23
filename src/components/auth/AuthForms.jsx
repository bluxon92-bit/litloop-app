import { useState, useEffect, useMemo } from 'react'
import { useAuthContext } from '../../context/AuthContext'
import logoSrc from '../../assets/Litloop-logo-white-on-blue.png'

const QUOTES = [
  { text: 'A reader lives a thousand lives before he dies. The man who never reads lives only one.', attr: 'George R.R. Martin' },
  { text: 'Books are a uniquely portable magic.', attr: 'Stephen King' },
  { text: 'We read to know we are not alone.', attr: 'C.S. Lewis' },
  { text: 'A word after a word after a word is power.', attr: 'Margaret Atwood' },
  { text: 'Books and doors are the same thing. You open them, and you go through into another world.', attr: 'Jeanette Winterson' },
  { text: 'I think books are like people, in the sense that they\'ll turn up in your life when you most need them.', attr: 'Emma Thompson' },
  { text: 'One glance at a book and you hear the voice of another person, perhaps someone dead for 1,000 years. To read is to voyage through time.', attr: 'Carl Sagan' },
  { text: 'If you don\'t like to read, you haven\'t found the right book.', attr: 'J.K. Rowling' },
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

export default function AuthForms() {
  const { signIn, signUp, resetPassword } = useAuthContext()
  const isDesktop = useIsDesktop()
  const [mode, setMode]         = useState('login')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [msg, setMsg]           = useState(null)
  const [loading, setLoading]   = useState(false)

  // Pick a random quote once per mount — changes on each page load
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

  // ── Switch link rendered at bottom ────────────────────────
  function SwitchLink() {
    if (mode === 'forgot') return (
      <p style={{ textAlign: 'center', fontSize: '0.82rem', color: 'var(--rt-t3)' }}>
        <button onClick={() => switchMode('login')} style={{ ...smallLink, color: 'var(--rt-t3)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
          Back to sign in
        </button>
      </p>
    )
    if (mode === 'login') return (
      <p style={{ textAlign: isDesktop ? 'left' : 'center', fontSize: '0.82rem', color: 'var(--rt-t3)' }}>
        Don't have an account?{' '}
        <button onClick={() => switchMode('signup')} style={{ ...smallLink, color: 'var(--rt-amber)', fontWeight: 700 }}>
          Sign up free
        </button>
      </p>
    )
    return (
      <p style={{ textAlign: isDesktop ? 'left' : 'center', fontSize: '0.82rem', color: 'var(--rt-t3)' }}>
        Already have an account?{' '}
        <button onClick={() => switchMode('login')} style={{ ...smallLink, color: 'var(--rt-amber)', fontWeight: 700 }}>
          Sign in
        </button>
      </p>
    )
  }

  // ── Form fields only (no heading/sub — those stay above) ──
  function FormFields() {
    if (mode === 'forgot') return (
      <form onSubmit={handleSubmit}>
        <Field type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} required />
        {msgEl}
        {submitBtn('Send reset link', 'Sending…')}
      </form>
    )
    if (mode === 'login') return (
      <form onSubmit={handleSubmit}>
        <Field type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} required />
        <Field type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
        {msgEl}
        {submitBtn('Sign in', 'Signing in…')}
        <p style={{ textAlign: isDesktop ? 'left' : 'center', fontSize: '0.82rem', color: 'var(--rt-t3)', marginBottom: 0 }}>
          <button onClick={() => switchMode('forgot')} style={{ ...smallLink, color: 'var(--rt-t3)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
            Forgotten password?
          </button>
        </p>
      </form>
    )
    return (
      <form onSubmit={handleSubmit}>
        <Field type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} required />
        <Field type="password" placeholder="Password (min. 8 characters)" value={password} onChange={e => setPassword(e.target.value)} required />
        <Field type="password" placeholder="Confirm password" value={confirm} onChange={e => setConfirm(e.target.value)} required />
        {msgEl}
        {submitBtn('Create account', 'Creating account…')}
      </form>
    )
  }

  const heading = mode === 'forgot' ? 'Reset password'
    : mode === 'login' ? 'Welcome back'
    : 'Join Litloop'

  const sub = mode === 'forgot' ? 'Enter your email and we\'ll send you a reset link.'
    : mode === 'login' ? 'Good to see you. Your reading list is waiting.'
    : 'Because books are better shared. The reading tracker app built for real conversations.'

  // ── Desktop ────────────────────────────────────────────────
  if (isDesktop) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--rt-cream)', display: 'flex', alignItems: 'stretch' }}>

        {/* Left — navy panel */}
        <div style={{
          width: '40%', maxWidth: 460,
          background: 'var(--rt-navy)',
          display: 'flex', flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '2.5rem 2.75rem',
          flexShrink: 0,
        }}>
          <img src={logoSrc} alt="Litloop" style={{ height: 28, width: 'auto', objectFit: 'contain', objectPosition: 'left' }} />

          <div>
            <p style={{
              fontFamily: 'var(--rt-font-display)',
              fontSize: 'clamp(0.95rem, 1.6vw, 1.2rem)',
              fontStyle: 'italic',
              color: 'rgba(255,255,255,0.78)',
              lineHeight: 1.7,
              borderLeft: '3px solid var(--rt-amber)',
              paddingLeft: '1rem',
              marginBottom: '0.75rem',
            }}>"{quote.text}"</p>
            <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)', paddingLeft: '1rem' }}>— {quote.attr}</p>
          </div>

          <p style={{ fontSize: '0.75rem', color: 'var(--rt-amber)', opacity: 0.7, lineHeight: 1.5 }}>
            Free forever · No ads · No algorithms
          </p>
        </div>

        {/* Right — form */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem 2rem' }}>
          <div style={{ width: '100%', maxWidth: 360 }}>
            <h2 style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.6rem', fontWeight: 700, color: 'var(--rt-navy)', marginBottom: '0.4rem' }}>
              {heading}
            </h2>
            <p style={{ fontSize: '0.87rem', color: 'var(--rt-t2)', lineHeight: 1.6, marginBottom: '1.5rem' }}>{sub}</p>
            <FormFields />
            <div style={{ marginTop: '1.25rem' }}><SwitchLink /></div>
          </div>
        </div>
      </div>
    )
  }

  // ── Mobile ─────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--rt-cream)',
      fontFamily: 'var(--rt-font-body)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Navy hero with curve */}
      <div style={{ background: 'var(--rt-navy)', paddingTop: '2.5rem', textAlign: 'center', flexShrink: 0 }}>
        <img src={logoSrc} alt="Litloop" style={{ height: 36, width: 'auto' }} />
        <svg viewBox="0 0 400 48" preserveAspectRatio="none"
          style={{ display: 'block', width: '100%', height: 48, marginTop: '2.25rem' }}>
          <path d="M0 0 Q200 48 400 0 L400 48 L0 48 Z" fill="var(--rt-cream)" />
        </svg>
      </div>

      {/* Form — vertically centred in remaining space, switch link pinned to bottom */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: 400, padding: '1.5rem 1.5rem 0', boxSizing: 'border-box' }}>
            <h2 style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.75rem', fontWeight: 700, color: 'var(--rt-navy)', marginBottom: '0.4rem', textAlign: 'center' }}>
              {heading}
            </h2>
            <p style={{ fontSize: '0.87rem', color: 'var(--rt-t2)', textAlign: 'center', lineHeight: 1.6, marginBottom: '1.5rem' }}>{sub}</p>
            <FormFields />
          </div>
        </div>

        {/* Switch link — pinned to bottom, always visible */}
        <div style={{ padding: '1rem 1.5rem 2rem', textAlign: 'center' }}>
          <SwitchLink />
        </div>
      </div>
    </div>
  )
}