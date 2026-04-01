import { useState, useRef, useEffect } from 'react'
import { useAuthContext } from '../../context/AuthContext'
import { useChatContext } from '../../context/ChatContext'
import { useSocialContext } from '../../context/SocialContext'
import { startBackgroundImport } from '../../lib/importManager'
import { useBooksContext } from '../../context/BooksContext'
import Home from '../../pages/Home'
import MyList from '../../pages/MyList'
import Stats from '../../pages/Stats'
import Discover from '../../pages/Discover'
import Chat, { ChatThreadModal } from '../../pages/Chat'
import MomentComposer from '../MomentComposer'
import Profile from '../../pages/Profile'
import AccountSettings from '../../pages/AccountSettings'
import AddBookModal from '../books/AddBookModal'
import { avatarColour, avatarInitial, timeAgo } from '../../lib/utils'
import { sb } from '../../lib/supabase'
import { IcoBook, IcoChat as IcoChatBubble, IcoUsers as IcoUsersGroup } from '../icons'
import logo from '../../assets/Ltiloop-logo-b-w.png'
import { isNative, registerFcmToken, removeFcmListeners, setupFcmListeners } from '../../lib/fcmManager'

// ── SVG icons ─────────────────────────────────────────────────
function IcoHome(active) {
  const c = active ? 'var(--rt-navy)' : '#9ca3af'
  return <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>
}
function IcoChat(active) {
  const c = active ? 'var(--rt-navy)' : '#9ca3af'
  return <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
}
function IcoList(active) {
  const c = active ? 'var(--rt-navy)' : '#9ca3af'
  return <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="13" y2="13"/></svg>
}
function IcoDiscover(active) {
  const c = active ? 'var(--rt-navy)' : '#9ca3af'
  return <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/><path d="M8 11h6M11 8v6"/></svg>
}
function IcoProfile(active) {
  const c = active ? 'var(--rt-navy)' : '#9ca3af'
  return <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
}
function IcoBell() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
}
function IcoStats() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
}

// Nav order: Home, Discover, My List, Chat, Profile
const MOBILE_TABS = [
  { id: 'home',     label: 'Home',    icon: IcoHome    },
  { id: 'discover', label: 'Discover',icon: IcoDiscover},
  { id: 'mylist',   label: 'My List', icon: IcoList    },
  { id: 'chat',     label: 'Chat',    icon: IcoChat    },
  { id: 'profile',  label: 'Profile', icon: IcoProfile },
]

const SIDEBAR_TABS = [
  { id: 'home',     label: 'Home',    icon: IcoHome    },
  { id: 'chat',     label: 'Chat',    icon: IcoChat    },
  { id: 'mylist',   label: 'My List', icon: IcoList    },
  { id: 'discover', label: 'Discover',icon: IcoDiscover},
  { id: 'stats',    label: 'Stats',   icon: null       },
  { id: 'profile',  label: 'Profile', icon: IcoProfile },
]

// ── Shared FAB modal wrapper ───────────────────────────────────
// Mobile: slides up as a bottom sheet.
// Desktop (≥768px): centred popup with fixed max-width.
function FabModal({ onClose, children, maxWidth = 480 }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 300, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      className="fab-modal-backdrop"
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--rt-white)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth, boxSizing: 'border-box' }}
        className="fab-modal-sheet"
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

