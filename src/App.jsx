import { useState, useEffect } from 'react'
import { useAuthContext } from './context/AuthContext'
import AuthForms from './components/auth/AuthForms'
import AppShell from './components/layout/AppShell'
import { parseIntentFromURL, saveIntent } from './lib/readingListIntent'

function App() {
  const { user, loading } = useAuthContext()

  // If we have a cached username, the user was previously logged in.
  // Show AppShell immediately rather than blocking on the Supabase session check —
  // auth context will update once the session is confirmed in the background.
  // On mobile cold-start this saves 3–5 seconds of blank loading screen.
  const [hadCachedSession] = useState(() => {
    try { return !!localStorage.getItem('ll_username') } catch { return false }
  })

  useEffect(() => {
    const urlIntent = parseIntentFromURL()
    if (urlIntent) {
      saveIntent(urlIntent)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  // True cold start — never logged in, or explicitly logged out
  if (loading && !hadCachedSession) return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'var(--rt-cream)',
      fontFamily: 'var(--rt-font-body)', color: 'var(--rt-t3)'
    }}>
      Loading…
    </div>
  )

  // Session expired or logged out — auth resolved with no user
  if (!loading && !user) return <AuthForms />

  // Returning user (optimistic) or confirmed session
  return <AppShell />
}

export default App