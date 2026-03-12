import { useState, useRef, useEffect } from 'react'
import { useAuthContext } from '../../context/AuthContext'
import { useChatContext } from '../../context/ChatContext'
import { useSocialContext } from '../../context/SocialContext'
import { useBooksContext } from '../../context/BooksContext'
import Home from '../../pages/Home'
import MyList from '../../pages/MyList'
import Stats from '../../pages/Stats'
import Discover from '../../pages/Discover'
import Chat, { ChatThreadModal } from '../../pages/Chat'
import Profile from '../../pages/Profile'
import AccountSettings from '../../pages/AccountSettings'
import AddBookModal from '../books/AddBookModal'
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
  { id: 'stats',    label: 'Stats',   icon: null       },
  { id: 'profile',  label: 'Profile', icon: IcoProfile },
]

// ── FAB: Add Friend modal ─────────────────────────────────────
function FabFriendModal({ onClose, sendFriendRequest, generateInviteLink }) {
  const [input, setInput]       = useState('')
  const [msg, setMsg]           = useState(null)
  const [loading, setLoading]   = useState(false)
  const [copied, setCopied]     = useState(false)

  async function handleAdd(e) {
    e.preventDefault()
    const username = input.trim().replace(/^@/, '')
    if (!username) return
    setLoading(true); setMsg(null)
    const { error } = await sendFriendRequest(username)
    if (error) setMsg({ type: 'error', text: error })
    else { setMsg({ type: 'success', text: `✓ Request sent to @${username}!` }); setInput('') }
    setLoading(false)
  }

  async function handleCopy() {
    const link = await generateInviteLink()
    if (link) {
      try { await navigator.clipboard.writeText(link) } catch {}
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 300, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--rt-white)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, padding: '1.5rem 1.25rem 2rem' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.15rem', fontWeight: 700, color: 'var(--rt-navy)' }}>Add a friend</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--rt-t3)' }}>×</button>
        </div>

        {/* Invite link — big and prominent */}
        <div style={{ background: 'var(--rt-navy)', borderRadius: 'var(--rt-r3)', padding: '1rem 1.25rem', marginBottom: '1.25rem', cursor: 'pointer' }} onClick={handleCopy}>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: '0.3rem' }}>Share your invite link</div>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff', marginBottom: '0.5rem' }}>Invite friends to LitLoop</div>
          <div style={{ background: copied ? 'var(--rt-teal)' : 'var(--rt-amber)', color: '#fff', borderRadius: 8, padding: '0.6rem 1rem', textAlign: 'center', fontSize: '0.85rem', fontWeight: 700, transition: 'background 0.2s' }}>
            {copied ? '✓ Copied!' : 'Copy invite link'}
          </div>
        </div>

        {/* Search by username */}
        <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.5rem' }}>Or find by username</div>
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            className="rt-input" style={{ flex: 1 }}
            placeholder="@username"
            value={input} onChange={e => setInput(e.target.value)}
            autoFocus
          />
          <button type="submit" disabled={loading || !input.trim()}
            style={{ background: 'var(--rt-navy)', color: '#fff', border: 'none', borderRadius: 'var(--rt-r3)', padding: '0.7rem 1.1rem', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer', opacity: !input.trim() ? 0.5 : 1 }}>
            {loading ? '…' : 'Send'}
          </button>
        </form>
        {msg && <div style={{ marginTop: '0.6rem', fontSize: '0.82rem', color: msg.type === 'error' ? '#dc2626' : 'var(--rt-teal)', fontWeight: 600 }}>{msg.text}</div>}
      </div>
    </div>
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 300, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--rt-white)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, padding: '1.25rem', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
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
                  {b.coverId ? <img src={`https://covers.openlibrary.org/b/id/${b.coverId}-S.jpg`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : <span style={{ fontSize: '1rem' }}>📚</span>}
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
    </div>
  )
}

