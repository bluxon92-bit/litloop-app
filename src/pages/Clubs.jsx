import { useState, useRef } from 'react'
import { useClubs } from '../hooks/useClubs'
import { useSocialContext } from '../context/SocialContext'
import { useChatContext } from '../context/ChatContext'
import { useAuthContext } from '../context/AuthContext'
import CoverImage from '../components/books/CoverImage'
import { avatarColour, avatarInitial } from '../lib/utils'
import { sb } from '../lib/supabase'

// ── Shared palette ────────────────────────────────────────────
const GRADIENTS = [
  'linear-gradient(135deg,#1a2744,#2A6E69)',
  'linear-gradient(135deg,#2d4a8a,#4a7fc1)',
  'linear-gradient(135deg,#c8891a,#b43a3a)',
  'linear-gradient(135deg,#2A6E69,#5ca8a2)',
  'linear-gradient(135deg,#7b3fa0,#2d4a8a)',
  'linear-gradient(135deg,#4a7fc1,#1e3a5f)',
  'linear-gradient(135deg,#5ca8a2,#2A6E69)',
  'linear-gradient(135deg,#b43a3a,#7b3fa0)',
]

const ICONS = [
  // open book
  <svg key={0} width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
  // quill
  <svg key={1} width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5"><path d="M20 4a9 9 0 0 1-9 9H3L20 4z"/><path d="M3 13l4 4"/></svg>,
  // candle
  <svg key={2} width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5"><rect x="8" y="10" width="8" height="12" rx="1"/><path d="M12 6c0-1.5 2-2 2-4-1 0-2 1-2 2 0-1-1-2-2-2 0 2 2 2.5 2 4z" fill="rgba(255,255,255,0.9)"/></svg>,
  // moon
  <svg key={3} width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>,
  // book stack
  <svg key={4} width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>,
  // lantern
  <svg key={5} width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5"><rect x="8" y="5" width="8" height="14" rx="3"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="5" y1="10" x2="8" y2="10"/><line x1="16" y1="10" x2="19" y2="10"/></svg>,
  // coffee
  <svg key={6} width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5"><path d="M17 8h1a4 4 0 0 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/></svg>,
  // star
  <svg key={7} width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
]

