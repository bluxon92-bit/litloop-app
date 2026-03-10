import { useAuthContext } from './context/AuthContext'
import AuthForms from './components/auth/AuthForms'

function App() {
  const { user, loading, signOut } = useAuthContext()

  if (loading) return <div style={{ padding: '2rem' }}>Loading…</div>

  if (!user) return <AuthForms />

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>LitLoop</h1>
      <p>Logged in as: {user.email}</p>
      <button onClick={signOut}>Sign out</button>
    </div>
  )
}

export default App