// ── FAB: Add Friend modal ─────────────────────────────────────
function FabFriendModal({ onClose, sendFriendRequest, generateInviteLink }) {
  const { user } = useAuthContext()
  const { friends, outgoingPending } = useSocialContext()
  const [input, setInput]               = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching]       = useState(false)
  // Initialise with already-sent outgoing requests so re-opening the modal
  // correctly shows those users as "Sent" rather than re-enabling the Add button
  const [sentRequests, setSentRequests] = useState(() => new Set((outgoingPending || []).map(f => f.userId)))
  const [msg, setMsg]                   = useState(null)
  const [copied, setCopied]             = useState(false)
  const searchTimer                     = useRef(null)

  function handleInput(val) {
    setInput(val)
    setMsg(null)
    clearTimeout(searchTimer.current)
    if (val.trim().length < 2) { setSearchResults([]); return }
    setSearching(true)
    searchTimer.current = setTimeout(async () => {
      try {
        const { data } = await sb.rpc('search_users', { p_query: val.trim().replace(/^@/, ''), p_current_user_id: user?.id, p_limit: 8 })
        setSearchResults(data || [])
      } catch { setSearchResults([]) }
      setSearching(false)
    }, 350)
  }

  async function sendTo(username, userId) {
    const { error } = await sendFriendRequest(username)
    if (error) setMsg({ type: 'error', text: error })
    else setSentRequests(prev => new Set([...prev, userId]))
  }

  async function handleCopy() {
    const link = await generateInviteLink()
    if (link) {
      try { await navigator.clipboard.writeText(link) } catch {}
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <FabModal onClose={onClose}>
      <div style={{ padding: '1.5rem 1.25rem', paddingBottom: 'max(2rem, env(safe-area-inset-bottom, 2rem))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1rem', fontWeight: 600, color: 'var(--rt-navy)' }}>Add a friend</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--rt-t3)' }}>×</button>
        </div>

        {/* Fuzzy search */}
        <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.5rem' }}>Search by name or handle</div>
        <div style={{ position: 'relative', marginBottom: '0.5rem' }}>
          <input
            className="rt-input" style={{ width: '100%', boxSizing: 'border-box' }}
            placeholder="Search by name or @handle…"
            value={input} onChange={e => handleInput(e.target.value)}
            autoFocus autoComplete="off"
          />
          {searching && <div style={{ position: 'absolute', right: '0.9rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: 'var(--rt-t3)' }}>Searching…</div>}
        </div>

        {searchResults.length > 0 && (
          <div style={{ border: '0.5px solid var(--rt-border-md)', borderRadius: 'var(--rt-r3)', overflow: 'hidden', marginBottom: '1rem' }}>
            {searchResults.map((f, i) => {
              const alreadyFriend = friends.some(fr => fr.userId === f.id)
              const sent = sentRequests.has(f.id)
              return (
                <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.6rem 0.85rem', borderBottom: i < searchResults.length - 1 ? '0.5px solid var(--rt-border)' : 'none', background: 'var(--rt-white)' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: avatarColour(f.id), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 700, color: '#fff', flexShrink: 0, overflow: 'hidden' }}>
                    {f.avatar_url ? <img src={f.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : avatarInitial(f.display_name || f.username)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--rt-navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.display_name || f.username}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--rt-t3)' }}>@{f.username}{f.mutual_friends > 0 ? ` · ${f.mutual_friends} mutual` : ''}</div>
                  </div>
                  {alreadyFriend ? (
                    <span style={{ fontSize: '0.72rem', color: 'var(--rt-t3)', fontWeight: 600 }}>Friends</span>
                  ) : (
                    <button onClick={() => sendTo(f.username, f.id)} disabled={sent}
                      style={{ flexShrink: 0, background: sent ? 'var(--rt-surface)' : 'var(--rt-amber)', color: sent ? 'var(--rt-t3)' : '#fff', border: 'none', borderRadius: 99, padding: '0.25rem 0.75rem', fontSize: '0.72rem', fontWeight: 700, cursor: sent ? 'default' : 'pointer' }}>
                      {sent ? 'Sent ✓' : 'Add'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {msg && <div style={{ fontSize: '0.82rem', color: msg.type === 'error' ? '#dc2626' : 'var(--rt-teal)', fontWeight: 600, marginBottom: '0.75rem' }}>{msg.text}</div>}

        {/* Invite block */}
        <div style={{ background: 'var(--rt-navy)', borderRadius: 'var(--rt-r3)', padding: '1rem 1.25rem', marginTop: '0.5rem' }}>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', marginBottom: '0.35rem' }}>Invite your friends to LitLoop</div>
          <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5, marginBottom: '0.85rem' }}>
            Recommend and chat about your favourite stories. Because books are better shared.
          </div>
          <button onClick={handleCopy} style={{ width: '100%', background: copied ? 'var(--rt-teal)' : 'var(--rt-amber)', color: '#fff', border: 'none', borderRadius: 8, padding: '0.65rem 1rem', textAlign: 'center', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', transition: 'background 0.2s' }}>
            {copied ? '✓ Copied!' : 'Copy invite link'}
          </button>
        </div>
      </div>
    </FabModal>
  )
}

// ── FAB: Recommend modal ──────────────────────────────────────
function FabRecommendModal({ books, friends, user, recs, sendRecommendation, onClose }) {
  const [step, setStep]         = useState('book') // 'book' | 'friends'
  const [search, setSearch]     = useState('')
  const [selectedBook, setSelectedBook] = useState(null)
  const [selectedFriends, setSelectedFriends] = useState(new Set())
  const [note, setNote]         = useState('')
  const [sending, setSending]   = useState(false)
  const [sent, setSent]         = useState(false)

  const readBooks = books.filter(b => b.status === 'read' || b.status === 'reading' || b.status === 'tbr')
  const filtered = search.trim()
    ? readBooks.filter(b => b.title.toLowerCase().includes(search.toLowerCase()) || (b.author || '').toLowerCase().includes(search.toLowerCase()))
    : readBooks

  const alreadySentTo = new Set(
    (recs || []).filter(r => r.from_user_id === user?.id && (r.book_ol_key === selectedBook?.olKey || r.book_title === selectedBook?.title)).map(r => r.to_user_id)
  )

  function toggleFriend(id) {
    if (alreadySentTo.has(id)) return
    setSelectedFriends(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function handleSend() {
    if (!selectedFriends.size || !selectedBook) return
    setSending(true)
    await sendRecommendation(selectedBook, [...selectedFriends], note, user)
    setSending(false); setSent(true)
    setTimeout(onClose, 1200)
  }

  return (
    <FabModal onClose={onClose}>
      <div style={{ padding: '1.25rem', paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom, 1.25rem))', maxHeight: '85dvh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
          <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--rt-navy)' }}>
            {step === 'book' ? 'Pick a book to recommend' : `Recommend "${selectedBook?.title}"`}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--rt-t3)' }}>×</button>
        </div>

        {sent ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--rt-teal)', fontWeight: 700, fontSize: '1rem' }}>✓ Sent!</div>
        ) : step === 'book' ? (<>
          <input className="rt-input" style={{ marginBottom: '0.75rem', marginTop: '0.5rem' }}
            placeholder="Search your books…" value={search} onChange={e => setSearch(e.target.value)} autoFocus />
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.length === 0 ? (
              <div style={{ color: 'var(--rt-t3)', fontSize: '0.85rem', textAlign: 'center', padding: '1.5rem' }}>No books found.</div>
            ) : filtered.map(b => (
              <div key={b.id} onClick={() => { setSelectedBook(b); setStep('friends') }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0', borderBottom: '1px solid var(--rt-border)', cursor: 'pointer' }}>
                <div style={{ width: 32, height: 46, borderRadius: 4, background: 'var(--rt-surface)', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {b.coverId ? <img src={`https://covers.openlibrary.org/b/id/${b.coverId}-S.jpg`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : <IcoBook size={18} color="var(--rt-t3)" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--rt-navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</div>
                  {b.author && <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)' }}>{b.author}</div>}
                </div>
                <span style={{ color: 'var(--rt-t3)', fontSize: '0.9rem' }}>›</span>
              </div>
            ))}
          </div>
        </>) : (<>
          <div style={{ fontSize: '0.78rem', color: 'var(--rt-t3)', marginBottom: '0.75rem', marginTop: '0.25rem' }}>
            <button onClick={() => setStep('book')} style={{ background: 'none', border: 'none', color: 'var(--rt-amber)', fontSize: '0.78rem', cursor: 'pointer', padding: 0, fontWeight: 600 }}>← Change book</button>
          </div>
          <div style={{ overflowY: 'auto', flex: 1, marginBottom: '0.75rem' }}>
            {!friends?.length ? (
              <div style={{ color: 'var(--rt-t3)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem' }}>Add friends first to recommend books.</div>
            ) : friends.map(f => {
              const sel = selectedFriends.has(f.userId)
              const sent = alreadySentTo.has(f.userId)
              return (
                <div key={f.userId} onClick={() => toggleFriend(f.userId)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0', borderBottom: '1px solid var(--rt-border)', cursor: sent ? 'default' : 'pointer', opacity: sent ? 0.5 : 1 }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: avatarColour(f.userId), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                    {avatarInitial(f.displayName || f.username || '?')}
                  </div>
                  <span style={{ flex: 1, fontSize: '0.9rem', fontWeight: 600, color: 'var(--rt-navy)' }}>{f.displayName || f.username}</span>
                  {sent ? <span style={{ fontSize: '0.7rem', color: 'var(--rt-t3)', fontStyle: 'italic' }}>Already sent</span>
                  : <div style={{ width: 22, height: 22, borderRadius: 5, border: `2px solid ${sel ? 'var(--rt-amber)' : 'var(--rt-border-md)'}`, background: sel ? 'var(--rt-amber)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {sel && <span style={{ color: '#fff', fontSize: '0.72rem', fontWeight: 700 }}>✓</span>}
                  </div>}
                </div>
              )
            })}
          </div>
          <textarea value={note} onChange={e => setNote(e.target.value)}
            placeholder="Add a note (optional)…"
            style={{ width: '100%', borderRadius: 'var(--rt-r3)', border: '1px solid var(--rt-border-md)', padding: '0.6rem 0.75rem', fontSize: '0.85rem', fontFamily: 'inherit', resize: 'none', marginBottom: '0.75rem', boxSizing: 'border-box', minHeight: 60 }} />
          <button onClick={handleSend} disabled={!selectedFriends.size || sending}
            style={{ width: '100%', background: selectedFriends.size ? 'var(--rt-navy)' : 'var(--rt-surface)', color: selectedFriends.size ? '#fff' : 'var(--rt-t3)', border: 'none', borderRadius: 'var(--rt-r3)', padding: '0.85rem', fontWeight: 700, fontSize: '0.9rem', cursor: selectedFriends.size ? 'pointer' : 'default' }}>
            {sending ? 'Sending…' : `Send to ${selectedFriends.size || ''} friend${selectedFriends.size !== 1 ? 's' : ''}`}
          </button>
        </>)}
      </div>
    </FabModal>
  )
}

// ── FAB: Start chat modal ─────────────────────────────────────
function FabChatModal({ books, friends, chats, startOrOpenChat, onOpenChatModal, onClose, preselectedFriendId }) {
  const { myDisplayName } = useSocialContext()
  const [step, setStep]           = useState(preselectedFriendId ? 'friends' : 'book') // 'book' | 'friends'
  const [preselBook, setPreselBook] = useState(null) // used when entering via friend pre-select
  const [search, setSearch]       = useState('')
  const [selectedBook, setSelectedBook] = useState(null)
  const [selectedFriends, setSelectedFriends] = useState(() => preselectedFriendId ? new Set([preselectedFriendId]) : new Set())
  const [starting, setStarting]   = useState(false)

  const myBooks = books.filter(b => b.status === 'read' || b.status === 'reading')
  const filtered = search.trim()
    ? myBooks.filter(b => b.title.toLowerCase().includes(search.toLowerCase()) || (b.author || '').toLowerCase().includes(search.toLowerCase()))
    : myBooks

  const bookChats = selectedBook ? (chats || []).filter(c => c.bookOlKey === selectedBook.olKey || c.bookTitle === selectedBook.title) : []

  function toggle(id) {
    setSelectedFriends(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function handleStart() {
    if (!selectedFriends.size) return
    if (!selectedBook && !preselectedFriendId) return
    const friendIds = [...selectedFriends]
    setStarting(true)
    const selectedFriendObjs = friends.filter(f => friendIds.includes(f.userId))
    const myName = myDisplayName || myUsername || 'me'
    const friendNames = selectedFriendObjs.map(f => f.displayName || f.username || 'friend')
    const autoName = friendIds.length === 1
      ? `${myName} & ${friendNames[0]}`
      : `${myName} & ${friendNames.slice(0, 2).join(' & ')}${friendIds.length > 2 ? ` +${friendIds.length - 2}` : ''}`
    const book = selectedBook
    const chatId = await startOrOpenChat(book?.olKey || null, book?.title || 'General', book?.author || '', book?.coverId || null, friendIds, null, autoName)
    setStarting(false)
    if (chatId) {
      onOpenChatModal?.({ id: chatId, bookOlKey: book?.olKey || null, bookTitle: book?.title || 'General', bookAuthor: book?.author || '', coverIdRaw: book?.coverId || null, chatName: autoName }, book)
    }
    onClose()
  }

  return (
    <FabModal onClose={onClose}>
      <div style={{ padding: '1.25rem', paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom, 1.25rem))', maxHeight: '85dvh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
          <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--rt-navy)' }}>
            {step === 'book' ? 'Chat about a book' : selectedBook ? `Chat about "${selectedBook.title}"` : 'Pick a book to chat about'}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--rt-t3)' }}>×</button>
        </div>

        {step === 'book' ? (<>
          <input className="rt-input" style={{ marginBottom: '0.75rem', marginTop: '0.5rem' }}
            placeholder="Search your books…" value={search} onChange={e => setSearch(e.target.value)} autoFocus />
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.length === 0 ? (
              <div style={{ color: 'var(--rt-t3)', fontSize: '0.85rem', textAlign: 'center', padding: '1.5rem' }}>No books found.</div>
            ) : filtered.map(b => (
              <div key={b.id} onClick={() => { setSelectedBook(b); setStep('friends') }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0', borderBottom: '1px solid var(--rt-border)', cursor: 'pointer' }}>
                <div style={{ width: 32, height: 46, borderRadius: 4, background: 'var(--rt-surface)', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {b.coverId ? <img src={`https://covers.openlibrary.org/b/id/${b.coverId}-S.jpg`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : <IcoBook size={18} color="var(--rt-t3)" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--rt-navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</div>
                  {b.author && <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)' }}>{b.author}</div>}
                </div>
                <span style={{ color: 'var(--rt-t3)', fontSize: '0.9rem' }}>›</span>
              </div>
            ))}
          </div>
        </>) : (<>
          <div style={{ marginBottom: '0.75rem', marginTop: '0.25rem' }}>
            <button onClick={() => setStep('book')} style={{ background: 'none', border: 'none', color: 'var(--rt-amber)', fontSize: '0.78rem', cursor: 'pointer', padding: 0, fontWeight: 600 }}>
              {selectedBook ? '← Change book' : '+ Pick a book (optional)'}
            </button>
          </div>

          {bookChats.length > 0 && (
            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.4rem' }}>Existing chats</div>
              {bookChats.map(c => (
                <div key={c.id} onClick={() => { onOpenChatModal?.(c, selectedBook); onClose() }}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.75rem', borderRadius: 'var(--rt-r3)', background: 'var(--rt-surface)', marginBottom: '0.35rem', cursor: 'pointer', border: '1px solid var(--rt-border)' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--rt-t3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  <span style={{ flex: 1, fontSize: '0.88rem', fontWeight: 600, color: 'var(--rt-navy)' }}>{c.chatName || selectedBook?.title}</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--rt-t3)' }}>Open →</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.4rem' }}>Start new chat with</div>
          <div style={{ overflowY: 'auto', flex: 1, marginBottom: '0.75rem' }}>
            {!friends?.length ? (
              <div style={{ color: 'var(--rt-t3)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem' }}>Add friends to start chatting.</div>
            ) : friends.map(f => {
              const sel = selectedFriends.has(f.userId)
              return (
                <div key={f.userId} onClick={() => toggle(f.userId)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0', borderBottom: '1px solid var(--rt-border)', cursor: 'pointer' }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: avatarColour(f.userId), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                    {avatarInitial(f.displayName || f.username || '?')}
                  </div>
                  <span style={{ flex: 1, fontSize: '0.9rem', fontWeight: 600, color: 'var(--rt-navy)' }}>{f.displayName || f.username}</span>
                  <div style={{ width: 22, height: 22, borderRadius: 5, border: `2px solid ${sel ? 'var(--rt-amber)' : 'var(--rt-border-md)'}`, background: sel ? 'var(--rt-amber)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {sel && <span style={{ color: '#fff', fontSize: '0.72rem', fontWeight: 700 }}>✓</span>}
                  </div>
                </div>
              )
            })}
          </div>
          <button onClick={handleStart} disabled={!selectedFriends.size || starting}
            style={{ width: '100%', background: selectedFriends.size ? 'var(--rt-navy)' : 'var(--rt-surface)', color: selectedFriends.size ? '#fff' : 'var(--rt-t3)', border: 'none', borderRadius: 'var(--rt-r3)', padding: '0.85rem', fontWeight: 700, fontSize: '0.9rem', cursor: selectedFriends.size ? 'pointer' : 'default' }}>
            {starting ? 'Starting…' : 'Start chat'}
          </button>
        </>)}
      </div>
    </FabModal>
  )
}

// ── Onboarding Flow ───────────────────────────────────────────────
// Shown once when username is not yet set. 3 steps:
//   1. Username + display name
//   2. Pick moods (1-5)
//   3. What are you reading right now?
// Then navigates to Home.

const ONBOARDING_MOODS = [
  { id: 'unputdownable',   label: 'Unputdownable',   emoji: '🔥', desc: 'Propulsive, cant stop reads' },
  { id: 'dark-and-twisty', label: 'Dark & Twisty',   emoji: '🌑', desc: 'Unsettling, morally complex' },
  { id: 'feel-everything', label: 'Feel Everything',  emoji: '💧', desc: 'Emotionally devastating (in the best way)' },
  { id: 'pure-joy',        label: 'Pure Joy',         emoji: '🌞', desc: 'Warm, funny, life-affirming' },
  { id: 'big-and-epic',    label: 'Big & Epic',       emoji: '⚔️', desc: 'Sprawling worlds, sweeping narratives' },
  { id: 'heart-and-soul',  label: 'Heart & Soul',     emoji: '❤️', desc: 'Romance, longing, love in all forms' },
  { id: 'mind-bending',    label: 'Mind-Bending',     emoji: '🌀', desc: 'Challenges how you see the world' },
  { id: 'expand-your-mind',label: 'Expand Your Mind', emoji: '💡', desc: 'Non-fiction, essays, ideas that stick' },
  { id: 'classics',        label: 'The Classics',     emoji: '📜', desc: 'The ones that started everything' },
]

// ── Invite block used in onboarding step 4 ───────────────────
function OnboardingInviteBlock({ generateInviteLink }) {
  const [copied, setCopied] = useState(false)
  async function handleCopy() {
    const link = await generateInviteLink()
    if (link) {
      try { await navigator.clipboard.writeText(link) } catch {}
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    }
  }
  return (
    <div style={{ background: 'var(--rt-navy)', borderRadius: 'var(--rt-r3)', padding: '1rem 1.25rem', marginBottom: '1.25rem' }}>
      <div style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', marginBottom: '0.35rem' }}>Invite friends to LitLoop</div>
      <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5, marginBottom: '0.85rem' }}>
        Don't see your friends yet? Share your invite link and they'll be able to find you when they join.
      </div>
      <button onClick={handleCopy} style={{ width: '100%', background: copied ? 'var(--rt-teal)' : 'var(--rt-amber)', color: '#fff', border: 'none', borderRadius: 8, padding: '0.65rem 1rem', textAlign: 'center', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', transition: 'background 0.2s' }}>
        {copied ? '✓ Copied!' : 'Copy invite link'}
      </button>
    </div>
  )
}

function OnboardingFlow({ user, onComplete }) {
  const { saveProfile, completeOnboarding, setPreferredMoods, sendFriendRequest, generateInviteLink } = useSocialContext()
  const { addBook } = useBooksContext()

  const [step, setStep]               = useState(1)  // 1 | 2 | 3 | 4
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState(null)

  // Step 1 — identity
  const [firstName, setFirstName]     = useState('')
  const [lastName, setLastName]       = useState('')
  const [handle, setHandle]           = useState('')
  const [handleEdited, setHandleEdited] = useState(false)

  // Step 2 — moods
  const [moods, setMoods]             = useState([])

  // Step 3 — current book + import
  const [query, setQuery]             = useState('')
  const [results, setResults]         = useState([])
  const [searching, setSearching]     = useState(false)
  const [currentBook, setCurrentBook] = useState(null)
  const searchTimer                   = useRef(null)

  // Step 4 — add a friend
  const [friendQuery, setFriendQuery]     = useState('')
  const [friendResults, setFriendResults] = useState([])
  const [friendSearching, setFriendSearching] = useState(false)
  const [addedFriends, setAddedFriends]   = useState(new Set())
  const friendTimer                       = useRef(null)

  // Step 3 — CSV import state
  const grInputRef                        = useRef(null)
  const sgInputRef                        = useRef(null)
  const [importStatus, setImportStatus]   = useState(null)
  const [importMsg, setImportMsg]         = useState('')

  const TOTAL_STEPS = 4

  // Auto-generate handle from first + last name
  useEffect(() => {
    if (!handleEdited && (firstName || lastName)) {
      const combined = `${firstName}${lastName}`.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 20)
      setHandle(combined)
    }
  }, [firstName, lastName, handleEdited])

  // Book search
  useEffect(() => {
    clearTimeout(searchTimer.current)
    if (!query.trim()) { setResults([]); return }
    setSearching(true)
    searchTimer.current = setTimeout(async () => {
      try {
        const cleanQ = query.replace(/\s*\([^)]*#\d[^)]*\)/g, '').replace(/[:\u2014\u2013].*/u, '').trim()
        const res = await fetch(`https://openlibrary.org/search.json?title=${encodeURIComponent(cleanQ)}&fields=key,title,author_name,cover_i&limit=5&type=work`)
        const data = await res.json()
        setResults(data.docs || [])
      } catch {}
      setSearching(false)
    }, 400)
  }, [query])

  // Friend search — uses search_users RPC
  useEffect(() => {
    clearTimeout(friendTimer.current)
    if (friendQuery.trim().length < 2) { setFriendResults([]); return }
    setFriendSearching(true)
    friendTimer.current = setTimeout(async () => {
      try {
        const { data } = await sb.rpc('search_users', { p_query: friendQuery.trim(), p_current_user_id: user.id, p_limit: 8 })
        setFriendResults(data || [])
      } catch {}
      setFriendSearching(false)
    }, 350)
  }, [friendQuery])

  async function handleStep1() {
    setError(null)
    if (!firstName.trim()) { setError('Please enter your first name'); return }
    if (!handle.trim() || handle.trim().length < 3) { setError('Handle must be at least 3 characters'); return }
    setSaving(true)
    const { error } = await saveProfile(firstName, lastName, handle)
    setSaving(false)
    if (error) {
      const msg = error.message || ''
      if (msg.includes('unique') || msg.includes('duplicate')) {
        setError('That handle is already taken — try adding a number or initial, e.g. @jamesj2')
      } else {
        setError(msg || 'Something went wrong, please try again')
      }
      return
    }
    setStep(2)
  }

  async function handleStep2() {
    setPreferredMoods(moods)
    try { await sb.from('profiles').update({ preferred_moods: moods }).eq('id', user.id) } catch {}
    setStep(3)
  }

  async function handleStep3() {
    if (currentBook) {
      await addBook({
        title: currentBook.title,
        author: (currentBook.author_name || []).join(', '),
        olKey: currentBook.key,
        coverId: currentBook.cover_i || null,
        status: 'reading',
        dateStarted: new Date().toISOString().split('T')[0],
      })
    }
    setStep(4)
  }

  async function handleFinish() {
    await completeOnboarding()
    onComplete()
  }

  async function handleImport(file, type) {
    if (!file) return
    const text = await file.text()
    // Kick off in the background — safe to navigate away immediately
    startBackgroundImport({ csvText: text, type, addBook, existingBooks: [] })
    setImportStatus('loading')
    setImportMsg('Import started — you can continue and it will run in the background')
    if (grInputRef.current) grInputRef.current.value = ''
    if (sgInputRef.current) sgInputRef.current.value = ''
  }

  const progress = ((step - 1) / TOTAL_STEPS) * 100

  // Shared input style
  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    padding: '0.85rem 1rem',
    border: '1.5px solid var(--rt-border-md)', borderRadius: 'var(--rt-r3)',
    fontSize: '0.95rem', color: 'var(--rt-navy)', background: 'var(--rt-white)',
    outline: 'none', fontFamily: 'var(--rt-font-body)',
  }

  const primaryBtn = (disabled) => ({
    width: '100%',
    background: disabled ? 'var(--rt-surface)' : 'var(--rt-navy)',
    color: disabled ? 'var(--rt-t3)' : '#fff',
    border: 'none', borderRadius: 'var(--rt-r3)', padding: '0.95rem',
    fontSize: '0.95rem', fontWeight: 700,
    cursor: disabled ? 'default' : 'pointer',
    fontFamily: 'var(--rt-font-body)', transition: 'all 0.15s',
  })

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'var(--rt-cream)',
      fontFamily: 'var(--rt-font-body)',
      display: 'flex', flexDirection: 'column',
      overflowY: 'auto', overflowX: 'hidden',
    }}>
      {/* Progress bar */}
      <div style={{ height: 3, background: 'var(--rt-border)', flexShrink: 0 }}>
        <div style={{ height: '100%', background: 'var(--rt-amber)', width: `${progress}%`, transition: 'width 0.4s ease' }} />
      </div>

      {/* Header */}
      <div style={{ background: 'linear-gradient(160deg, #111C35 0%, var(--rt-navy) 100%)', padding: '1.75rem 1.5rem 1.5rem', flexShrink: 0 }}>
        <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.3rem', fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>LitLoop</div>
        <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.78rem', marginTop: '0.2rem' }}>Step {step} of {TOTAL_STEPS}</div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, maxWidth: 540, width: '100%', margin: '0 auto', padding: '2rem 1.5rem 3rem', boxSizing: 'border-box' }}>

        {/* ── Step 1: Name + handle ── */}
        {step === 1 && (
          <div>
            <h2 style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.35rem', fontWeight: 600, color: 'var(--rt-navy)', margin: '0 0 0.5rem', lineHeight: 1.2 }}>
              Let's set up your profile
            </h2>
            <p style={{ color: 'var(--rt-t3)', fontSize: '0.88rem', margin: '0 0 2rem', lineHeight: 1.5 }}>
              Your name is shown to friends inside the app. Your handle appears on any public reviews.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.4rem' }}>First name</label>
                <input
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  placeholder="James"
                  maxLength={30}
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = 'var(--rt-navy)'}
                  onBlur={e => e.target.style.borderColor = 'var(--rt-border-md)'}
                  autoFocus
                  autoComplete="given-name"
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.4rem' }}>Last name</label>
                <input
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  placeholder="Johnson"
                  maxLength={30}
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = 'var(--rt-navy)'}
                  onBlur={e => e.target.style.borderColor = 'var(--rt-border-md)'}
                  autoComplete="family-name"
                />
              </div>
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)', marginBottom: '1.25rem', marginTop: '-0.75rem' }}>
              Shown as <strong style={{ color: 'var(--rt-navy)' }}>{firstName && lastName ? `${firstName}${lastName.charAt(0)}` : firstName || 'FirstnameL'}</strong> on your friends' feed
            </div>

            <div style={{ marginBottom: '1.75rem' }}>
              <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.4rem' }}>
                Unique handle <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— shown on public reviews</span>
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--rt-t3)', fontSize: '0.95rem', pointerEvents: 'none' }}>@</span>
                <input
                  value={handle}
                  onChange={e => { setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '')); setHandleEdited(true) }}
                  placeholder="yourhandle"
                  maxLength={20}
                  style={{ ...inputStyle, paddingLeft: '2rem' }}
                  onFocus={e => e.target.style.borderColor = 'var(--rt-navy)'}
                  onBlur={e => e.target.style.borderColor = 'var(--rt-border-md)'}
                  autoComplete="off"
                  autoCapitalize="none"
                />
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)', marginTop: '0.4rem' }}>
                You can change this once later in settings.
              </div>
            </div>

            {error && <p style={{ color: '#991b1b', background: '#fef2f2', fontSize: '0.83rem', padding: '0.6rem 0.9rem', borderRadius: 'var(--rt-r4)', margin: '0 0 1rem' }}>{error}</p>}

            <button onClick={handleStep1} disabled={saving || !firstName.trim() || !handle.trim()}
              style={primaryBtn(saving || !firstName.trim() || !handle.trim())}>
              {saving ? 'Saving…' : 'Continue →'}
            </button>
          </div>
        )}

        {/* ── Step 2: Mood picker ── */}
        {step === 2 && (
          <div>
            <h2 style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.35rem', fontWeight: 600, color: 'var(--rt-navy)', margin: '0 0 0.5rem', lineHeight: 1.2 }}>
              What kind of reader are you?
            </h2>
            <p style={{ color: 'var(--rt-t3)', fontSize: '0.88rem', margin: '0 0 1.75rem', lineHeight: 1.5 }}>
              Pick the reading moods that feel like you. We'll use these to personalise your LitLoop Picks.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '2rem', width: '100%', boxSizing: 'border-box' }}>
              {ONBOARDING_MOODS.map(mood => {
                const selected = moods.includes(mood.id)
                return (
                  <button key={mood.id}
                    onClick={() => setMoods(prev => prev.includes(mood.id) ? prev.filter(m => m !== mood.id) : [...prev, mood.id])}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.85rem',
                      padding: '0.85rem 1rem',
                      background: selected ? 'var(--rt-navy)' : 'var(--rt-white)',
                      border: `1.5px solid ${selected ? 'var(--rt-navy)' : 'var(--rt-border-md)'}`,
                      borderRadius: 'var(--rt-r3)', cursor: 'pointer', textAlign: 'left', width: '100%',
                      boxSizing: 'border-box',
                      transition: 'all 0.15s',
                    }}>
                    <span style={{ fontSize: '1.25rem', flexShrink: 0, width: 28, textAlign: 'center' }}>{mood.emoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.9rem', fontWeight: 700, color: selected ? '#fff' : 'var(--rt-navy)', fontFamily: 'var(--rt-font-body)' }}>{mood.label}</div>
                      <div style={{ fontSize: '0.73rem', color: selected ? 'rgba(255,255,255,0.6)' : 'var(--rt-t3)', marginTop: '0.1rem' }}>{mood.desc}</div>
                    </div>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, background: selected ? 'var(--rt-amber)' : 'transparent', border: `2px solid ${selected ? 'var(--rt-amber)' : 'var(--rt-border-md)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
                      {selected && <span style={{ color: '#fff', fontSize: '0.65rem', fontWeight: 900 }}>✓</span>}
                    </div>
                  </button>
                )
              })}
            </div>

            <button onClick={handleStep2} style={primaryBtn(false)}>
              {moods.length === 0 ? 'Skip for now →' : `Continue with ${moods.length} mood${moods.length > 1 ? 's' : ''} →`}
            </button>
          </div>
        )}

        {/* ── Step 3: Currently reading + import ── */}
        {step === 3 && (
          <div>
            <h2 style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.35rem', fontWeight: 600, color: 'var(--rt-navy)', margin: '0 0 0.5rem', lineHeight: 1.2 }}>
              What are you reading right now?
            </h2>
            <p style={{ color: 'var(--rt-t3)', fontSize: '0.88rem', margin: '0 0 1.75rem', lineHeight: 1.5 }}>
              Add your current read so it shows up straight away. You can also import your full history from Goodreads or StoryGraph.
            </p>

            {currentBook ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', background: 'var(--rt-white)', border: '1.5px solid var(--rt-navy)', borderRadius: 'var(--rt-r3)', padding: '0.85rem 1rem', marginBottom: '1.5rem' }}>
                {currentBook.cover_i ? (
                  <img src={`https://covers.openlibrary.org/b/id/${currentBook.cover_i}-S.jpg`} style={{ width: 44, height: 62, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} alt="" />
                ) : (
                  <div style={{ width: 44, height: 62, borderRadius: 4, background: 'var(--rt-surface)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IcoBook size={22} color="var(--rt-t3)" /></div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--rt-navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentBook.title}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--rt-t3)', marginTop: '0.15rem' }}>{(currentBook.author_name || []).slice(0, 2).join(', ')}</div>
                </div>
                <button onClick={() => setCurrentBook(null)} style={{ background: 'none', border: 'none', color: 'var(--rt-t3)', cursor: 'pointer', fontSize: '1.1rem', padding: '0.25rem', flexShrink: 0 }}>×</button>
              </div>
            ) : (
              <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search for a book title…"
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = 'var(--rt-navy)'}
                  onBlur={e => e.target.style.borderColor = 'var(--rt-border-md)'}
                  autoFocus
                  autoComplete="off"
                />
                {searching && <div style={{ position: 'absolute', right: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--rt-t3)', fontSize: '0.78rem' }}>Searching…</div>}
              </div>
            )}

            {!currentBook && results.length > 0 && (
              <div style={{ background: 'var(--rt-white)', border: '1px solid var(--rt-border-md)', borderRadius: 'var(--rt-r3)', overflow: 'hidden', marginBottom: '1.5rem', boxShadow: 'var(--rt-s2)' }}>
                {results.map((r, i) => (
                  <button key={r.key}
                    onClick={() => { setCurrentBook(r); setQuery(''); setResults([]) }}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%', padding: '0.75rem 1rem', background: 'none', border: 'none', borderBottom: i < results.length - 1 ? '1px solid var(--rt-border)' : 'none', cursor: 'pointer', textAlign: 'left' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--rt-surface)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    {r.cover_i ? (
                      <img src={`https://covers.openlibrary.org/b/id/${r.cover_i}-S.jpg`} style={{ width: 32, height: 46, borderRadius: 3, objectFit: 'cover', flexShrink: 0 }} alt="" />
                    ) : (
                      <div style={{ width: 32, height: 46, borderRadius: 3, background: 'var(--rt-surface)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IcoBook size={18} color="var(--rt-t3)" /></div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--rt-navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                      <div style={{ fontSize: '0.73rem', color: 'var(--rt-t3)', marginTop: '0.1rem' }}>{(r.author_name || []).slice(0, 2).join(', ')}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Continue button — shows when book selected or import has started */}
            {(currentBook || importStatus) && (
              <button onClick={handleStep3} style={{ ...primaryBtn(false), marginBottom: '1.25rem' }}>
                {currentBook ? 'Add to my list & continue →' : 'Continue →'}
              </button>
            )}

            {/* CSV import */}
            <div style={{ background: 'var(--rt-white)', border: '1px solid var(--rt-border)', borderRadius: 'var(--rt-r3)', padding: '1rem 1.1rem', marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--rt-navy)', marginBottom: '0.25rem' }}>Already track your reading?</div>
              <div style={{ fontSize: '0.73rem', color: 'var(--rt-t3)', marginBottom: '0.85rem', lineHeight: 1.5 }}>
                Import your full history from Goodreads or StoryGraph — it runs in the background so you can keep going.
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.9rem', borderRadius: 'var(--rt-r3)', background: 'var(--rt-white)', border: '1.5px solid var(--rt-amber)', color: 'var(--rt-amber)', fontSize: '0.8rem', fontWeight: 700, cursor: importStatus === 'loading' ? 'not-allowed' : 'pointer' }}>
                  📚 Goodreads CSV
                  <input ref={grInputRef} type="file" accept=".csv" style={{ display: 'none' }} disabled={importStatus === 'loading'} onChange={e => handleImport(e.target.files[0], 'goodreads')} />
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.9rem', borderRadius: 'var(--rt-r3)', background: 'var(--rt-white)', border: '1.5px solid var(--rt-amber)', color: 'var(--rt-amber)', fontSize: '0.8rem', fontWeight: 700, cursor: importStatus === 'loading' ? 'not-allowed' : 'pointer' }}>
                  📖 StoryGraph CSV
                  <input ref={sgInputRef} type="file" accept=".csv" style={{ display: 'none' }} disabled={importStatus === 'loading'} onChange={e => handleImport(e.target.files[0], 'storygraph')} />
                </label>
              </div>
              {importStatus && (
                <div style={{ marginTop: '0.65rem', fontSize: '0.78rem', padding: '0.45rem 0.7rem', borderRadius: 8, background: 'var(--rt-surface)', color: 'var(--rt-t2)', border: '1px solid var(--rt-border)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ width: 10, height: 10, border: '2px solid var(--rt-border-md)', borderTopColor: 'var(--rt-navy)', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
                  {importMsg}
                </div>
              )}
            </div>

            {/* Skip — small text link */}
            <div style={{ textAlign: 'center' }}>
              <button onClick={handleStep3} style={{ background: 'none', border: 'none', color: 'var(--rt-t3)', fontSize: '0.82rem', cursor: 'pointer', padding: '0.25rem', textDecoration: 'underline', textUnderlineOffset: 2 }}>
                Skip for now →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Add a friend ── */}
        {step === 4 && (
          <div>
            <h2 style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.35rem', fontWeight: 600, color: 'var(--rt-navy)', margin: '0 0 0.5rem', lineHeight: 1.2 }}>
              Reading is better together
            </h2>
            <p style={{ color: 'var(--rt-t3)', fontSize: '0.88rem', margin: '0 0 1.75rem', lineHeight: 1.5 }}>
              Search for friends by name or handle, or share your invite link. You can always do this later.
            </p>

            <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
              <input
                value={friendQuery}
                onChange={e => setFriendQuery(e.target.value)}
                placeholder="Search by name or @handle…"
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = 'var(--rt-navy)'}
                onBlur={e => e.target.style.borderColor = 'var(--rt-border-md)'}
                autoFocus
                autoComplete="off"
              />
              {friendSearching && <div style={{ position: 'absolute', right: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--rt-t3)', fontSize: '0.78rem' }}>Searching…</div>}
            </div>

            {friendResults.length > 0 && (
              <div style={{ background: 'var(--rt-white)', border: '1px solid var(--rt-border-md)', borderRadius: 'var(--rt-r3)', overflow: 'hidden', marginBottom: '1.5rem', boxShadow: 'var(--rt-s2)' }}>
                {friendResults.map((f, i) => {
                  const added = addedFriends.has(f.id)
                  return (
                    <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderBottom: i < friendResults.length - 1 ? '1px solid var(--rt-border)' : 'none' }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: avatarColour(f.id), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, color: '#fff', flexShrink: 0, overflow: 'hidden' }}>
                        {f.avatar_url ? <img src={f.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : avatarInitial(f.display_name || f.username)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--rt-navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.display_name || f.username}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)' }}>@{f.username}{f.mutual_friends > 0 ? ` · ${f.mutual_friends} mutual` : ''}</div>
                      </div>
                      <button
                        onClick={async () => {
                          if (added) return
                          await sendFriendRequest(f.username)
                          setAddedFriends(prev => new Set([...prev, f.id]))
                        }}
                        style={{ flexShrink: 0, background: added ? 'var(--rt-surface)' : 'var(--rt-amber)', color: added ? 'var(--rt-t3)' : '#fff', border: 'none', borderRadius: 99, padding: '0.3rem 0.85rem', fontSize: '0.75rem', fontWeight: 700, cursor: added ? 'default' : 'pointer' }}>
                        {added ? 'Sent ✓' : 'Add'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Invite block */}
            <OnboardingInviteBlock generateInviteLink={generateInviteLink} />

            <button onClick={handleFinish} style={{ ...primaryBtn(false), marginBottom: '0.75rem' }}>
              {addedFriends.size > 0 ? `Continue with ${addedFriends.size} friend${addedFriends.size > 1 ? 's' : ''} added →` : 'Skip for now →'}
            </button>
          </div>
        )}

      </div>
    </div>
  )
}


// ── In-app notification toast ─────────────────────────────────────────────
// Appears at the top of the screen when a realtime notification arrives.
// Auto-dismisses after 3s; key prop ensures timer resets on each new toast.
function InAppToast({ toast, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3000)
    return () => clearTimeout(t)
  }, [])
  return (
    <div style={{
      position: 'fixed',
      top: 'max(0.75rem, env(safe-area-inset-top, 0.75rem))',
      left: '50%', transform: 'translateX(-50%)',
      zIndex: 1300, width: 'min(96vw, 380px)',
      background: 'var(--rt-navy)', color: '#fff',
      borderRadius: 12, padding: '0.65rem 0.85rem',
      display: 'flex', alignItems: 'center', gap: '0.55rem',
      boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
      animation: 'toastSlideIn 0.2s ease',
    }}>
      <span style={{ fontSize: '1rem', flexShrink: 0 }}>{toast.icon}</span>
      <span style={{ flex: 1, fontSize: '0.82rem', lineHeight: 1.4 }}>{toast.text}</span>
      <button
        onClick={onDismiss}
        style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: '1rem', cursor: 'pointer', padding: 0, lineHeight: 1, flexShrink: 0 }}
      >×</button>
    </div>
  )
}

// ── Global Friend Request Banner (Side B — receiver) ──────────────────────
function GlobalFriendBanner({ pending, acceptFriendRequest, declineFriendRequest, dismissedRequests, setDismissedRequests }) {
  const [actioned, setActioned] = useState(new Set()) // friendshipIds in-flight

  const visible = (pending || []).filter(p => !dismissedRequests.has(p.friendshipId))
  if (!visible.length) return null

  async function handleAccept(p) {
    setActioned(s => new Set([...s, p.friendshipId]))
    await acceptFriendRequest(p.friendshipId)
    setActioned(s => { const n = new Set(s); n.delete(p.friendshipId); return n })
  }

  async function handleDecline(p) {
    setActioned(s => new Set([...s, p.friendshipId]))
    await declineFriendRequest(p.friendshipId)
    setActioned(s => { const n = new Set(s); n.delete(p.friendshipId); return n })
  }

  return (
    <div style={{ position: 'fixed', top: 'max(0.75rem, env(safe-area-inset-top, 0.75rem))', left: '50%', transform: 'translateX(-50%)', zIndex: 1200, width: 'min(96vw, 420px)', display: 'flex', flexDirection: 'column', gap: '0.5rem', pointerEvents: 'none' }}>
      {visible.map(p => {
        const busy = actioned.has(p.friendshipId)
        return (
          <div key={p.friendshipId} style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', background: 'var(--rt-bg, #fff)', border: '1.5px solid var(--rt-amber)', borderRadius: 14, padding: '0.65rem 0.85rem', boxShadow: '0 4px 20px rgba(0,0,0,0.13)', pointerEvents: 'auto' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--rt-amber-pale)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, color: 'var(--rt-amber)', flexShrink: 0 }}>
              {(p.requesterName || '?')[0].toUpperCase()}
            </div>
            <span style={{ flex: 1, fontSize: '0.82rem', color: 'var(--rt-navy)', minWidth: 0 }}>
              <strong>{p.requesterName}</strong>
              {p.requesterUsername ? <span style={{ color: 'var(--rt-t3)', fontWeight: 400 }}> @{p.requesterUsername}</span> : null}
              {' '}sent you a friend request
            </span>
            <button
              onClick={() => handleAccept(p)}
              disabled={busy}
              style={{ background: 'var(--rt-amber)', color: '#fff', border: 'none', borderRadius: 99, padding: '0.25rem 0.65rem', fontSize: '0.72rem', fontWeight: 700, cursor: busy ? 'default' : 'pointer', flexShrink: 0, opacity: busy ? 0.6 : 1 }}
            >{busy ? '…' : 'Accept'}</button>
            <button
              onClick={() => handleDecline(p)}
              disabled={busy}
              style={{ background: 'var(--rt-surface)', color: 'var(--rt-t3)', border: '1px solid var(--rt-border)', borderRadius: 99, padding: '0.25rem 0.65rem', fontSize: '0.72rem', fontWeight: 700, cursor: busy ? 'default' : 'pointer', flexShrink: 0, opacity: busy ? 0.6 : 1 }}
            >Decline</button>
            <button
              onClick={() => setDismissedRequests(s => new Set([...s, p.friendshipId]))}
              style={{ background: 'none', border: 'none', color: 'var(--rt-t3)', fontSize: '1.1rem', cursor: 'pointer', padding: '0 0.1rem', lineHeight: 1, flexShrink: 0 }}
              aria-label="Hide"
            >×</button>
          </div>
        )
      })}
    </div>
  )
}

export default function AppShell() {
  const { user, signOut }   = useAuthContext()
  const { totalUnread, chats, openThread, closeThread, markChatRead, messages,
          sendMessage, deleteMessage, loadEarlier, startOrOpenChat,
          loadParticipants, updateChatName, addParticipants,
          leaveChat, loaded: chatsLoaded } = useChatContext()
  const { pending, outgoingPending, feed, recs, friends, sendRecommendation, generateInviteLink, sendFriendRequest,
          acceptFriendRequest, declineFriendRequest,
          myUsername, saveProfile, completeOnboarding, onboardingComplete, setPreferredMoods, profileLoaded,
          notifications: socialNotifs, markNotificationsRead, loadSocialData,
          myDisplayName, myAvatarUrl,
          inAppToast, clearInAppToast } = useSocialContext()
  const { books, addBook } = useBooksContext()
  const [activeTab, setActiveTab]         = useState('home')
  const showOnboarding = profileLoaded && onboardingComplete === false
  const [notifOpen, setNotifOpen]         = useState(false)
  const [activeChatModal, setActiveChatModal] = useState(null)
  const [fabOpen, setFabOpen]             = useState(false)
  const [fabAction, setFabAction]         = useState(null) // 'addbook'|'recommend'|'chat'|'friend'|'moment'
  const [fabChatPreselect, setFabChatPreselect] = useState(null) // userId to pre-select in FabChatModal
  const [dismissedRequests, setDismissedRequests] = useState(new Set()) // friendshipIds hidden by ×
  // Pending deep-link actions set by notification clicks, consumed by page components
  const pendingReviewOpen = useRef(null) // { entryId, bookTitle, bookAuthor, coverId, olKey, reviewBody, rating, reviewer }
  const pendingRecOpen    = useRef(null) // { book_ol_key, book_title, book_author, cover_id, message, from_user_id }
  const pendingChatId     = useRef(null) // chat ID from notification tap — open once chats are loaded
  const [pendingReviewTrigger, setPendingReviewTrigger] = useState(0)
  const [importBanner, setImportBanner]           = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('litloop_import') || 'null') } catch { return null }
  })

  // Poll sessionStorage for import progress updates
  // Always poll — catches imports that started in onboarding and continue into the main app
  useEffect(() => {
    const timer = setInterval(() => {
      try {
        const data = JSON.parse(sessionStorage.getItem('litloop_import') || 'null')
        if (!data) return
        setImportBanner(data)
        // Stop polling once the import reaches a terminal state and user has seen it
        if ((data.status === 'done' || data.status === 'error') && importBanner?.status === data.status) {
          clearInterval(timer)
        }
      } catch {}
    }, 800)
    return () => clearInterval(timer)
  }, []) // mount-only — runs for the lifetime of AppShell
  const [activeFriendProfile, setActiveFriendProfile] = useState(null) // friend to view from home feed
  const bellRef = useRef(null)

  function onNavigate(tab) { setActiveTab(tab) }

  // Listen for notification clicks from the service worker
  // When the user taps a push notification, the SW posts NOTIFICATION_CLICK
  // which we handle here the same way as in-app notification taps
  useEffect(() => {
    if (!navigator.serviceWorker) return
    function handleSWMessage(e) {
      if (e.data?.type !== 'NOTIFICATION_CLICK') return
      const { data } = e.data
      if (!data) return
      // Route to the right place based on notification data
      if (data.entryId) {
        pendingReviewOpen.current = { entryId: data.entryId, bookTitle: data.bookTitle || '' }
        setActiveTab('home')
      } else if (data.url === '/discover') {
        setActiveTab('discover')
      } else if (data.url === '/chat' || data.url?.includes('chat')) {
        setActiveTab('chat')
      } else {
        setActiveTab('home')
      }
    }
    navigator.serviceWorker.addEventListener('message', handleSWMessage)
    return () => navigator.serviceWorker.removeEventListener('message', handleSWMessage)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── FCM native push setup ──────────────────────────────────
  useEffect(() => {
    if (!isNative() || !user?.id) return

    function handlePushRoute(data) {
      const type = data.type
      if (type === 'chat' && data.chatId) {
        // Find full chat object if available, otherwise store ID for later
        const fullChat = chats.find(c => c.id === data.chatId)
        if (fullChat) {
          openChatModal(fullChat)
        } else {
          pendingChatId.current = data.chatId
        }
      } else if ((type === 'comment' || type === 'like') && data.entryId) {
        pendingReviewOpen.current = {
          entryId:   data.entryId,
          bookTitle: data.bookTitle || '',
          reviewer:  { displayName: data.actorName || '' },
        }
        setPendingReviewTrigger(v => v + 1)
        setActiveTab('home')
      } else if (type === 'recommendation' && data.bookOlKey) {
        pendingRecOpen.current = {
          book_ol_key:  data.bookOlKey,
          book_title:   data.bookTitle   || '',
          book_author:  data.bookAuthor  || '',
          cover_id:     data.coverId     || null,
          message:      data.message     || '',
          from_user_id: data.fromUserId  || null,
        }
        setActiveTab('discover')
      } else if (type === 'friend_request') {
        setActiveTab('home')
      } else if (type === 'friend_accepted' && data.friendUserId) {
        setActiveTab('chat')
        setActiveFriendProfile({ id: data.friendUserId, display_name: data.actorName || '' })
      }
    }

    registerFcmToken(user.id)
    setupFcmListeners(user.id, handlePushRoute, () => chatsLoaded)

    return () => removeFcmListeners()
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Route cold-start notification once chats are loaded ────
  useEffect(() => {
    if (!chatsLoaded) return
    // fcmManager polls isReady — nothing extra needed here
  }, [chatsLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Open pending chat from notification tap once chats load ──
  useEffect(() => {
    if (!pendingChatId.current || !chats.length) return
    const chat = chats.find(c => c.id === pendingChatId.current)
    if (chat) {
      pendingChatId.current = null
      openChatModal(chat)
    }
  }, [chats]) // eslint-disable-line react-hooks/exhaustive-deps

  async function openChatModal(chatIdOrObj, book) {
    // If a full chat object is passed, use it directly
    let chat = typeof chatIdOrObj === 'object' && chatIdOrObj?.id ? chatIdOrObj : null

    if (!chat) {
      const chatId = typeof chatIdOrObj === 'string' ? chatIdOrObj : null
      if (!chatId) return

      // Try to find in current list, but don't block on it — list may be stale
      chat = chats.find(c => c.id === chatId) || null

      // Always build a stub — modal can open immediately and load its own data
      if (!chat) {
        chat = {
          id:          chatId,
          bookTitle:   book?.title   || '',
          bookAuthor:  book?.author  || '',
          coverIdRaw:  book?.coverId || null,
          bookOlKey:   book?.olKey   || null,
        }
      }
    }

    openThread(chat.id)
    markChatRead(chat.id)
    setActiveChatModal(chat)
  }

  function closeChatModal() { closeThread(); setActiveChatModal(null) }

  // Open Start Chat modal pre-skipped to friends step for a specific friend
  function openChatWithFriend(friendUserId) {
    setFabChatPreselect(friendUserId)
    setFabAction('chat')
  }

  function findExistingChat(olKey) {
    if (!olKey || !chats) return null
    return chats.find(c => c.bookOlKey === olKey) || null
  }

  const unreadSocialNotifs = (socialNotifs || []).filter(n => !n.read)
  const notifCount = totalUnread + pending.length + unreadSocialNotifs.length

  const displayName  = user?.email?.split('@')[0] || 'Me'
  const avatarBg     = avatarColour(user?.id || 'x')
  const avatarLetter = avatarInitial(displayName)

  // Close notif popup on outside click
  useEffect(() => {
    if (!notifOpen) return
    function handler(e) {
      if (bellRef.current && !bellRef.current.contains(e.target)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [notifOpen])

  // Build notifications list — chats with unread messages first, then social
  const unreadChats = (chats || []).filter(c => c.unread > 0)
  const notifications = [
    ...unreadChats.map(c => ({
      id: 'chat-' + c.id,
      icon: <IcoChatBubble size={18} color="var(--rt-navy)" />,
      text: c.lastMessagePreview
        ? `New message in "${c.chatName || c.bookTitle}": ${c.lastMessagePreview.slice(0, 60)}${c.lastMessagePreview.length > 60 ? '\u2026' : ''}`
        : `New message in "${c.chatName || c.bookTitle}"`,
      time: c.lastMessageAt,
      badge: c.unread > 1 ? c.unread : null,
      action: () => {
        openChatModal(c, { title: c.bookTitle, author: c.bookAuthor, coverId: c.coverIdRaw })
        setNotifOpen(false)
      }
    })),
    ...pending.map(p => ({
      id: 'req-' + p.friendshipId,
      icon: <IcoUsersGroup size={18} color="var(--rt-navy)" />,
      text: `${p.displayName || p.username || 'Someone'} sent you a friend request`,
      time: p.createdAt,
      action: () => { setActiveTab('chat'); setNotifOpen(false) }
    })),
    ...(recs || []).filter(r => r.status === 'pending').slice(0, 3).map(r => ({
      id: 'rec-' + r.id,
      icon: <IcoBook size={18} color="var(--rt-navy)" />,
      text: `${r.profiles?.display_name || 'A friend'} recommended "${r.book_title || 'a book'}"`,
      time: r.created_at,
      action: () => {
        pendingRecOpen.current = r
        setActiveTab('discover')
        setNotifOpen(false)
      }
    })),
    ...(socialNotifs || []).filter(n => !n.read).map(n => {
      const actor = n.actorName || 'Someone'
      const book  = n.bookTitle ? `"${n.bookTitle}"` : 'a book'
      let text, icon, action

      const markAndDo = (fn) => () => {
        markNotificationsRead?.([n.id])
        setNotifOpen(false)
        fn()
      }

      switch (n.type) {
        case 'review_liked':
        case 'review_like':
          text   = `${actor} liked your review of ${book}`
          icon   = '\u2764\ufe0f'
          action = markAndDo(() => {
            if (n.entry_id) { pendingReviewOpen.current = { entryId: n.entry_id, bookTitle: n.bookTitle, reviewer: { displayName: actor } }; setPendingReviewTrigger(v => v + 1) }
            setActiveTab('home')
          })
          break
        case 'review_commented':
        case 'review_comment':
          text   = `${actor} commented on your review of ${book}`
          icon   = '\ud83d\udcac'
          action = markAndDo(() => {
            if (n.entry_id) { pendingReviewOpen.current = { entryId: n.entry_id, bookTitle: n.bookTitle, reviewer: { displayName: actor } }; setPendingReviewTrigger(v => v + 1) }
            setActiveTab('home')
          })
          break
        case 'comment_liked':
          text   = `${actor} liked your comment`
          icon   = '\u2764\ufe0f'
          action = markAndDo(() => {
            if (n.entry_id) { pendingReviewOpen.current = { entryId: n.entry_id, bookTitle: n.bookTitle, reviewer: { displayName: actor } }; setPendingReviewTrigger(v => v + 1) }
            setActiveTab('home')
          })
          break
        case 'thread_activity':
          text   = `${actor} replied in a thread you're in`
          icon   = '\ud83d\udcac'
          action = markAndDo(() => {
            if (n.entry_id) { pendingReviewOpen.current = { entryId: n.entry_id, bookTitle: n.bookTitle, reviewer: { displayName: actor } }; setPendingReviewTrigger(v => v + 1) }
            setActiveTab('home')
          })
          break
        case 'friend_request':
          text   = `${actor} sent you a friend request`
          icon   = '\ud83d\udc4b'
          action = markAndDo(() => setActiveTab('chat'))
          break
        case 'friend_accepted':
          text   = `${actor} accepted your friend request`
          icon   = '\u2713'
          action = markAndDo(() => setActiveTab('chat'))
          break
        case 'book_recommendation':
          text   = `${actor} recommended ${book}`
          icon   = '\ud83d\udcd6'
          action = markAndDo(() => {
            const matchingRec = (recs || []).find(r => r.from_user_id === n.actor_id && r.book_title === n.bookTitle)
            if (matchingRec) pendingRecOpen.current = matchingRec
            setActiveTab('discover')
          })
          break
        case 'co_reading_joined':
        case 'co_reading_started':
        case 'friend_already_reading':
          text   = n.type === 'co_reading_joined' ? `${actor} is also reading ${book}`
                 : n.type === 'friend_already_reading' ? `${actor} is already reading ${book}`
                 : `${actor} just started reading ${book} — you're reading it too!`
          icon   = '\ud83d\udcd6'
          action = markAndDo(() => setActiveTab('home'))
          break
        default:
          if (!n.bookTitle) return null
          text   = `New activity from ${actor}`
          icon   = '\ud83d\udd14'
          action = markAndDo(() => setActiveTab('home'))
      }
      return { id: 'social-' + n.id, icon, text, time: n.created_at, unread: true, action }
    }).filter(Boolean),
  ].slice(0, 15)

  function renderPage() {
    switch (activeTab) {
      case 'home':     return <Home            onNavigate={onNavigate} onOpenChatModal={openChatModal} onViewFriendProfile={f => { setActiveTab('chat'); setActiveFriendProfile(f) }} onAddFriend={() => setFabAction('friend')} pendingReviewOpen={pendingReviewOpen} pendingReviewTrigger={pendingReviewTrigger} />
      case 'mylist':   return <MyList          onNavigate={onNavigate} onOpenChatModal={openChatModal} />
      case 'stats':    return <Stats           onNavigate={onNavigate} />
      case 'discover': return <Discover        onNavigate={onNavigate} onOpenChatModal={openChatModal} onRecommend={() => setFabAction('recommend')} pendingRecOpen={pendingRecOpen} />
      case 'chat':     return <Chat            onNavigate={onNavigate} onOpenChatModal={openChatModal} onAddFriend={() => setFabAction('friend')} onOpenChatWithFriend={openChatWithFriend} initialFriendProfile={activeFriendProfile} onClearFriendProfile={() => setActiveFriendProfile(null)} />
      case 'profile':  return <Profile         onNavigate={onNavigate} onOpenChatModal={openChatModal} />
      case 'account':  return <AccountSettings onNavigate={onNavigate} />
      default:         return <Home            onNavigate={onNavigate} onOpenChatModal={openChatModal} />
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--rt-cream)', fontFamily: 'var(--rt-font-body)' }}>

      {/* ── Onboarding — shown when user has no username yet ── */}
      {showOnboarding && (
        <OnboardingFlow user={user} onComplete={() => {}} />
      )}

      {/* ── Desktop sidebar ─────────────────────────────── */}
      <nav className="rt-sidebar-desktop" style={{
        width: 220, background: 'var(--rt-white)', borderRight: '1px solid var(--rt-border)',
        display: 'flex', flexDirection: 'column', padding: '1.5rem 1rem', gap: '0.25rem',
        position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 50, boxShadow: 'var(--rt-s1)'
      }}>
        <div style={{ marginBottom: '2rem', paddingLeft: '0.5rem' }}>
          <img src={logo} alt="LitLoop" style={{ height: '28px', display: 'block' }} />
        </div>

        {SIDEBAR_TABS.map((tab, idx) => {
          const isActive = activeTab === tab.id || (tab.id === 'profile' && activeTab === 'account')
          // Divider before Stats
          const showDivider = tab.id === 'stats'
          return (
            <div key={tab.id}>
              {showDivider && <div style={{ height: 1, background: 'var(--rt-border)', margin: '0.4rem 0.5rem 0.65rem' }} />}
              <button
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '0.7rem 0.75rem', borderRadius: 'var(--rt-r3)', border: 'none',
                  background: isActive ? 'var(--rt-amber-pale)' : 'none',
                  color: isActive ? 'var(--rt-amber)' : 'var(--rt-t2)',
                  fontFamily: 'var(--rt-font-body)', fontSize: '0.88rem',
                  fontWeight: isActive ? 600 : 400,
                  cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', position: 'relative',
                  width: '100%',
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
            </div>
          )
        })}

        <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--rt-border)' }}>
          <button
            onClick={() => setActiveTab('account')}
            style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0.5rem 0.75rem', background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left' }}
          >
            <div style={{
              background: avatarBg, borderRadius: '50%', width: 28, height: 28, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: activeTab === 'account' ? '2px solid var(--rt-amber)' : '2px solid transparent',
              fontFamily: 'var(--rt-font-display)', fontWeight: 700, color: '#fff', fontSize: '0.7rem',
              transition: 'border-color 0.15s', overflow: 'hidden', padding: 0,
            }}>
              {myAvatarUrl
                ? <img src={myAvatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : avatarLetter
              }
            </div>
            <p style={{ fontSize: '0.72rem', color: 'var(--rt-t3)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{user?.email}</p>
          </button>
          <button onClick={signOut} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.7rem 0.75rem', borderRadius: 'var(--rt-r3)', border: 'none', background: 'none', color: 'var(--rt-t3)', fontFamily: 'var(--rt-font-body)', fontSize: '0.88rem', cursor: 'pointer', width: '100%' }}>
            ↩ Sign out
          </button>
        </div>
      </nav>

      {/* Desktop main */}
      <main className="rt-main-desktop" style={{ marginLeft: 220, flex: 1, minWidth: 0, minHeight: '100vh', paddingBottom: '2rem', boxSizing: 'border-box' }}>
        {renderPage()}
      </main>

      {/* ── Mobile top nav ──────────────────────────────── */}
      <header className="rt-topnav-mobile" style={{
        position: 'fixed', top: 0, left: 0, right: 0,
        background: 'var(--rt-white)', borderBottom: '1px solid var(--rt-border)',
        display: 'grid', gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.65rem)',
        paddingBottom: '0.65rem', paddingLeft: '1rem', paddingRight: '1rem',
        zIndex: 100, boxShadow: '0 1px 6px rgba(26,39,68,0.06)'
      }}>
        {/* Left: profile avatar */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button
            onClick={() => setActiveTab('account')}
            style={{
              background: avatarBg,
              border: (activeTab==='profile'||activeTab==='account') ? '2px solid var(--rt-amber)' : '2px solid transparent',
              borderRadius: '50%', width: 32, height: 32,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', fontFamily: 'var(--rt-font-display)',
              fontWeight: 700, color: '#fff', fontSize: '0.75rem', transition: 'border-color 0.15s',
              overflow: 'hidden', padding: 0,
            }}
          >
            {myAvatarUrl
              ? <img src={myAvatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : avatarLetter
            }
          </button>
        </div>

        {/* Centre: LitLoop wordmark */}
        <img src={logo} alt="LitLoop" style={{ height: '24px', display: 'block' }} />

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
                <div style={{ padding: '0.85rem 1rem 0.6rem', borderBottom: '1px solid var(--rt-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.88rem', fontWeight: 700, color: 'var(--rt-navy)' }}>Notifications</span>
                  {unreadSocialNotifs?.length > 0 && (
                    <button
                      onClick={() => markNotificationsRead?.(unreadSocialNotifs.map(n => n.id))}
                      style={{ background: 'none', border: 'none', fontSize: '0.7rem', color: 'var(--rt-amber)', cursor: 'pointer', fontWeight: 600, padding: 0 }}
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                {notifications.length === 0 ? (
                  <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--rt-t3)', fontSize: '0.82rem' }}>
                    <div style={{ fontSize: '1.5rem', marginBottom: '0.35rem' }}>🔔</div>
                    No notifications yet.
                  </div>
                ) : (
                  notifications.map(n => (
                    <div key={n.id} onClick={n.action}
                      style={{ display: 'flex', gap: '0.65rem', padding: '0.75rem 1rem', borderBottom: '1px solid var(--rt-border)', cursor: 'pointer', alignItems: 'flex-start', background: n.unread ? 'var(--rt-amber-pale)' : 'transparent' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--rt-surface)'}
                      onMouseLeave={e => e.currentTarget.style.background = n.unread ? 'var(--rt-amber-pale)' : 'transparent'}
                    >
                      <span style={{ fontSize: '1rem', flexShrink: 0, marginTop: 1 }}>{n.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--rt-navy)', lineHeight: 1.4 }}>{n.text}</div>
                        {n.time && <div style={{ fontSize: '0.65rem', color: 'var(--rt-t3)', marginTop: '0.2rem' }}>{timeAgo(n.time)}</div>}
                      </div>
                      {n.badge && (
                        <span style={{ background: 'var(--rt-amber)', color: '#fff', borderRadius: 99, fontSize: '0.6rem', fontWeight: 700, padding: '0.1em 0.45em', flexShrink: 0, alignSelf: 'center' }}>{n.badge}</span>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile page content */}
      <main className="rt-main-mobile" style={{ flex: 1, paddingTop: 'calc(56px + env(safe-area-inset-top, 0px))', paddingBottom: 64, width: '100%' }}>
        {renderPage()}
      </main>

      {/* ── Mobile bottom tab bar ──────────────────────── */}
      <nav className="rt-tabbar-mobile" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'var(--rt-white)',
        display: 'flex', flexDirection: 'column', zIndex: 100,
        boxShadow: '0 -1px 0 rgba(26,39,68,0.10), 0 -4px 12px rgba(26,39,68,0.06)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}>
        <div style={{ display: 'flex' }}>
        {MOBILE_TABS.map(tab => {
          const isActive = activeTab === tab.id || (tab.id === 'profile' && activeTab === 'account')
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center',
                gap: 0, padding: '0.55rem 0.25rem 0.5rem',
                border: 'none', background: 'none', cursor: 'pointer', position: 'relative',
                borderTop: isActive ? '3px solid var(--rt-amber)' : '3px solid transparent',
                transition: 'border-color 0.15s',
              }}
            >
              {tab.icon(isActive)}
              {tab.id === 'chat' && totalUnread > 0 && (
                <div style={{ position: 'absolute', top: 8, right: '50%', marginRight: -16, width: 7, height: 7, borderRadius: '50%', background: 'var(--rt-amber)', border: '1.5px solid white' }}/>
              )}
            </button>
          )
        })}
        </div>
      </nav>

      {activeChatModal && (
        <ChatThreadModal
          chat={activeChatModal}
          user={user}
          friends={friends}
          messages={messages}
          onClose={closeChatModal}
          onSend={sendMessage}
          onLoadEarlier={loadEarlier}
          onDeleteMessage={deleteMessage}
          loadParticipants={loadParticipants}
          updateChatName={updateChatName}
          addParticipants={addParticipants}
          findExistingChat={findExistingChat}
          onLeaveChat={leaveChat}
        />
      )}

      {/* ── Global FAB speed dial ── */}
      <style>{`
        @keyframes fabItemIn {
          from { opacity: 0; transform: translateY(12px) scale(0.85); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
        @keyframes toastSlideIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        .fab-item { animation: fabItemIn 0.18s ease forwards; }
        .fab-item:nth-child(1) { animation-delay: 0.00s; }
        .fab-item:nth-child(2) { animation-delay: 0.04s; }
        .fab-item:nth-child(3) { animation-delay: 0.08s; }
        .fab-item:nth-child(4) { animation-delay: 0.12s; }
      `}</style>

      {/* Backdrop */}
      {fabOpen && (
        <div onClick={() => setFabOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 198, background: 'rgba(10,15,30,0.35)' }} />
      )}

      {/* Speed dial items */}
      {fabOpen && (
        <div style={{ position: 'fixed', right: '1.25rem', zIndex: 199, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.6rem' }}
          className="rt-fab-items">
          {[
            { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>, label: 'Add friend',    action: 'friend' },
            { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>, label: 'Recommend',     action: 'recommend' },
            { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>, label: 'Start chat',    action: 'chat' },
            { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 2v7c0 1.25.75 2 2 2h3c-.25 2-1 4-3 4"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 2v7c0 1.25.75 2 2 2h3c-.25 2-1 4-3 4"/></svg>, label: 'Share moment',  action: 'moment' },
            { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>, label: 'Add book',      action: 'addbook' },
          ].map((item, i) => (
            <div key={item.action} className="fab-item"
              style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', opacity: 0 }}>
              <div style={{ background: 'var(--rt-white)', borderRadius: 'var(--rt-r3)', padding: '0.35rem 0.75rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--rt-navy)', boxShadow: '0 2px 10px rgba(10,15,30,0.15)', whiteSpace: 'nowrap' }}>
                {item.label}
              </div>
              <button
                onClick={() => { setFabOpen(false); setFabAction(item.action) }}
                style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--rt-navy)', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 12px rgba(10,15,30,0.25)', flexShrink: 0 }}>
                {item.icon}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* FAB button */}
      <button
        onClick={() => setFabOpen(v => !v)}
        className="rt-fab"
        style={{
          position: 'fixed', right: '1.25rem', zIndex: 200,
          width: 52, height: 52, borderRadius: '50%',
          background: fabOpen ? 'var(--rt-navy)' : 'var(--rt-amber)',
          color: '#fff', border: 'none',
          fontSize: fabOpen ? '1.4rem' : '1.65rem',
          cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(26,39,68,0.22)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 0.2s, transform 0.2s',
          transform: fabOpen ? 'rotate(45deg)' : 'rotate(0deg)',
        }}
        aria-label={fabOpen ? 'Close menu' : 'Quick actions'}
      >
        +
      </button>

      {/* ── FAB action modals ── */}
      {fabAction === 'moment' && (
        <MomentComposer
          user={user}
          books={books}
          onClose={() => setFabAction(null)}
          onPosted={() => { setFabAction(null); loadSocialData() }}
        />
      )}
      {fabAction === 'addbook' && (
        <AddBookModal
          books={books}
          onAdd={async d => { await addBook(d); setFabAction(null) }}
          onClose={() => setFabAction(null)}
          user={user}
        />
      )}
      {fabAction === 'friend' && (
        <FabFriendModal
          onClose={() => setFabAction(null)}
          sendFriendRequest={sendFriendRequest}
          generateInviteLink={generateInviteLink}
        />
      )}
      {fabAction === 'recommend' && (
        <FabRecommendModal
          books={books}
          friends={friends}
          user={user}
          recs={recs}
          sendRecommendation={sendRecommendation}
          onClose={() => setFabAction(null)}
        />
      )}
      {fabAction === 'chat' && (
        <FabChatModal
          books={books}
          friends={friends}
          chats={chats}
          startOrOpenChat={startOrOpenChat}
          onOpenChatModal={openChatModal}
          preselectedFriendId={fabChatPreselect}
          onClose={() => { setFabAction(null); setFabChatPreselect(null) }}
        />
      )}
      {/* Import progress banner */}
      {/* ── Import progress banner ── */}
      {importBanner && importBanner.status === 'loading' && (
        <div style={{
          position: 'fixed', bottom: '5rem', left: '50%', transform: 'translateX(-50%)',
          zIndex: 1100, width: 'min(96vw, 420px)',
          background: 'var(--rt-navy)', color: '#fff',
          borderRadius: 12, padding: '0.75rem 1rem',
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
          overflow: 'hidden',
        }}>
          {/* Progress bar strip along top */}
          {importBanner.pct > 0 && (
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'rgba(255,255,255,0.15)' }}>
              <div style={{ height: '100%', background: 'var(--rt-amber)', width: `${importBanner.pct}%`, transition: 'width 0.4s ease', borderRadius: '12px 0 0 0' }} />
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
            <span style={{ fontSize: '0.82rem', fontWeight: 500, flex: 1 }}>{importBanner.msg}</span>
            {importBanner.pct > 0 && (
              <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.55)', flexShrink: 0 }}>{importBanner.pct}%</span>
            )}
          </div>
        </div>
      )}
      {importBanner && (importBanner.status === 'done' || importBanner.status === 'error') && (
        <div style={{
          position: 'fixed', bottom: '5rem', left: '50%', transform: 'translateX(-50%)',
          zIndex: 1100, width: 'min(96vw, 420px)',
          background: importBanner.status === 'done' ? '#166534' : '#991b1b',
          color: '#fff', borderRadius: 12, padding: '0.75rem 1rem',
          display: 'flex', alignItems: 'center', gap: '0.65rem',
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
        }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 500, flex: 1 }}>{importBanner.msg}</span>
          <button
            onClick={() => { setImportBanner(null); sessionStorage.removeItem('litloop_import') }}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', fontSize: '1rem', cursor: 'pointer', padding: 0, lineHeight: 1, flexShrink: 0 }}
          >×</button>
        </div>
      )}
      {inAppToast && (
        <InAppToast
          key={inAppToast.id}
          toast={inAppToast}
          onDismiss={clearInAppToast}
        />
      )}
      <GlobalFriendBanner
        pending={pending}
        acceptFriendRequest={acceptFriendRequest}
        declineFriendRequest={declineFriendRequest}
        dismissedRequests={dismissedRequests}
        setDismissedRequests={setDismissedRequests}
      />
    </div>
  )
}