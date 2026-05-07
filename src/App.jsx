import { useEffect } from 'react'
import { useAuthContext } from './context/AuthContext'
import { useBooksContext } from './context/BooksContext'
import AuthForms from './components/auth/AuthForms'
import AppShell from './components/layout/AppShell'
import { parseIntentFromURL, saveIntent, loadIntent, clearIntent } from './lib/readingListIntent'

function App() {
  const { user, loading } = useAuthContext()

  // On mount: read URL params and either fire the action (if logged in)
  // or persist to localStorage for after auth completes.
  useEffect(() => {
    const urlIntent = parseIntentFromURL()
    if (urlIntent) {
      saveIntent(urlIntent)
      // Clean the URL so params don't persist visually
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  if (loading) return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'var(--rt-cream)',
      fontFamily: 'var(--rt-font-body)', color: 'var(--rt-t3)'
    }}>
      Loading…
    </div>
  )

  if (!user) return <AuthForms />
  return <AppShell />
}

export default App
