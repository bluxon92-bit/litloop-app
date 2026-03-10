import { useState, useRef, useEffect } from 'react'
import { useAuthContext } from '../../context/AuthContext'
import { useChatContext } from '../../context/ChatContext'
import { useSocialContext } from '../../context/SocialContext'
import Home from '../../pages/Home'
import MyList from '../../pages/MyList'
import Stats from '../../pages/Stats'
import Discover from '../../pages/Discover'
import Chat from '../../pages/Chat'
import Profile from '../../pages/Profile'
import AccountSettings from '../../pages/AccountSettings'
import { avatarColour, avatarInitial, timeAgo } from '../../lib/utils'

// ── SVG icons ─────────────────────────────────────────────────
function IcoHome(active) {
  const c = active ? 'var(--rt-navy)' : '#9ca3af'
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>
}
function IcoChat(active) {
  const c = active ? 'var(--rt-navy)' : '#9ca3af'
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
}
function IcoList(active) {
  const c = active ? 'var(--rt-navy)' : '#9ca3af'
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="13" y2="13"/></svg>
}
function IcoDiscover(active) {
  const c = active ? 'var(--rt-navy)' : '#9ca3af'
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/><path d="M8 11h6M11 8v6"/></svg>
}
function IcoProfile(active) {
  const c = active ? 'var(--rt-navy)' : '#9ca3af'
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
}
function IcoBell() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
}
function IcoStats() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
}

// Nav order: Home, Chat, My List, Discover, Profile
const MOBILE_TABS = [
  { id: 'home',     label: 'Home',    icon: IcoHome    },
  { id: 'chat',     label: 'Chat',    icon: IcoChat    },
  { id: 'mylist',   label: 'My List', icon: IcoList    },
  { id: 'discover', label: 'Discover',icon: IcoDiscover},
  { id: 'profile',  label: 'Profile', icon: IcoProfile },
]

const SIDEBAR_TABS = [
  { id: 'home',     label: 'Home',    icon: IcoHome    },
  { id: 'chat',     label: 'Chat',    icon: IcoChat    },
  { id: 'mylist',   label: 'My List', icon: IcoList    },
  { id: 'discover', label: 'Discover',icon: IcoDiscover},
  { id: 'profile',  label: 'Profile', icon: IcoProfile },
  { id: 'stats',    label: 'Stats',   icon: null       },
]

