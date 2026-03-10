import { useState } from 'react'
import { useAuthContext } from '../../context/AuthContext'
import Home from '../../pages/Home'
import MyList from '../../pages/MyList'
import Discover from '../../pages/Discover'
import Community from '../../pages/Community'
import Profile from '../../pages/Profile'

const TABS = [
  { id: 'home',      label: 'Home',      icon: '🏠' },
  { id: 'mylist',    label: 'My List',   icon: '📚' },
  { id: 'discover',  label: 'Discover',  icon: '✦' },
  { id: 'community', label: 'Community', icon: '💬' },
  { id: 'profile',   label: 'Profile',   icon: '👤' },
]

export default function AppShell() {
  const { user, signOut } = useAuthContext()
  const [activeTab, setActiveTab] = useState('home')

  function renderPage() {
    switch (activeTab) {
      case 'home':      return <Home />
      case 'mylist':    return <MyList />
      case 'discover':  return <Discover />
      case 'community': return <Community />
      case 'profile':   return <Profile />
      default:          return <Home />
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--rt-cream)', fontFamily: 'var(--rt-font-body)' }}>

      {/* Desktop Sidebar */}
      <nav style={{
        width: 220,
        background: 'var(--rt-white)',
        borderRight: '1px solid var(--rt-border)',
        display: 'flex',
        flexDirection: 'column',
        padding: '1.5rem 1rem',
        gap: '0.25rem',
        position: 'fixed',
        top: 0, left: 0, bottom: 0,
        zIndex: 50,
        boxShadow: 'var(--rt-s1)'
      }} className="rt-sidebar-desktop">
        <div style={{ marginBottom: '2rem', paddingLeft: '0.5rem' }}>
          <h1 style={{
            fontFamily: 'var(--rt-font-display)',
            fontSize: '1.5rem',
            fontWeight: 700,
            color: 'var(--rt-navy)',
            margin: 0
          }}>LitLoop</h1>
        </div>

        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.7rem 0.75rem',
              borderRadius: 'var(--rt-r3)',
              border: 'none',
              background: activeTab === tab.id ? 'var(--rt-amber-pale)' : 'none',
              color: activeTab === tab.id ? 'var(--rt-amber)' : 'var(--rt-t2)',
              fontFamily: 'var(--rt-font-body)',
              fontSize: '0.88rem',
              fontWeight: activeTab === tab.id ? 600 : 400,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.15s',
            }}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}

        <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--rt-border)' }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--rt-t3)', marginBottom: '0.5rem', paddingLeft: '0.5rem' }}>
            {user?.email}
          </p>
          <button
            onClick={signOut}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              padding: '0.7rem 0.75rem', borderRadius: 'var(--rt-r3)',
              border: 'none', background: 'none', color: 'var(--rt-t3)',
              fontFamily: 'var(--rt-font-body)', fontSize: '0.88rem',
              cursor: 'pointer', width: '100%', textAlign: 'left'
            }}
          >
            <span>↩</span><span>Sign out</span>
          </button>
        </div>
      </nav>

      {/* Main content */}
      <main style={{
        marginLeft: 220,
        flex: 1,
        maxWidth: 'calc(100vw - 220px)',
        minHeight: '100vh',
        paddingBottom: '5rem'
      }} className="rt-main-desktop">
        {renderPage()}
      </main>

      {/* Mobile bottom tab bar */}
      <nav style={{
        position: 'fixed',
        bottom: 0, left: 0, right: 0,
        background: 'var(--rt-white)',
        borderTop: '1px solid var(--rt-border)',
        display: 'flex',
        zIndex: 100,
        boxShadow: '0 -2px 10px rgba(26,39,68,0.07)'
      }} className="rt-tabbar-mobile">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.2rem',
              padding: '0.6rem 0.25rem',
              border: 'none',
              background: 'none',
              color: activeTab === tab.id ? 'var(--rt-amber)' : 'var(--rt-t3)',
              fontFamily: 'var(--rt-font-body)',
              fontSize: '0.6rem',
              fontWeight: activeTab === tab.id ? 600 : 400,
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: '1.2rem' }}>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}