// ── FAB: Start chat modal ─────────────────────────────────────
function FabChatModal({ books, friends, chats, startOrOpenChat, onOpenChatModal, onClose }) {
  const { myUsername, myDisplayName } = useSocialContext()
  const [step, setStep]           = useState('book') // 'book' | 'friends'
  const [search, setSearch]       = useState('')
  const [selectedBook, setSelectedBook] = useState(null)
  const [selectedFriends, setSelectedFriends] = useState(new Set())
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
    if (!selectedFriends.size || !selectedBook) return
    const friendIds = [...selectedFriends]
    setStarting(true)
    const selectedFriendObjs = friends.filter(f => friendIds.includes(f.userId))
    const myName = myDisplayName || myUsername || 'me'
    const friendNames = selectedFriendObjs.map(f => f.displayName || f.username || 'friend')
    const autoName = friendIds.length === 1
      ? `${myName} & ${friendNames[0]}`
      : `${myName} & ${friendNames.slice(0, 2).join(' & ')}${friendIds.length > 2 ? ` +${friendIds.length - 2}` : ''}`
    const chatId = await startOrOpenChat(selectedBook.olKey, selectedBook.title, selectedBook.author, selectedBook.coverId, friendIds, null, autoName)
    setStarting(false)
    if (chatId) {
      onOpenChatModal?.({ id: chatId, bookOlKey: selectedBook.olKey, bookTitle: selectedBook.title, bookAuthor: selectedBook.author, coverIdRaw: selectedBook.coverId, chatName: autoName }, selectedBook)
    }
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 300, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--rt-white)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, padding: '1.25rem', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
          <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--rt-navy)' }}>
            {step === 'book' ? 'Chat about a book' : `Chat about "${selectedBook?.title}"`}
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
                  {b.coverId ? <img src={`https://covers.openlibrary.org/b/id/${b.coverId}-S.jpg`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : <span style={{ fontSize: '1rem' }}>📚</span>}
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
            <button onClick={() => setStep('book')} style={{ background: 'none', border: 'none', color: 'var(--rt-amber)', fontSize: '0.78rem', cursor: 'pointer', padding: 0, fontWeight: 600 }}>← Change book</button>
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
    </div>
  )
}

export default function AppShell() {
  const { user, signOut }   = useAuthContext()
  const { totalUnread, chats, openThread, closeThread, markChatRead, messages,
          sendMessage, deleteMessage, loadEarlier, startOrOpenChat,
          loadParticipants, updateChatName, addParticipants,
          leaveChat } = useChatContext()
  const { pending, feed, recs, friends, sendRecommendation, generateInviteLink, sendFriendRequest } = useSocialContext()
  const { books, addBook } = useBooksContext()
  const [activeTab, setActiveTab]         = useState('home')
  const [notifOpen, setNotifOpen]         = useState(false)
  const [activeChatModal, setActiveChatModal] = useState(null)
  const [fabOpen, setFabOpen]             = useState(false)
  const [fabAction, setFabAction]         = useState(null) // 'addbook'|'recommend'|'chat'|'friend'
  const bellRef = useRef(null)

  function onNavigate(tab) { setActiveTab(tab) }

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

  function findExistingChat(olKey) {
    if (!olKey || !chats) return null
    return chats.find(c => c.bookOlKey === olKey) || null
  }

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

  // Build notifications list — chats with unread messages first, then social
  const unreadChats = (chats || []).filter(c => c.unread > 0)
  const notifications = [
    ...unreadChats.map(c => ({
      id: 'chat-' + c.id,
      icon: '💬',
      text: c.lastMessagePreview
        ? `New message in "${c.chatName || c.bookTitle}": ${c.lastMessagePreview.slice(0, 60)}${c.lastMessagePreview.length > 60 ? '…' : ''}`
        : `New message in "${c.chatName || c.bookTitle}"`,
      time: c.lastMessageAt,
      badge: c.unread > 1 ? c.unread : null,
      action: () => { openChatModal(c, { title: c.bookTitle, author: c.bookAuthor, coverId: c.coverIdRaw }); setNotifOpen(false) }
    })),
    ...pending.map(p => ({
      id: 'req-' + p.friendshipId,
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
      case 'home':     return <Home            onNavigate={onNavigate} onOpenChatModal={openChatModal} />
      case 'mylist':   return <MyList          onNavigate={onNavigate} onOpenChatModal={openChatModal} />
      case 'stats':    return <Stats           onNavigate={onNavigate} />
      case 'discover': return <Discover        onNavigate={onNavigate} onOpenChatModal={openChatModal} />
      case 'chat':     return <Chat            onNavigate={onNavigate} onOpenChatModal={openChatModal} />
      case 'profile':  return <Profile         onNavigate={onNavigate} onOpenChatModal={openChatModal} />
      case 'account':  return <AccountSettings onNavigate={onNavigate} />
      default:         return <Home            onNavigate={onNavigate} onOpenChatModal={openChatModal} />
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
              transition: 'border-color 0.15s',
            }}>{avatarLetter}</div>
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
        padding: '0.65rem 1rem', zIndex: 100, boxShadow: '0 1px 6px rgba(26,39,68,0.06)'
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
            { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>, label: 'Add friend',  action: 'friend' },
            { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>, label: 'Recommend',   action: 'recommend' },
            { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>, label: 'Start chat',  action: 'chat' },
            { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>, label: 'Add book',    action: 'addbook' },
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
          onClose={() => setFabAction(null)}
        />
      )}
    </div>
  )
}