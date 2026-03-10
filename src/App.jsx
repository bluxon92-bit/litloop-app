import { useAuthContext } from './context/AuthContext'
import AuthForms from './components/auth/AuthForms'
import AppShell from './components/layout/AppShell'

function App() {
  const { user, loading } = useAuthContext()

  if (loading) return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--rt-cream)',
      fontFamily: 'var(--rt-font-body)',
      color: 'var(--rt-t3)'
    }}>
      Loading…
    </div>
  )

  if (!user) return <AuthForms />

  return <AppShell />
}

export default App