function ClubIcon({ iconIndex, gradientIndex, size = 48 }) {
  const r = size <= 32 ? 6 : 10
  return (
    <div style={{
      width: size, height: size, borderRadius: r,
      background: GRADIENTS[gradientIndex % GRADIENTS.length],
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      {ICONS[iconIndex % ICONS.length]}
    </div>
  )
}

// ── Format meeting time for display ──────────────────────────
function fmtMeeting(val) {
  if (!val) return ''
  try {
    return new Date(val).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch { return val }
}

// ── Book row (current / upcoming / previous) ──────────────────
function ClubBookRow({ book, badge, badgeStyle, onOpenChat, isAdmin, onMarkDone }) {
  if (!book) return null
  return (
    <div onClick={() => book.chat_id && onOpenChat?.(book.chat_id)}
      style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: book.chat_id ? 'pointer' : 'default' }}>
      <CoverImage coverId={book.cover_id} olKey={book.book_ol_key} title={book.book_title} size="L"
        style={{ width: 44, height: 64, borderRadius: 5, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...badgeStyle, display: 'inline-block', fontSize: '0.6rem', fontWeight: 700, padding: '2px 7px', borderRadius: 99, marginBottom: 4 }}>{badge}</div>
        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--rt-navy)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{book.book_title}</div>
        <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)' }}>{book.book_author}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
        {isAdmin && badge === 'Now reading' && (
          <button onClick={e => { e.stopPropagation(); onMarkDone?.() }}
            style={{ background: 'none', border: '0.5px solid var(--rt-border-md)', borderRadius: 7, padding: '4px 8px', fontSize: '0.65rem', fontWeight: 600, color: 'var(--rt-t3)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            Mark done ✓
          </button>
        )}
        {book.chat_id && <span style={{ fontSize: '1rem', color: 'var(--rt-t3)' }}>›</span>}
      </div>
    </div>
  )
}

// ── Settings sheet ────────────────────────────────────────────
function SettingsSheet({ club, friends, onClose, onUpdate, onAssignBook, onMarkDone, onAddMember, onRemoveMember, onSetRole, onLeave, onDelete, onOpenChatModal, startOrOpenChat }) {
  const { user: currentUser } = useAuthContext()
  const [view, setView] = useState('main') // main | assign-current | assign-upcoming | add-member | edit-details
  const [bookSearch, setBookSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [editForm, setEditForm] = useState(() => ({ name: club.name || '', meetingTime: club.meetingTime || '', meetingPlace: club.meetingPlace || '', pinnedMessage: club.pinnedMessage || '' }))

  async function searchOL(q) {
    if (!q.trim()) return
    setSearching(true)
    try {
      const res = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=6&fields=key,title,author_name,cover_i`)
      const data = await res.json()
      setSearchResults((data.docs || []).map(d => ({
        title:   d.title,
        author:  d.author_name?.[0] || '',
        olKey:   d.key,
        coverId: d.cover_i || null,
      })))
    } catch { setSearchResults([]) }
    setSearching(false)
  }

  async function pickBook(book, status) {
    // Create a chat for this book
    const chatId = await startOrOpenChat(book.olKey, book.title, book.author, book.coverId, [], null, `${club.name} — ${book.title}`)
    await onAssignBook(club.id, status, book, chatId)
    setView('main')
    setBookSearch('')
    setSearchResults([])
  }

  if (view === 'assign-current' || view === 'assign-upcoming') {
    const label = view === 'assign-current' ? 'current read' : 'upcoming read'
    const status = view === 'assign-current' ? 'current' : 'upcoming'
    return (
      <div style={{ padding: '1.25rem 1rem' }}>
        <button onClick={() => setView('main')} style={{ background: 'none', border: 'none', color: 'var(--rt-t3)', fontSize: '0.8rem', cursor: 'pointer', padding: 0, marginBottom: '0.85rem' }}>← Back</button>
        <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--rt-navy)', marginBottom: '0.85rem' }}>Set {label}</div>
        <div style={{ marginBottom: '0.85rem' }}>
          <input className="rt-input" style={{ width: '100%', boxSizing: 'border-box' }}
            placeholder={searching ? 'Searching…' : 'Search books…'}
            value={bookSearch}
            onChange={e => { setBookSearch(e.target.value); clearTimeout(window._olTimer); window._olTimer = setTimeout(() => searchOL(e.target.value), 400) }}
            onKeyDown={e => { if (e.key === 'Enter') { clearTimeout(window._olTimer); searchOL(bookSearch) } }} />
        </div>
        {searchResults.map((b, i) => (
          <div key={i} onClick={() => pickBook(b, status)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '0.5px solid var(--rt-border)', cursor: 'pointer' }}>
            <CoverImage coverId={b.coverId} olKey={b.olKey} title={b.title} size="S" style={{ width: 36, height: 52, borderRadius: 4, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--rt-navy)' }}>{b.title}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)' }}>{b.author}</div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (view === 'edit-details') {
    return (
      <div style={{ padding: '1.25rem 1rem', paddingBottom: '1.5rem' }}>
        <button onClick={() => setView('main')} style={{ background: 'none', border: 'none', color: 'var(--rt-t3)', fontSize: '0.8rem', cursor: 'pointer', padding: 0, marginBottom: '0.85rem' }}>← Back</button>
        <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--rt-navy)', marginBottom: '0.85rem' }}>Edit club details</div>
        <div style={{ marginBottom: '0.85rem' }}>
          <label className="rt-field-label">Club name</label>
          <input className="rt-input" style={{ width: '100%' }} value={editForm.name || club.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div style={{ marginBottom: '0.85rem' }}>
          <label className="rt-field-label">Next meeting</label>
          <input type="datetime-local" className="rt-input" style={{ width: '100%' }} value={editForm.meetingTime} onChange={e => setEditForm(f => ({ ...f, meetingTime: e.target.value }))} />
        </div>
        <div style={{ marginBottom: '0.85rem' }}>
          <label className="rt-field-label">Location</label>
          <input className="rt-input" style={{ width: '100%' }} placeholder="e.g. The Crown, Soho" value={editForm.meetingPlace} onChange={e => setEditForm(f => ({ ...f, meetingPlace: e.target.value }))} />
        </div>
        <div style={{ marginBottom: '1.25rem' }}>
          <label className="rt-field-label">Pinned message</label>
          <textarea className="rt-textarea" rows={3} style={{ width: '100%', resize: 'none' }} placeholder="A note for your members…" value={editForm.pinnedMessage} onChange={e => setEditForm(f => ({ ...f, pinnedMessage: e.target.value }))} />
        </div>
        <button onClick={async () => {
          await onUpdate(club.id, { name: editForm.name || club.name, meetingTime: editForm.meetingTime, meetingPlace: editForm.meetingPlace, pinnedMessage: editForm.pinnedMessage })
          setView('main')
        }} style={{ width: '100%', background: 'var(--rt-navy)', border: 'none', borderRadius: 'var(--rt-r3)', padding: '0.75rem 1rem', fontFamily: 'var(--rt-font-body)', fontSize: '0.88rem', fontWeight: 700, color: '#fff', cursor: 'pointer' }}>Save changes</button>
      </div>
    )
  }

  if (view === 'add-member') {
    const existingIds = new Set(club.members.map(m => m.userId))
    const available = (friends || []).filter(f => !existingIds.has(f.userId))
    return (
      <div style={{ padding: '1.25rem 1rem' }}>
        <button onClick={() => setView('main')} style={{ background: 'none', border: 'none', color: 'var(--rt-t3)', fontSize: '0.8rem', cursor: 'pointer', padding: 0, marginBottom: '0.85rem' }}>← Back</button>
        <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--rt-navy)', marginBottom: '0.85rem' }}>Add members</div>
        {available.length === 0 ? (
          <div style={{ fontSize: '0.85rem', color: 'var(--rt-t3)', textAlign: 'center', padding: '1.5rem 0' }}>All your friends are already in this club.</div>
        ) : available.map(f => (
          <div key={f.userId} onClick={async () => { await onAddMember(club.id, f.userId); setView('main') }}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.65rem 0', borderBottom: '0.5px solid var(--rt-border)', cursor: 'pointer' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: avatarColour(f.userId), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, color: '#fff', flexShrink: 0, overflow: 'hidden' }}>
              {f.avatarUrl ? <img src={f.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : avatarInitial(f.displayName)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--rt-navy)' }}>{f.displayName}</div>
              {f.username && <div style={{ fontSize: '0.7rem', color: 'var(--rt-t3)' }}>@{f.username}</div>}
            </div>
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--rt-amber)' }}>+ Add</span>
          </div>
        ))}
      </div>
    )
  }

  const isAdmin = club.myRole === 'admin'

  return (
    <div>
      <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--rt-navy)', padding: '1rem 1rem 0' }}>{club.name}</div>

      {isAdmin && (
        <div style={{ borderBottom: '0.5px solid var(--rt-border)', padding: '0.6rem 0' }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--rt-t3)', padding: '0.35rem 1rem 0.2rem' }}>Reading</div>
          {[
            { label: 'Set current read', sub: club.currentBook ? `Currently: ${club.currentBook.book_title}` : 'Not set', action: () => setView('assign-current') },
            { label: 'Set upcoming read', sub: club.upcomingBook ? `Currently: ${club.upcomingBook.book_title}` : 'Not set', action: () => setView('assign-upcoming') },
            ...(club.currentBook ? [{ label: 'Mark current read as done', sub: club.upcomingBook ? 'Promotes upcoming → current' : 'Moves to history', action: async () => { await onMarkDone(club.id); onClose() } }] : []),
          ].map(({ label, sub, action }) => (
            <div key={label} onClick={action} style={{ display: 'flex', alignItems: 'center', padding: '0.7rem 1rem', cursor: 'pointer', borderBottom: '0.5px solid var(--rt-border)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--rt-navy)' }}>{label}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)' }}>{sub}</div>
              </div>
              <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--rt-amber)' }}>→</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ borderBottom: '0.5px solid var(--rt-border)', padding: '0.6rem 0' }}>
        <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--rt-t3)', padding: '0.35rem 1rem 0.2rem' }}>Members</div>
        {club.members.map(m => (
          <div key={m.userId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.55rem 1rem', borderBottom: '0.5px solid var(--rt-border)' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: avatarColour(m.userId), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700, color: '#fff', overflow: 'hidden', flexShrink: 0 }}>
              {m.avatarUrl ? <img src={m.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : avatarInitial(m.displayName)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--rt-navy)' }}>{m.displayName}</div>
              <div style={{ fontSize: '0.68rem', color: 'var(--rt-t3)' }}>{m.role === 'admin' ? 'Admin' : 'Member'}</div>
            </div>
            {isAdmin && m.userId !== currentUser?.id && (
              <button onClick={() => onSetRole(club.id, m.userId, m.role === 'admin' ? 'member' : 'admin')}
                style={{ fontSize: '0.68rem', fontWeight: 600, color: m.role === 'admin' ? '#b43a3a' : 'var(--rt-amber)', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {m.role === 'admin' ? 'Remove admin' : 'Make admin'}
              </button>
            )}
            {isAdmin && m.userId !== currentUser?.id && (
              <button onClick={() => { if (window.confirm(`Remove ${m.displayName}?`)) onRemoveMember(club.id, m.userId) }}
                style={{ fontSize: '0.68rem', fontWeight: 600, color: '#b43a3a', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
            )}
          </div>
        ))}
        {isAdmin && (
          <div onClick={() => setView('add-member')} style={{ display: 'flex', alignItems: 'center', padding: '0.7rem 1rem', cursor: 'pointer' }}>
            <div style={{ flex: 1, fontSize: '0.85rem', fontWeight: 600, color: 'var(--rt-navy)' }}>Add members</div>
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--rt-amber)' }}>+ Add</span>
          </div>
        )}
      </div>

      {isAdmin && (
        <div style={{ borderBottom: '0.5px solid var(--rt-border)', padding: '0.6rem 0' }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--rt-t3)', padding: '0.35rem 1rem 0.2rem' }}>Club</div>
          <div onClick={() => setView('edit-details')} style={{ display: 'flex', alignItems: 'center', padding: '0.7rem 1rem', cursor: 'pointer' }}>
            <div style={{ flex: 1, fontSize: '0.85rem', fontWeight: 600, color: 'var(--rt-navy)' }}>Edit club details</div>
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--rt-amber)' }}>Edit</span>
          </div>
        </div>
      )}

      {/* Footer — delete (left) for admins, leave for members */}
      <div style={{ padding: '0.85rem 1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        {isAdmin ? (
          <button onClick={() => { if (window.confirm('Delete this club? This cannot be undone.')) { onDelete(club.id); onClose() } }}
            style={{ background: 'none', border: '0.5px solid var(--rt-border-md)', borderRadius: 'var(--rt-r3)', padding: '0.55rem 0.85rem', fontSize: '0.78rem', fontWeight: 600, color: '#b43a3a', cursor: 'pointer' }}>
            Delete club
          </button>
        ) : (
          <button onClick={() => { if (window.confirm('Leave this club?')) { onLeave(club.id); onClose() } }}
            style={{ background: 'none', border: '0.5px solid var(--rt-border-md)', borderRadius: 'var(--rt-r3)', padding: '0.55rem 0.85rem', fontSize: '0.78rem', fontWeight: 600, color: 'var(--rt-t3)', cursor: 'pointer' }}>
            Leave club
          </button>
        )}
      </div>


    </div>
  )
}

// ── Club card ─────────────────────────────────────────────────
function ClubCard({ club, onOpenChat, onUpdate, onAssignBook, onMarkDone, onAddMember, onRemoveMember, onSetRole, onLeave, onDelete, friends, startOrOpenChat, onOpenChatModal }) {
  const [bodyOpen, setBodyOpen]       = useState(false)
  const [membersOpen, setMembersOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [showAllPrev, setShowAllPrev] = useState(false)

  const prevToShow = showAllPrev ? club.previousBooks : club.previousBooks.slice(0, 3)

  return (
    <>
      <div style={{ background: 'var(--rt-white)', border: '0.5px solid var(--rt-border)', borderRadius: 14, marginBottom: 10, overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '12px 14px', cursor: 'pointer', userSelect: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div onClick={() => setBodyOpen(v => !v)} style={{ display: 'contents' }}>
              <ClubIcon iconIndex={club.iconIndex} gradientIndex={club.gradientIndex} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }} onClick={() => setBodyOpen(v => !v)}>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--rt-navy)', marginBottom: 3 }}>{club.name}</div>
              {club.meetingTime && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', color: 'var(--rt-t3)', marginBottom: 1 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--rt-t3)" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  {fmtMeeting(club.meetingTime)}
                </div>
              )}
              {club.meetingPlace && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', color: 'var(--rt-t3)' }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--rt-t3)" strokeWidth="2"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg>
                  {club.meetingPlace}
                </div>
              )}
            </div>
            {/* ⋯ top right */}
            <button onClick={e => { e.stopPropagation(); setSettingsOpen(true) }}
              style={{ background: 'none', border: 'none', fontSize: '1.2rem', color: 'var(--rt-t3)', cursor: 'pointer', padding: '0 2px', lineHeight: 1, flexShrink: 0 }}>⋯</button>
          </div>
          {/* ▼ bottom right */}
          <div onClick={() => setBodyOpen(v => !v)} style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
            <span style={{ fontSize: '0.6rem', color: 'var(--rt-t3)', transition: 'transform .2s', display: 'inline-block', transform: bodyOpen ? 'rotate(180deg)' : 'none' }}>▼</span>
          </div>
        </div>

        {/* Member banner — compact, no chevron */}
        <div onClick={() => setMembersOpen(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderTop: '0.5px solid var(--rt-border)', cursor: 'pointer', background: 'var(--rt-surface)', userSelect: 'none' }}>
          <div style={{ display: 'flex' }}>
            {club.members.slice(0, 5).map((m, i) => (
              <div key={m.userId} style={{ width: 22, height: 22, borderRadius: '50%', background: avatarColour(m.userId), border: '2px solid var(--rt-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.5rem', fontWeight: 700, color: '#fff', marginLeft: i === 0 ? 0 : -7, zIndex: 5 - i, overflow: 'hidden', flexShrink: 0, position: 'relative' }}>
                {m.avatarUrl ? <img src={m.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : avatarInitial(m.displayName)}
              </div>
            ))}
            {club.members.length > 5 && <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--rt-border-md)', border: '2px solid var(--rt-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.5rem', fontWeight: 700, color: 'var(--rt-t3)', marginLeft: -7, flexShrink: 0 }}>+{club.members.length - 5}</div>}
          </div>
          <div style={{ flex: 1, fontSize: '0.7rem', color: 'var(--rt-t3)' }}>{club.members.length} member{club.members.length !== 1 ? 's' : ''}</div>
        </div>

        {/* Member list panel */}
        {membersOpen && (
          <div style={{ borderTop: '0.5px solid var(--rt-border)', padding: '8px 14px', background: 'var(--rt-surface)' }}>
            {club.members.map(m => (
              <div key={m.userId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '0.5px solid var(--rt-border)' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: avatarColour(m.userId), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700, color: '#fff', overflow: 'hidden', flexShrink: 0 }}>
                  {m.avatarUrl ? <img src={m.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : avatarInitial(m.displayName)}
                </div>
                <div style={{ flex: 1, fontSize: '0.8rem', fontWeight: 600, color: 'var(--rt-navy)' }}>{m.displayName}</div>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: m.role === 'admin' ? '#faeeda' : 'var(--rt-surface)', color: m.role === 'admin' ? '#c8891a' : 'var(--rt-t3)' }}>{m.role === 'admin' ? 'Admin' : 'Member'}</div>
              </div>
            ))}
          </div>
        )}

        {/* Club body */}
        {bodyOpen && (
          <div>
            {/* Club details */}
            {(club.meetingTime || club.meetingPlace || club.pinnedMessage) && (
              <div style={{ padding: '10px 14px', borderTop: '0.5px solid var(--rt-border)' }}>
                <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: 8 }}>Club details</div>
                {club.meetingTime && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--rt-amber)" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--rt-navy)' }}>{fmtMeeting(club.meetingTime)}</span>
                  </div>
                )}
                {club.meetingPlace && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--rt-amber)" strokeWidth="2"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--rt-navy)' }}>{club.meetingPlace}</span>
                  </div>
                )}
                {club.pinnedMessage && (
                  <div style={{ background: 'var(--rt-surface)', borderLeft: '3px solid var(--rt-amber)', borderRadius: '0 8px 8px 0', padding: '7px 10px', fontSize: '0.78rem', color: 'var(--rt-t2)', lineHeight: 1.5, marginTop: 4 }}>
                    📌 {club.pinnedMessage}
                  </div>
                )}
              </div>
            )}

            {/* Current read */}
            {club.currentBook && (
              <div style={{ padding: '12px 14px', borderTop: '0.5px solid var(--rt-border)' }}>
                <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: 10 }}>Current read</div>
                <ClubBookRow book={club.currentBook} badge="Now reading"
                  badgeStyle={{ background: 'var(--rt-navy)', color: '#fff' }}
                  onOpenChat={chatId => { const c = { id: chatId, bookTitle: club.currentBook.book_title, bookAuthor: club.currentBook.book_author, coverIdRaw: club.currentBook.cover_id, bookOlKey: club.currentBook.book_ol_key }; onOpenChatModal?.(c) }}
                  isAdmin={club.myRole === 'admin'}
                  onMarkDone={() => onMarkDone(club.id)} />
              </div>
            )}

            {/* Upcoming read */}
            {club.upcomingBook && (
              <div style={{ padding: '12px 14px', borderTop: '0.5px solid var(--rt-border)' }}>
                <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: 10 }}>Upcoming read</div>
                <ClubBookRow book={club.upcomingBook} badge="Up next"
                  badgeStyle={{ background: 'var(--rt-surface)', color: 'var(--rt-t3)' }}
                  onOpenChat={chatId => { const c = { id: chatId, bookTitle: club.upcomingBook.book_title, bookAuthor: club.upcomingBook.book_author, coverIdRaw: club.upcomingBook.cover_id, bookOlKey: club.upcomingBook.book_ol_key }; onOpenChatModal?.(c) }} />
              </div>
            )}

            {/* Previous reads */}
            {club.previousBooks.length > 0 && (
              <div style={{ padding: '12px 14px', borderTop: '0.5px solid var(--rt-border)' }}>
                <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: 10 }}>Previous reads</div>
                {prevToShow.map((b, i) => (
                  <div key={b.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '7px 0', borderBottom: i < prevToShow.length - 1 ? '0.5px solid var(--rt-border)' : 'none', cursor: b.chat_id ? 'pointer' : 'default' }}
                    onClick={() => { if (b.chat_id) { const c = { id: b.chat_id, bookTitle: b.book_title, bookAuthor: b.book_author, coverIdRaw: b.cover_id, bookOlKey: b.book_ol_key }; onOpenChatModal?.(c) } }}>
                    <CoverImage coverId={b.cover_id} olKey={b.book_ol_key} title={b.book_title} size="L"
                      style={{ width: 44, height: 64, borderRadius: 5, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.65rem', color: 'var(--rt-t3)', marginBottom: 3 }}>{b.completed_at ? new Date(b.completed_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : ''}</div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--rt-navy)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.book_title}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)' }}>{b.book_author}</div>

                    </div>
                  </div>
                ))}
                {club.previousBooks.length > 3 && (
                  <button onClick={() => setShowAllPrev(v => !v)}
                    style={{ background: 'none', border: 'none', color: 'var(--rt-amber)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', padding: '6px 0 0' }}>
                    {showAllPrev ? 'Show less ↑' : `Show more (${club.previousBooks.length - 3} more) ›`}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Settings sheet — bottom on mobile, centred popup on desktop */}
      {settingsOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={() => setSettingsOpen(false)}
          className="rt-settings-backdrop">
          <style>{`@media (min-width: 640px) { .rt-settings-backdrop { align-items: center !important; } .rt-settings-sheet { border-radius: 16px !important; max-height: 75vh !important; } }`}</style>
          <div className="rt-settings-sheet" style={{ background: 'var(--rt-white)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, maxHeight: '85vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 36, height: 4, background: 'var(--rt-border-md)', borderRadius: 99, margin: '12px auto 4px', flexShrink: 0 }} />
            <div style={{ overflowY: 'auto', flex: 1 }}>
            <SettingsSheet
              club={club} friends={friends}
              onClose={() => setSettingsOpen(false)}
              onUpdate={onUpdate} onAssignBook={onAssignBook} onMarkDone={onMarkDone}
              onAddMember={onAddMember} onRemoveMember={onRemoveMember} onSetRole={onSetRole}
              onLeave={onLeave} onDelete={onDelete}
              startOrOpenChat={startOrOpenChat} onOpenChatModal={onOpenChatModal}
            />
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Create club flow ──────────────────────────────────────────
function CreateClubFlow({ friends, onDone, onCancel, startOrOpenChat }) {
  const [step, setStep]         = useState(1)
  const [form, setForm]         = useState({ name: '', iconIndex: 0, gradientIndex: 0, meetingTime: '', meetingPlace: '', pinnedMessage: '' })
  const [selectedMembers, setSelectedMembers] = useState([])
  const [saving, setSaving]     = useState(false)
  const { createClub, assignBook } = useClubs()

  // OL book search for starting book
  const [bookSearch, setBookSearch]   = useState('')
  const [bookResults, setBookResults] = useState([])
  const [searching, setSearching]     = useState(false)
  const [startBook, setStartBook]     = useState(null)
  const [startMode, setStartMode]     = useState(null) // 'new' | null

  async function searchOL(q) {
    if (!q.trim()) return
    setSearching(true)
    try {
      const res = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=6&fields=key,title,author_name,cover_i`)
      const data = await res.json()
      setBookResults((data.docs || []).map(d => ({ title: d.title, author: d.author_name?.[0] || '', olKey: d.key, coverId: d.cover_i || null })))
    } catch { setBookResults([]) }
    setSearching(false)
  }

  function toggleMember(id) {
    setSelectedMembers(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  }

  async function finish() {
    setSaving(true)
    const clubId = await createClub({ ...form, memberIds: selectedMembers })
    if (clubId && startBook) {
      const chatId = await startOrOpenChat(startBook.olKey, startBook.title, startBook.author, startBook.coverId, selectedMembers, null, null)
      await assignBook(clubId, 'current', startBook, chatId)
    }
    setSaving(false)
    await new Promise(r => setTimeout(r, 300))
    onDone?.()
  }

  const pf = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div style={{ padding: '1.25rem 1rem' }}>
      {/* Step indicator */}
      <div style={{ display: 'flex', gap: 4, marginBottom: '1rem' }}>
        {[1,2,3,4].map(s => (
          <div key={s} style={{ flex: 1, height: 3, borderRadius: 99, background: s <= step ? 'var(--rt-navy)' : 'var(--rt-border)' }} />
        ))}
      </div>

      {step === 1 && (
        <>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-amber)', marginBottom: 4 }}>Step 1 of 4</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--rt-navy)', marginBottom: '1rem' }}>Name your club</div>
          <label className="rt-field-label">Club name</label>
          <input className="rt-input" style={{ width: '100%', marginBottom: '1rem' }} placeholder="e.g. Dark Fantasy Readers" value={form.name} onChange={e => pf('name', e.target.value)} />

          <label className="rt-field-label">Club icon</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '1rem' }}>
            {ICONS.map((_, i) => (
              <div key={i} onClick={() => pf('iconIndex', i)}
                style={{ width: 52, height: 52, borderRadius: 10, background: GRADIENTS[form.gradientIndex], display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: `2px solid ${form.iconIndex === i ? 'var(--rt-navy)' : 'transparent'}` }}>
                {ICONS[i]}
              </div>
            ))}
          </div>

          <label className="rt-field-label">Colour</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: '1rem' }}>
            {GRADIENTS.map((g, i) => (
              <div key={i} onClick={() => pf('gradientIndex', i)}
                style={{ width: 26, height: 26, borderRadius: '50%', background: g, cursor: 'pointer', border: `2px solid ${form.gradientIndex === i ? 'var(--rt-navy)' : 'transparent'}`, transform: form.gradientIndex === i ? 'scale(1.15)' : 'none', transition: 'all .15s' }} />
            ))}
          </div>

          {/* Preview */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--rt-surface)', borderRadius: 10, marginBottom: '1rem' }}>
            <ClubIcon iconIndex={form.iconIndex} gradientIndex={form.gradientIndex} />
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--rt-navy)' }}>{form.name || 'Club name'}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)' }}>You · Admin</div>
            </div>
          </div>

          <button disabled={!form.name.trim()} onClick={() => setStep(2)}
            style={{ width: '100%', background: form.name.trim() ? 'var(--rt-navy)' : 'var(--rt-surface)', border: 'none', borderRadius: 'var(--rt-r3)', padding: '0.75rem 1rem', fontFamily: 'var(--rt-font-body)', fontSize: '0.88rem', fontWeight: 700, color: form.name.trim() ? '#fff' : 'var(--rt-t3)', cursor: form.name.trim() ? 'pointer' : 'default' }}>Continue →</button>
        </>
      )}

      {step === 2 && (
        <>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-amber)', marginBottom: 4 }}>Step 2 of 4</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--rt-navy)', marginBottom: '1rem' }}>Starting point</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: '1rem' }}>
            <div onClick={() => setStartMode('new')}
              style={{ border: `1.5px solid ${startMode === 'new' ? 'var(--rt-navy)' : 'var(--rt-border)'}`, borderRadius: 10, padding: '12px 14px', cursor: 'pointer' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--rt-navy)', marginBottom: 2 }}>Pick a book to start with</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)' }}>Search and assign as your first current read</div>
            </div>
            <div onClick={() => { setStartMode(null); setStartBook(null) }}
              style={{ border: `1.5px solid ${startMode === null ? 'var(--rt-navy)' : 'var(--rt-border)'}`, borderRadius: 10, padding: '12px 14px', cursor: 'pointer' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--rt-navy)', marginBottom: 2 }}>Skip for now</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)' }}>Add a book from the club later</div>
            </div>
          </div>

          {startMode === 'new' && (
            <>
              <div style={{ marginBottom: '0.75rem' }}>
                <input className="rt-input" style={{ width: '100%', boxSizing: 'border-box' }}
                  placeholder={searching ? 'Searching…' : 'Search books…'}
                  value={bookSearch}
                  onChange={e => { setBookSearch(e.target.value); clearTimeout(window._clubSearchTimer); if (e.target.value.length > 1) window._clubSearchTimer = setTimeout(() => searchOL(e.target.value), 350) }}
                  onKeyDown={e => { if (e.key === 'Enter') { clearTimeout(window._clubSearchTimer); searchOL(bookSearch) } }} />
              </div>
              {bookResults.map((b, i) => (
                <div key={i} onClick={() => setStartBook(b)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '0.5px solid var(--rt-border)', cursor: 'pointer', background: startBook?.olKey === b.olKey ? 'var(--rt-surface)' : 'transparent' }}>
                  <CoverImage coverId={b.coverId} olKey={b.olKey} title={b.title} size="S" style={{ width: 36, height: 52, borderRadius: 4, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--rt-navy)' }}>{b.title}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)' }}>{b.author}</div>
                  </div>
                  {startBook?.olKey === b.olKey && <span style={{ marginLeft: 'auto', color: 'var(--rt-navy)', fontWeight: 700 }}>✓</span>}
                </div>
              ))}
            </>
          )}

          <button disabled={startMode === 'new' && !startBook} onClick={() => setStep(3)}
            style={{ width: '100%', marginTop: '1rem', background: (startMode !== 'new' || startBook) ? 'var(--rt-navy)' : 'var(--rt-surface)', border: 'none', borderRadius: 'var(--rt-r3)', padding: '0.75rem 1rem', fontFamily: 'var(--rt-font-body)', fontSize: '0.88rem', fontWeight: 700, color: (startMode !== 'new' || startBook) ? '#fff' : 'var(--rt-t3)', cursor: (startMode !== 'new' || startBook) ? 'pointer' : 'default' }}>Continue →</button>
          <button onClick={() => setStep(1)} style={{ width: '100%', background: 'none', border: 'none', color: 'var(--rt-t3)', fontSize: '0.82rem', cursor: 'pointer', padding: '8px 0 0' }}>← Back</button>
        </>
      )}

      {step === 3 && (
        <>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-amber)', marginBottom: 4 }}>Step 3 of 4</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--rt-navy)', marginBottom: '1rem' }}>Add members</div>
          {friends.length === 0 ? (
            <div style={{ fontSize: '0.85rem', color: 'var(--rt-t3)', textAlign: 'center', padding: '1.5rem 0' }}>Add friends first to invite them to a club.</div>
          ) : friends.map(f => (
            <div key={f.userId} onClick={() => toggleMember(f.userId)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.65rem 0.85rem', border: `1.5px solid ${selectedMembers.includes(f.userId) ? 'var(--rt-navy)' : 'var(--rt-border-md)'}`, borderRadius: 10, marginBottom: 6, cursor: 'pointer', background: selectedMembers.includes(f.userId) ? 'rgba(26,39,68,0.03)' : 'var(--rt-white)' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: avatarColour(f.userId), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, color: '#fff', flexShrink: 0, overflow: 'hidden' }}>
                {f.avatarUrl ? <img src={f.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : avatarInitial(f.displayName)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--rt-navy)' }}>{f.displayName}</div>
                {f.username && <div style={{ fontSize: '0.7rem', color: 'var(--rt-t3)' }}>@{f.username}</div>}
              </div>
              <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${selectedMembers.includes(f.userId) ? 'var(--rt-navy)' : 'var(--rt-border-md)'}`, background: selectedMembers.includes(f.userId) ? 'var(--rt-navy)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.6rem', fontWeight: 700 }}>
                {selectedMembers.includes(f.userId) && '✓'}
              </div>
            </div>
          ))}
          <button onClick={() => setStep(4)}
            style={{ width: '100%', marginTop: '0.5rem', background: 'var(--rt-navy)', border: 'none', borderRadius: 'var(--rt-r3)', padding: '0.75rem 1rem', fontFamily: 'var(--rt-font-body)', fontSize: '0.88rem', fontWeight: 700, color: '#fff', cursor: 'pointer' }}>Continue →</button>
          <button onClick={() => setStep(2)} style={{ width: '100%', background: 'none', border: 'none', color: 'var(--rt-t3)', fontSize: '0.82rem', cursor: 'pointer', padding: '8px 0 0' }}>← Back</button>
        </>
      )}

      {step === 4 && (
        <>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-amber)', marginBottom: 4 }}>Step 4 of 4</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--rt-navy)', marginBottom: '1rem' }}>Club details</div>
          <div style={{ marginBottom: '0.85rem' }}>
            <label className="rt-field-label">Next meeting</label>
            <input type="datetime-local" className="rt-input" style={{ width: '100%' }} value={form.meetingTime} onChange={e => pf('meetingTime', e.target.value)} />
          </div>
          <div style={{ marginBottom: '0.85rem' }}>
            <label className="rt-field-label">Meeting location</label>
            <input className="rt-input" style={{ width: '100%' }} placeholder="e.g. The Crown, Soho" value={form.meetingPlace} onChange={e => pf('meetingPlace', e.target.value)} />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label className="rt-field-label">Pinned message (optional)</label>
            <textarea className="rt-textarea" rows={3} style={{ width: '100%', resize: 'none' }} placeholder="A note for your members…" value={form.pinnedMessage} onChange={e => pf('pinnedMessage', e.target.value)} />
          </div>
          <button disabled={saving} onClick={finish}
            style={{ width: '100%', background: saving ? 'var(--rt-surface)' : 'var(--rt-navy)', border: 'none', borderRadius: 'var(--rt-r3)', padding: '0.75rem 1rem', fontFamily: 'var(--rt-font-body)', fontSize: '0.88rem', fontWeight: 700, color: saving ? 'var(--rt-t3)' : '#fff', cursor: saving ? 'default' : 'pointer' }}>{saving ? 'Creating…' : 'Create club →'}</button>
          <button onClick={() => setStep(3)} style={{ width: '100%', background: 'none', border: 'none', color: 'var(--rt-t3)', fontSize: '0.82rem', cursor: 'pointer', padding: '8px 0 0' }}>← Back</button>
        </>
      )}
    </div>
  )
}

// ── Main Clubs tab ────────────────────────────────────────────
export default function Clubs({ onOpenChatModal }) {
  const { clubs, loaded, updateClub, assignBook, markCurrentDone, addMember, removeMember, setMemberRole, leaveClub, deleteClub } = useClubs()
  const { friends } = useSocialContext()
  const { startOrOpenChat } = useChatContext()
  const [creating, setCreating] = useState(false)

  if (!loaded) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--rt-t3)', fontSize: '0.85rem' }}>Loading clubs…</div>
  }

  if (creating) {
    return (
      <div>
        <CreateClubFlow
          friends={friends}
          startOrOpenChat={startOrOpenChat}
          onDone={() => setCreating(false)}
          onCancel={() => setCreating(false)}
        />
      </div>
    )
  }

  return (
    <div>
      {clubs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📚</div>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--rt-navy)', marginBottom: '0.4rem' }}>No book clubs yet</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--rt-t3)', marginBottom: '1.25rem' }}>Create a club to read together and track your reading history as a group.</div>
        </div>
      ) : (
        clubs.map(club => (
          <ClubCard
            key={club.id}
            club={club}
            friends={friends}
            startOrOpenChat={startOrOpenChat}
            onOpenChatModal={onOpenChatModal}
            onUpdate={updateClub}
            onAssignBook={assignBook}
            onMarkDone={markCurrentDone}
            onAddMember={addMember}
            onRemoveMember={removeMember}
            onSetRole={setMemberRole}
            onLeave={leaveClub}
            onDelete={deleteClub}
          />
        ))
      )}

      <button onClick={() => setCreating(true)}
        style={{ width: '100%', background: 'none', border: '1.5px dashed var(--rt-border-md)', borderRadius: 12, padding: '13px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--rt-t3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        + Start a new book club
      </button>
    </div>
  )
}