export default function AppShell() {
  const { user, signOut }   = useAuthContext()
  const { totalUnread }     = useChatContext()
  const { pending, feed, recs } = useSocialContext()
  const [activeTab, setActiveTab] = useState('home')
  const [notifOpen, setNotifOpen] = useState(false)
  const bellRef = useRef(null)

  function onNavigate(tab) { setActiveTab(tab) }

  // Close notif popup on outside click
  useEffect(() => {
    if (!notifOpen) return
    function handler(e) {
      if (bellRef.current && !bellRef.current.contains(e.target)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [notifOpen])

  const displayName  = user?.email?.split('@')[0] || 'Me'
  const avatarBg     = avatarColour(user?.id || 'x')
  const avatarLetter = avatarInitial(displayName)

  const notifCount = totalUnread + pending.length

  // Build notifications list
  const notifications = [
    ...pending.map(p => ({
      id: 'req-' + p.id,
      icon: '👋',
      text: `${p.displayName || p.username || 'Someone'} sent you a friend request`,
      time: p.createdAt,
      action: () => { setActiveTab('chat'); setNotifOpen(false) }
    })),
    ...(recs || []).filter(r => r.status === 'pending').slice(0, 3).map(r => ({
      id: 'rec-' + r.id,
      icon: '📚',
      text: `${r.profiles?.display_name || 'A friend'} recommended "${r.book_title || 'a book'}"`,
      time: r.created_at,
      action: () => { setActiveTab('discover'); setNotifOpen(false) }
    })),
    ...(feed || []).filter(ev => ev.event_type === 'posted_review').slice(0, 3).map(ev => ({
      id: 'feed-' + ev.id,
      icon: '⭐',
      text: `${ev.profiles?.display_name || 'A friend'} reviewed "${ev.book_title || 'a book'}"`,
      time: ev.created_at,
      action: () => { setActiveTab('home'); setNotifOpen(false) }
    })),
  ].slice(0, 8)

  function renderPage() {
    switch (activeTab) {
      case 'home':     return <Home            onNavigate={onNavigate} />
      case 'mylist':   return <MyList          onNavigate={onNavigate} />
      case 'stats':    return <Stats           onNavigate={onNavigate} />
      case 'discover': return <Discover        onNavigate={onNavigate} />
      case 'chat':     return <Chat            onNavigate={onNavigate} />
      case 'profile':  return <Profile         onNavigate={onNavigate} />
      case 'account':  return <AccountSettings onNavigate={onNavigate} />
      default:         return <Home            onNavigate={onNavigate} />
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--rt-cream)', fontFamily: 'var(--rt-font-body)' }}>

      {/* ── Desktop sidebar ─────────────────────────────── */}
      <nav className="rt-sidebar-desktop" style={{
        width: 220, background: 'var(--rt-white)', borderRight: '1px solid var(--rt-border)',
        display: 'flex', flexDirection: 'column', padding: '1.5rem 1rem', gap: '0.25rem',
        position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 50, boxShadow: 'var(--rt-s1)'
      }}>
        <div style={{ marginBottom: '2rem', paddingLeft: '0.5rem' }}>
          <h1 style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--rt-navy)', margin: 0 }}>LitLoop</h1>
        </div>

        {SIDEBAR_TABS.map(tab => {
          const isActive = activeTab === tab.id || (tab.id === 'profile' && activeTab === 'account')
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.7rem 0.75rem', borderRadius: 'var(--rt-r3)', border: 'none',
                background: isActive ? 'var(--rt-amber-pale)' : 'none',
                color: isActive ? 'var(--rt-amber)' : 'var(--rt-t2)',
                fontFamily: 'var(--rt-font-body)', fontSize: '0.88rem',
                fontWeight: isActive ? 600 : 400,
                cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', position: 'relative'
              }}
            >
              <span style={{ width: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {tab.icon ? tab.icon(isActive) : <IcoStats />}
              </span>
              <span>{tab.label}</span>
              {tab.id === 'chat' && totalUnread > 0 && (
                <span style={{ position: 'absolute', top: 6, right: 8, background: 'var(--rt-amber)', color: '#fff', borderRadius: 99, fontSize: '0.58rem', padding: '0.1em 0.45em', fontWeight: 700 }}>{totalUnread}</span>
              )}
            </button>
          )
        })}

        <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--rt-border)' }}>
          <p style={{ fontSize: '0.72rem', color: 'var(--rt-t3)', marginBottom: '0.5rem', paddingLeft: '0.5rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</p>
          <button onClick={signOut} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.7rem 0.75rem', borderRadius: 'var(--rt-r3)', border: 'none', background: 'none', color: 'var(--rt-t3)', fontFamily: 'var(--rt-font-body)', fontSize: '0.88rem', cursor: 'pointer', width: '100%' }}>
            ↩ Sign out
          </button>
        </div>
      </nav>

      {/* Desktop main */}
      <main className="rt-main-desktop" style={{ marginLeft: 220, flex: 1, width: 'calc(100vw - 220px)', minHeight: '100vh', paddingBottom: '2rem', boxSizing: 'border-box', overflow: 'hidden' }}>
        {renderPage()}
      </main>

      {/* ── Mobile top nav ──────────────────────────────── */}
      <header className="rt-topnav-mobile" style={{
        position: 'fixed', top: 0, left: 0, right: 0,
        background: 'var(--rt-white)', borderBottom: '1px solid var(--rt-border)',
        display: 'grid', gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center',
        padding: '0.65rem 1rem', zIndex: 100, boxShadow: '0 1px 6px rgba(26,39,68,0.06)'
      }}>
        {/* Left: profile avatar */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button
            onClick={() => setActiveTab('profile')}
            style={{
              background: avatarBg,
              border: (activeTab==='profile'||activeTab==='account') ? '2px solid var(--rt-amber)' : '2px solid transparent',
              borderRadius: '50%', width: 32, height: 32,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', fontFamily: 'var(--rt-font-display)',
              fontWeight: 700, color: '#fff', fontSize: '0.75rem', transition: 'border-color 0.15s'
            }}
          >{avatarLetter}</button>
        </div>

        {/* Centre: LitLoop wordmark */}
        <h1 style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.2rem', fontWeight: 700, color: 'var(--rt-navy)', margin: 0, textAlign: 'center' }}>LitLoop</h1>

        {/* Right: stats + bell */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'flex-end' }}>
          <button onClick={() => setActiveTab('stats')} style={{ background: activeTab==='stats' ? 'var(--rt-amber-pale)' : 'none', border: 'none', borderRadius: 'var(--rt-r2)', padding: '0.45rem', display: 'flex', alignItems: 'center', cursor: 'pointer', color: activeTab==='stats' ? 'var(--rt-amber)' : '#9ca3af' }}>
            <IcoStats />
          </button>

          <div ref={bellRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setNotifOpen(v => !v)}
              style={{ background: notifOpen ? 'var(--rt-surface)' : 'none', border: 'none', borderRadius: 'var(--rt-r2)', padding: '0.45rem', display: 'flex', alignItems: 'center', cursor: 'pointer', position: 'relative' }}
            >
              {IcoBell()}
              {notifCount > 0 && (
                <span style={{ position: 'absolute', top: 3, right: 3, width: 8, height: 8, borderRadius: '50%', background: 'var(--rt-amber)', border: '1.5px solid white' }}/>
              )}
            </button>

            {notifOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                width: 300, background: 'var(--rt-white)', borderRadius: 'var(--rt-r4)',
                border: '1px solid var(--rt-border)', boxShadow: '0 8px 32px rgba(26,39,68,0.15)',
                zIndex: 200, overflow: 'hidden'
              }}>
                <div style={{ padding: '0.85rem 1rem 0.6rem', borderBottom: '1px solid var(--rt-border)', fontFamily: 'var(--rt-font-display)', fontSize: '0.88rem', fontWeight: 700, color: 'var(--rt-navy)' }}>
                  Notifications
                </div>
                {notifications.length === 0 ? (
                  <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--rt-t3)', fontSize: '0.82rem' }}>
                    <div style={{ fontSize: '1.5rem', marginBottom: '0.35rem' }}>🔔</div>
                    No notifications yet.
                  </div>
                ) : (
                  notifications.map(n => (
                    <div key={n.id} onClick={n.action}
                      style={{ display: 'flex', gap: '0.65rem', padding: '0.75rem 1rem', borderBottom: '1px solid var(--rt-border)', cursor: 'pointer', alignItems: 'flex-start' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--rt-surface)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <span style={{ fontSize: '1rem', flexShrink: 0, marginTop: 1 }}>{n.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--rt-navy)', lineHeight: 1.4 }}>{n.text}</div>
                        {n.time && <div style={{ fontSize: '0.65rem', color: 'var(--rt-t3)', marginTop: '0.2rem' }}>{timeAgo(n.time)}</div>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile page content */}
      <main className="rt-main-mobile" style={{ flex: 1, paddingTop: 56, paddingBottom: 64, width: '100%' }}>
        {renderPage()}
      </main>

      {/* ── Mobile bottom tab bar ──────────────────────── */}
      <nav className="rt-tabbar-mobile" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'var(--rt-white)', borderTop: '1px solid var(--rt-border)',
        display: 'flex', zIndex: 100, boxShadow: '0 -1px 8px rgba(26,39,68,0.06)'
      }}>
        {MOBILE_TABS.map(tab => {
          const isActive = activeTab === tab.id || (tab.id === 'profile' && activeTab === 'account')
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: '0.18rem', padding: '0.6rem 0.25rem',
                border: 'none', background: 'none', cursor: 'pointer', position: 'relative'
              }}
            >
              {tab.icon(isActive)}
              <span style={{
                fontSize: '0.58rem', fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--rt-navy)' : '#9ca3af',
                fontFamily: 'var(--rt-font-body)', letterSpacing: '-0.01em'
              }}>{tab.label}</span>
              {tab.id === 'chat' && totalUnread > 0 && (
                <div style={{ position: 'absolute', top: 5, right: '50%', marginRight: -16, width: 7, height: 7, borderRadius: '50%', background: 'var(--rt-amber)', border: '1.5px solid white' }}/>
              )}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
