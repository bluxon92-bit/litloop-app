import { useState, useEffect } from 'react'
import { useLitLoopPicks } from '../hooks/useLitLoopPicks'
import { useBooksContext } from '../context/BooksContext'
import { useSocialContext } from '../context/SocialContext'
import { useChatContext } from '../context/ChatContext'
import { useAuthContext } from '../context/AuthContext'
import { useAiPicks } from '../hooks/useAiPicks'
import { useSwipeTabs } from '../hooks/useSwipeTabs'
import { avatarColour, avatarInitial } from '../lib/utils'
import { IcoBook, IcoChat } from '../components/icons'
import CoverImage from '../components/books/CoverImage'
import GenresTab from './GenresTab'
import { sb } from '../lib/supabase'

const DISCOVER_TABS = ['picks', 'spaces', 'genres']
const DISCOVER_TAB_LABELS = { picks: 'Picks', spaces: 'Spaces', genres: 'Genres' }

// ── Book search via Edge Function (server-side, no CORS) ──────────
async function searchOL(title, author) {
  const cleanTitle = (title || '').replace(/\s*\([^)]*#\d[^)]*\)/g, '').replace(/[:\u2014\u2013].*/u, '').trim()
  if (!cleanTitle) return null
  try {
    const SUPABASE_URL  = import.meta.env.SUPABASE_URL  || 'https://afwvsrjbaxutfonmmxjd.supabase.co'
    const SUPABASE_ANON = import.meta.env.SUPABASE_ANON || ''
    const res = await fetch(`${SUPABASE_URL}/functions/v1/book-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON}` },
      body: JSON.stringify({ q: cleanTitle }),
    })
    const data = await res.json()
    const match = (data.results || []).find(r =>
      r.title?.toLowerCase().includes(cleanTitle.toLowerCase()) ||
      cleanTitle.toLowerCase().includes((r.title || '').toLowerCase())
    )
    if (!match) return null
    // Return in a shape compatible with existing Discover usage
    return { cover_i: match.coverId || null, key: match.olKey || null, coverUrl: match.coverUrl || null }
  } catch {
    return null
  }
}

// ── Small book card for carousels ────────────────────────────────
// Cover-only card — no text below. Title/author/dismiss live in the tap modal.
function PicksBookCard({ title, coverId, olKey, coverUrl, onClick, badge, badgeColour, added }) {
  return (
    <div onClick={onClick} style={{ flexShrink: 0, width: 82, cursor: 'pointer', position: 'relative' }}>
      <CoverImage
        coverId={coverId} olKey={olKey} coverUrl={coverUrl} title={title} size="M"
        style={{ width: 82, height: 118, borderRadius: 7, objectFit: 'cover', boxShadow: '0 2px 10px rgba(26,39,68,0.18)', display: 'block' }}
      />
      {badge && (
        <div style={{ position: 'absolute', top: 5, left: 5, background: badgeColour || 'var(--rt-amber)', color: '#fff', fontSize: '0.48rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', borderRadius: 4, padding: '0.2em 0.4em' }}>
          {badge}
        </div>
      )}
      {added && (
        <div style={{ position: 'absolute', top: 5, right: 5, background: 'var(--rt-teal)', color: '#fff', fontSize: '0.48rem', fontWeight: 700, borderRadius: 4, padding: '0.2em 0.4em' }}>✓</div>
      )}
    </div>
  )
}

function PicksCarousel({ children }) {
  return (
    <div style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', paddingBottom: '0.5rem', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
      {children}
    </div>
  )
}

function PicksSection({ title, badge, badgeColour, action, children, loading, loadingMsg, empty, emptyMsg }) {
  return (
    <div style={{ marginBottom: '1.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <span style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.95rem', fontWeight: 700, color: 'var(--rt-navy)', flex: 1 }}>
          {title}
          {badge != null && (
            <span style={{ marginLeft: '0.4rem', fontSize: '0.65rem', fontWeight: 700, color: badgeColour || 'var(--rt-amber)', background: 'var(--rt-amber-pale)', borderRadius: 99, padding: '0.1em 0.55em' }}>
              {badge}
            </span>
          )}
        </span>
        {action}
      </div>
      {loading ? (
        <div style={{ padding: '1.75rem 0', textAlign: 'center', color: 'var(--rt-t3)', fontSize: '0.85rem' }}>{loadingMsg || 'Loading…'}</div>
      ) : empty ? (
        <div style={{ background: 'var(--rt-white)', borderRadius: 'var(--rt-r3)', border: '1px solid var(--rt-border)', padding: '1.25rem', textAlign: 'center', color: 'var(--rt-t3)', fontSize: '0.82rem', lineHeight: 1.5 }}>
          {emptyMsg}
        </div>
      ) : children}
    </div>
  )
}


// ── Book detail modal ─────────────────────────────────────────────
// ── Status button colours for genre book modal actions ────────────
const STATUS_BTN_COLOURS = {
  read:    '#22c55e',
  reading: '#3b82f6',
  tbr:     '#C9973A',
}

function BookModal({ book, added, dupMsg, onReread, onClose, onAddToTBR, onRecommend, onChat, onDismiss }) {
  // Use description already on the book object immediately (from DB — Google or OL)
  const [desc, setDesc]               = useState(book?.description || '')
  const [descLoading, setDescLoading] = useState(!book?.description)
  const [showFullDesc, setShowFullDesc] = useState(false)

  useEffect(() => {
    // Reset with whatever the book already has
    setDesc(book?.description || '')
    setShowFullDesc(false)

    // If we already have a description, still try OL to get a longer/better one
    // but don't show loading state — existing description shows immediately
    if (book?.description) setDescLoading(false)
    else setDescLoading(true)

    let cancelled = false
    async function fetchDesc(olKey) {
      try {
        const r = await fetch(`https://openlibrary.org${olKey}.json`)
        if (!r.ok) return ''
        const d = await r.json()
        let description = d.description
          ? (typeof d.description === 'string' ? d.description : d.description.value || '')
          : ''
        return description.replace(/\r\n/g, '\n').replace(/\[.*?\]\(.*?\)/g, '').replace(/----------\n.*/s, '').trim()
      } catch { return '' }
    }
    async function load() {
      try {
        const cacheKey = `litloop_desc_${book._key || book.title}`
        const cached = localStorage.getItem(cacheKey)
        if (cached) {
          if (!cancelled) { setDesc(cached); setDescLoading(false) }
          return
        }

        // Try OL with provided olKey
        let olDescription = ''
        if (book.olKey) {
          olDescription = await fetchDesc(book.olKey)
        }

        // If OL returned nothing, search by title
        if (!olDescription) {
          const doc = await searchOL(book.title, book.author, 'key')
          if (doc?.key) olDescription = await fetchDesc(doc.key)
        }

        if (olDescription) {
          // Only replace existing description if OL version is longer/better
          if (!cancelled) {
            setDesc(prev => olDescription.length > (prev || '').length ? olDescription : prev)
          }
          try { localStorage.setItem(cacheKey, olDescription) } catch {}
        }
      } catch {}
      if (!cancelled) setDescLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [book._key, book.title, book.olKey])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} className="rt-modal-backdrop" onClick={onClose}>
      <style>{`@media (min-width: 768px) { .rt-modal-backdrop { align-items: center !important; } .rt-modal-sheet { border-radius: 16px !important; max-height: 80vh !important; } }`}</style>
      <div className="rt-modal-sheet" style={{ background: 'var(--rt-white)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={{ background: 'linear-gradient(160deg, #111C35 0%, var(--rt-navy) 100%)', padding: '1.25rem', display: 'flex', gap: '1rem', alignItems: 'flex-start', flexShrink: 0 }}>
          <CoverImage coverId={book.coverId} olKey={book.olKey} coverUrl={book.coverUrl} title={book.title} size="L"
            style={{ width: 72, height: 104, borderRadius: 8, boxShadow: '0 3px 12px rgba(0,0,0,0.3)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.1rem', fontWeight: 700, color: '#fff', lineHeight: 1.25, marginBottom: '0.25rem' }}>{book.title}</div>
            {book.author && <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.55)' }}>by {book.author}</div>}
            {book.fromFriend && <div style={{ fontSize: '0.72rem', color: 'var(--rt-amber)', marginTop: '0.4rem', fontWeight: 600 }}>Recommended by {book.fromFriend}</div>}
            {book.friendReading && <div style={{ fontSize: '0.72rem', color: 'var(--rt-amber)', marginTop: '0.4rem', fontWeight: 600 }}>{book.friendReading} is reading this</div>}
            {book.why && <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', fontStyle: 'italic', marginTop: '0.4rem', lineHeight: 1.4 }}>{book.why}</div>}
            {book._editorial && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', background: 'var(--rt-amber)', color: '#fff', borderRadius: 4, fontSize: '0.6rem', fontWeight: 700, padding: '0.15em 0.5em', letterSpacing: '0.05em' }}>LITLOOP PICK</div>
                {book._moodLabel && <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.55)', fontWeight: 500 }}>{book._moodLabel}</div>}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', color: '#fff', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>×</button>
        </div>
        <div style={{ padding: '1.25rem', overflowY: 'auto', flex: 1 }}>
          {book.editorNote && (
            <div style={{ marginBottom: '1rem', borderLeft: '3px solid var(--rt-amber)', paddingLeft: '0.75rem' }}>
              <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-amber)', marginBottom: '0.25rem' }}>Editor's note</div>
              <p style={{ fontSize: '0.85rem', color: 'var(--rt-navy)', lineHeight: 1.6, margin: 0, fontStyle: 'italic' }}>{book.editorNote}</p>
            </div>
          )}
          {book.desc && <p style={{ fontSize: '0.85rem', color: 'var(--rt-navy)', lineHeight: 1.6, margin: '0 0 1rem', fontStyle: 'italic', borderLeft: '3px solid var(--rt-amber)', paddingLeft: '0.75rem' }}>{book.desc}</p>}
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.4rem' }}>About this book</div>
            {descLoading
              ? <div style={{ color: 'var(--rt-t3)', fontSize: '0.82rem' }}>Loading…</div>
              : desc
              ? <>
                  <p style={{ fontSize: '0.88rem', color: 'var(--rt-t2)', lineHeight: 1.65, margin: 0 }}>
                    {showFullDesc || desc.length <= 500 ? desc : desc.slice(0, 500) + '…'}
                  </p>
                  {desc.length > 500 && (
                    <button
                      onClick={() => setShowFullDesc(v => !v)}
                      style={{ background: 'none', border: 'none', padding: '0.3rem 0', fontSize: '0.82rem', color: 'var(--rt-amber)', fontWeight: 700, cursor: 'pointer', display: 'block', marginTop: '0.25rem' }}
                    >
                      {showFullDesc ? 'Show less' : 'Read more'}
                    </button>
                  )}
                </>
              : <p style={{ fontSize: '0.85rem', color: 'var(--rt-t3)', fontStyle: 'italic', margin: 0 }}>No description available.</p>
            }
          </div>
          {book.recommenders?.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.4rem' }}>Recommended by</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {book.recommenders.map((r, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: avatarColour(r.userId || r.name), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 700, color: '#fff', flexShrink: 0 }}>{avatarInitial(r.name || '?')}</div>
                    <span style={{ fontSize: '0.82rem', color: 'var(--rt-t2)', fontWeight: 600 }}>{r.name}</span>
                    {r.message && <span style={{ fontSize: '0.78rem', color: 'var(--rt-t3)', fontStyle: 'italic' }}>"{r.message}"</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {dupMsg && (
            <div style={{ marginBottom: '0.75rem', padding: '0.6rem 0.85rem', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, fontSize: '0.82rem', color: 'var(--rt-navy)', lineHeight: 1.45 }}>
              {dupMsg}
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.6rem' }}>
            {onDismiss && (
              <button onClick={() => { onDismiss(); onClose() }}
                style={{ background: 'var(--rt-surface)', color: 'var(--rt-t3)', border: '1px solid var(--rt-border-md)', borderRadius: 12, padding: '0.85rem 1rem', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                Not for me
              </button>
            )}
            {book._genreBook ? (
              <div style={{ flex: 1, display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => { onAddToTBR('read'); onClose() }}
                  style={{ flex: 1, background: STATUS_BTN_COLOURS.read, color: '#fff', border: 'none', borderRadius: 12, padding: '0.85rem 0.5rem', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  ✓ Read
                </button>
                <button onClick={() => { onAddToTBR('reading'); onClose() }}
                  style={{ flex: 1, background: STATUS_BTN_COLOURS.reading, color: '#fff', border: 'none', borderRadius: 12, padding: '0.85rem 0.5rem', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  📖 Reading
                </button>
                <button onClick={() => { onAddToTBR('tbr'); onClose() }}
                  style={{ flex: 1, background: 'var(--rt-navy)', color: '#fff', border: 'none', borderRadius: 12, padding: '0.85rem 0.5rem', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  + To Read
                </button>
              </div>
            ) : onReread ? (
              <button onClick={onReread}
                style={{ flex: 1, background: 'var(--rt-navy)', color: '#fff', border: 'none', borderRadius: 12, padding: '0.85rem 1rem', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>
                Yes, add as reread
              </button>
            ) : (
              <button onClick={onAddToTBR} disabled={added || !!dupMsg}
                style={{ flex: 1, background: (added || dupMsg) ? 'var(--rt-surface)' : 'var(--rt-navy)', color: (added || dupMsg) ? 'var(--rt-t3)' : '#fff', border: 'none', borderRadius: 12, padding: '0.85rem 1rem', fontWeight: 700, fontSize: '0.9rem', cursor: (added || dupMsg) ? 'default' : 'pointer', transition: 'all 0.2s' }}>
                {added ? '✓ Added to To Read' : '+ Add to To Read'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Friend picker / recommend modal ──────────────────────────────
function RecommendModal({ book, friends, user, recs, feed, sendRecommendation, onClose, onStartChatWith }) {
  const [selected, setSelected] = useState(new Set())
  const [note, setNote]         = useState('')
  const [sending, setSending]   = useState(false)
  const [sent, setSent]         = useState(false)

  const alreadySentTo = new Set(
    (recs || [])
      .filter(r => r.from_user_id === user?.id && (r.book_ol_key === book.olKey || r.book_title === book.title))
      .map(r => r.to_user_id)
  )
  const alreadyReadBy = new Set(
    (feed || [])
      .filter(e => e.event_type === 'finished' && e.user_id !== user?.id &&
        (e.book_ol_key === book.olKey || e.book_title === book.title))
      .map(e => e.user_id)
  )

  function toggle(id) {
    if (alreadySentTo.has(id) || alreadyReadBy.has(id)) return
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function handleSend() {
    if (!selected.size) return
    setSending(true)
    await sendRecommendation(book, [...selected], note, user)
    setSending(false); setSent(true)
    setTimeout(onClose, 1200)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--rt-white)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, padding: '1.25rem', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
          <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1rem', fontWeight: 600, color: 'var(--rt-navy)' }}>Recommend to a friend</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--rt-t3)' }}>×</button>
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--rt-t3)', marginBottom: '1rem' }}>{book.title}</div>
        {sent ? (
          <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--rt-teal)', fontWeight: 700, fontSize: '1rem' }}>✓ Sent!</div>
        ) : (
          <>
            <div style={{ overflowY: 'auto', flex: 1, marginBottom: '0.75rem' }}>
              {!friends?.length ? (
                <div style={{ color: 'var(--rt-t3)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem' }}>Add friends first to recommend books.</div>
              ) : friends.map(f => {
                const sel = selected.has(f.userId)
                const sentAlready = alreadySentTo.has(f.userId)
                const hasRead = alreadyReadBy.has(f.userId)
                return (
                  <div key={f.userId} onClick={() => toggle(f.userId)}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0', borderBottom: '1px solid var(--rt-border)', cursor: sentAlready || hasRead ? 'default' : 'pointer', opacity: sentAlready ? 0.6 : 1 }}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: avatarColour(f.userId), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                      {avatarInitial(f.displayName || f.username || '?')}
                    </div>
                    <span style={{ flex: 1, fontSize: '0.9rem', fontWeight: 600, color: 'var(--rt-navy)' }}>{f.displayName || f.username}</span>
                    {sentAlready ? (
                      <span style={{ fontSize: '0.7rem', color: 'var(--rt-t3)', fontStyle: 'italic' }}>Already recommended</span>
                    ) : hasRead ? (
                      <button onClick={e => { e.stopPropagation(); onStartChatWith?.(f.userId) }}
                        style={{ fontSize: '0.7rem', background: 'var(--rt-amber-pale)', color: 'var(--rt-amber)', border: 'none', borderRadius: 99, padding: '0.2rem 0.6rem', fontWeight: 700, cursor: 'pointer' }}>Chat about it</button>
                    ) : (
                      <div style={{ width: 22, height: 22, borderRadius: 5, border: `2px solid ${sel ? 'var(--rt-amber)' : 'var(--rt-border-md)'}`, background: sel ? 'var(--rt-amber)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {sel && <span style={{ color: '#fff', fontSize: '0.72rem', fontWeight: 700 }}>✓</span>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <textarea value={note} onChange={e => setNote(e.target.value)}
              placeholder="Add a note (optional)…"
              style={{ width: '100%', borderRadius: 'var(--rt-r3)', border: '1px solid var(--rt-border-md)', padding: '0.6rem 0.75rem', fontSize: '0.85rem', fontFamily: 'inherit', resize: 'none', marginBottom: '0.75rem', boxSizing: 'border-box', minHeight: 68 }} />
            <button onClick={handleSend} disabled={!selected.size || sending}
              style={{ width: '100%', background: selected.size ? 'var(--rt-navy)' : 'var(--rt-surface)', color: selected.size ? '#fff' : 'var(--rt-t3)', border: 'none', borderRadius: 'var(--rt-r3)', padding: '0.85rem', fontWeight: 700, fontSize: '0.9rem', cursor: selected.size ? 'pointer' : 'default' }}>
              {sending ? 'Sending…' : `Send to ${selected.size || ''} friend${selected.size !== 1 ? 's' : ''}`}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Chat picker ───────────────────────────────────────────────────
function DiscoverChatPicker({ book, friends, chats, startOrOpenChat, onOpenChatModal, onClose }) {
  const { myUsername, myDisplayName } = useSocialContext()
  const [selected, setSelected] = useState(new Set())
  const [starting, setStarting] = useState(false)

  const bookChats = (chats || []).filter(c => c.bookOlKey === book.olKey || c.bookTitle === book.title)

  function toggle(id) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function handleStart() {
    if (!selected.size) return
    const friendIds = [...selected]
    setStarting(true)
    const selectedFriends = friends.filter(f => friendIds.includes(f.userId))
    const myName = myDisplayName || myUsername || 'me'
    const friendNames = selectedFriends.map(f => f.displayName || f.username || 'friend')
    const autoName = friendIds.length === 1
      ? `${myName} & ${friendNames[0]}`
      : `${myName} & ${friendNames.slice(0, 2).join(' & ')}${friendIds.length > 2 ? ` +${friendIds.length - 2}` : ''}`
    const chatId = await startOrOpenChat(book.olKey, book.title, book.author, book.coverId, friendIds, null, autoName)
    setStarting(false)
    if (chatId) {
      onOpenChatModal?.({ id: chatId, bookOlKey: book.olKey, bookTitle: book.title, bookAuthor: book.author, coverIdRaw: book.coverId, chatName: autoName }, book)
    }
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 400, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--rt-white)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, padding: '1.25rem', maxHeight: '75vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1rem', fontWeight: 600, color: 'var(--rt-navy)' }}>Chat about this book</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--rt-t3)' }}>×</button>
        </div>
        {bookChats.length > 0 && (
          <div style={{ marginBottom: '0.75rem' }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.4rem' }}>Existing chats</div>
            {bookChats.map(c => (
              <div key={c.id} onClick={() => { onOpenChatModal?.(c, book); onClose() }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.75rem', borderRadius: 'var(--rt-r3)', background: 'var(--rt-surface)', marginBottom: '0.4rem', cursor: 'pointer', border: '1px solid var(--rt-border)' }}>
                <IcoChat size={18} color="var(--rt-t3)" />
                <span style={{ flex: 1, fontSize: '0.88rem', fontWeight: 600, color: 'var(--rt-navy)' }}>{c.chatName || book.title}</span>
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
            const sel = selected.has(f.userId)
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
        <button onClick={handleStart} disabled={!selected.size || starting}
          style={{ width: '100%', background: selected.size ? 'var(--rt-navy)' : 'var(--rt-surface)', color: selected.size ? '#fff' : 'var(--rt-t3)', border: 'none', borderRadius: 'var(--rt-r3)', padding: '0.85rem', fontWeight: 700, fontSize: '0.9rem', cursor: selected.size ? 'pointer' : 'default' }}>
          {starting ? 'Starting…' : 'Start chat'}
        </button>
      </div>
    </div>
  )
}

// ── Spaces Tab ────────────────────────────────────────────────────
// Two-column grid with pill filters (My Spaces / Most Active / Suggested)
// and an expandable search bar that searches all spaces platform-wide.
function SpacesTab({ user, books, friends, onOpenSpace }) {
  const SUPABASE_URL  = import.meta.env.SUPABASE_URL  || 'https://afwvsrjbaxutfonmmxjd.supabase.co'
  const SUPABASE_ANON = import.meta.env.SUPABASE_ANON || ''

  const FILTERS = ['my-spaces', 'most-active', 'suggested']
  const FILTER_LABELS = { 'my-spaces': 'My Spaces', 'most-active': 'Most Active', 'suggested': 'Suggested' }

  const [activeFilter, setActiveFilter] = useState('my-spaces')
  const [spaces, setSpaces]             = useState(null)   // null = loading, [] = empty
  const [searchOpen, setSearchOpen]     = useState(false)
  const [searchQuery, setSearchQuery]   = useState('')
  const [searchResults, setSearchResults] = useState(null) // null = not searching
  const [searching, setSearching]       = useState(false)
  const searchRef = useState(null)
  const searchTimer = useState(null)

  useEffect(() => {
    if (!user) return
    setSpaces(null)
    loadFilter(activeFilter)
  }, [user?.id, activeFilter])

  // ── Shared enrichment — batched newSince in one query ──────────
  async function enrichSpaces(olKeys, lastVisitedMap = {}, rollingWindowDays = null) {
    if (!olKeys.length) return []

    const [ratingsRes, booksRes, postCountsRes] = await Promise.all([
      sb.from('book_rating_summary')
        .select('ol_key, title, author, cover_url, cover_id, avg_rating, rating_count')
        .in('ol_key', olKeys),
      sb.from('books')
        .select('ol_key, title, author, cover_url, cover_id')
        .in('ol_key', olKeys),
      sb.from('feed_events')
        .select('book_ol_key, user_id, event_type')
        .in('book_ol_key', olKeys)
        .in('event_type', ['posted_review', 'finished', 'book_moment']),
    ])

    const booksMap  = {}
    const ratingMap = {}
    ;(booksRes.data  || []).forEach(b => { booksMap[b.ol_key]  = b })
    ;(ratingsRes.data || []).forEach(r => { ratingMap[r.ol_key] = r })

    // Deduplicate post counts: per user+book, posted_review wins over finished
    const postCountMap = {}
    const reviewSeen   = new Map()
    ;(postCountsRes.data || []).forEach(ev => {
      if (ev.event_type === 'book_moment') {
        postCountMap[ev.book_ol_key] = (postCountMap[ev.book_ol_key] || 0) + 1
      } else {
        const key      = `${ev.user_id}__${ev.book_ol_key}`
        const existing = reviewSeen.get(key)
        if (!existing || ev.event_type === 'posted_review') {
          if (existing) postCountMap[ev.book_ol_key] = Math.max(0, (postCountMap[ev.book_ol_key] || 0) - 1)
          reviewSeen.set(key, ev.event_type)
          postCountMap[ev.book_ol_key] = (postCountMap[ev.book_ol_key] || 0) + 1
        }
      }
    })

    // Batch newSince — one query per unique cutoff date, grouped by ol_key
    // For My Spaces: cutoff = last_visited_at per book
    // For Most Active / Suggested: cutoff = rolling window start
    const newSinceMap = {}
    if (rollingWindowDays) {
      // Single cutoff for all keys
      const cutoff = new Date(Date.now() - rollingWindowDays * 86400000).toISOString()
      const { data: newPosts } = await sb
        .from('feed_events')
        .select('book_ol_key')
        .in('book_ol_key', olKeys)
        .eq('visibility', 'public')
        .in('event_type', ['posted_review', 'finished', 'book_moment'])
        .gt('created_at', cutoff)
      ;(newPosts || []).forEach(ev => {
        newSinceMap[ev.book_ol_key] = (newSinceMap[ev.book_ol_key] || 0) + 1
      })
    } else {
      // Group keys by their last_visited cutoff so we make at most one query per unique date
      // (in practice most users have similar visit times so this collapses well)
      const keysWithCutoff = olKeys.filter(k => lastVisitedMap[k])
      if (keysWithCutoff.length) {
        const { data: newPosts } = await sb
          .from('feed_events')
          .select('book_ol_key, created_at')
          .in('book_ol_key', keysWithCutoff)
          .eq('visibility', 'public')
          .in('event_type', ['posted_review', 'finished', 'book_moment'])
        ;(newPosts || []).forEach(ev => {
          const lv = lastVisitedMap[ev.book_ol_key]
          if (lv && new Date(ev.created_at) > new Date(lv)) {
            newSinceMap[ev.book_ol_key] = (newSinceMap[ev.book_ol_key] || 0) + 1
          }
        })
      }
    }

    // Batch-fetch one recent post per book for teasers — single query, pick latest per key in JS
    const teaserMap = {}
    if (olKeys.length) {
      const { data: recentPosts } = await sb
        .from('feed_events')
        .select('book_ol_key, review_body, moment_body, user_id, created_at, profiles:profiles(display_name, username)')
        .in('book_ol_key', olKeys)
        .in('event_type', ['posted_review', 'finished', 'book_moment'])
        .not('review_body', 'is', null)
        .order('created_at', { ascending: false })
        .limit(olKeys.length * 3) // a few per book is enough to guarantee one per key
      ;(recentPosts || []).forEach(ev => {
        if (!teaserMap[ev.book_ol_key]) {
          const body = ev.review_body || ev.moment_body || ''
          if (body.trim()) {
            const p = ev.profiles || {}
            teaserMap[ev.book_ol_key] = {
              text: body.length > 120 ? body.slice(0, 120).trimEnd() + '…' : body,
              name: p.display_name || p.username || null,
            }
          }
        }
      })
    }

    return olKeys.map(k => {
      const r        = ratingMap[k] || {}
      const b        = booksMap[k]  || {}
      const coverUrl = r.cover_url || b.cover_url
        || (r.cover_id || b.cover_id ? `https://covers.openlibrary.org/b/id/${r.cover_id || b.cover_id}-M.jpg` : null)
        || (k ? `https://covers.openlibrary.org/b/olid/${k.replace('/works/', '')}-M.jpg` : null)
      return {
        olKey:       k,
        title:       r.title   || b.title  || '',
        author:      r.author  || b.author || '',
        coverUrl,
        coverId:     r.cover_id || b.cover_id || null,
        avgRating:   r.avg_rating    || null,
        ratingCount: r.rating_count  || 0,
        postCount:   postCountMap[k] || 0,
        newSince:    newSinceMap[k]  ?? null,
        teaser:      teaserMap[k]    || null,
      }
    }).sort((a, b) => b.postCount - a.postCount)
  }

  // ── Filter loaders ─────────────────────────────────────────────
  async function loadFilter(filter) {
    if (filter === 'my-spaces')    return loadMySpaces()
    if (filter === 'most-active')  return loadMostActive()
    if (filter === 'suggested')    return loadSuggested()
  }

  async function loadMySpaces() {
    // Collect all ol_keys the user has interacted with
    const readingOlKeys = (books || [])
      .filter(b => b.status === 'reading' && b.olKey)
      .map(b => b.olKey)

    const { data: subData } = await sb
      .from('space_subscriptions')
      .select('ol_key, last_visited_at')
      .eq('user_id', user.id)
      .order('last_visited_at', { ascending: false })

    const subsMap = {}
    ;(subData || []).forEach(s => { subsMap[s.ol_key] = s.last_visited_at })

    // Merge: reading books pinned first, then subscriptions
    const subKeys   = (subData || []).map(s => s.ol_key).filter(k => !readingOlKeys.includes(k))
    const allKeys   = [...readingOlKeys, ...subKeys]
    const readingSet = new Set(readingOlKeys)

    if (!allKeys.length) { setSpaces([]); return }

    const enriched = await enrichSpaces(allKeys, subsMap)

    // Attach label and sort: currently reading pinned first, rest by last visited
    const labelled = enriched.map(s => ({
      ...s,
      _label: readingSet.has(s.olKey) ? 'reading' : null,
      _lastVisited: subsMap[s.olKey] || null,
    })).sort((a, b) => {
      if (a._label === 'reading' && b._label !== 'reading') return -1
      if (b._label === 'reading' && a._label !== 'reading') return  1
      return new Date(b._lastVisited || 0) - new Date(a._lastVisited || 0)
    })

    setSpaces(labelled)
  }

  async function loadMostActive() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()
    const { data } = await sb
      .from('feed_events')
      .select('book_ol_key')
      .eq('visibility', 'public')
      .in('event_type', ['posted_review', 'finished', 'book_moment'])
      .gt('created_at', thirtyDaysAgo)
      .not('book_ol_key', 'is', null)

    if (!data?.length) { setSpaces([]); return }

    const counts = {}
    data.forEach(e => { counts[e.book_ol_key] = (counts[e.book_ol_key] || 0) + 1 })

    const topKeys = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k)
      .slice(0, 24)

    const enriched = await enrichSpaces(topKeys, {}, 30)
    setSpaces(enriched.map(s => ({ ...s, _label: null })))
  }

  async function loadSuggested() {
    const { data: entries } = await sb
      .from('reading_entries')
      .select('genre')
      .eq('user_id', user.id)
      .not('genre', 'is', null)
      .limit(50)

    if (!entries?.length) { setSpaces([]); return }

    const genreCounts = {}
    entries.forEach(e => { if (e.genre) genreCounts[e.genre] = (genreCounts[e.genre] || 0) + 1 })
    const topGenres = Object.entries(genreCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([g]) => g)

    const myOlKeys = new Set((books || []).map(b => b.olKey).filter(Boolean))

    const { data: genreBooks } = await sb
      .from('reading_entries')
      .select('books!inner(ol_key)')
      .in('genre', topGenres)
      .not('book_id', 'is', null)
      .limit(100)

    const candidateKeys = [...new Set(
      (genreBooks || []).map(e => e.books?.ol_key).filter(k => k && !myOlKeys.has(k))
    )].slice(0, 24)

    if (!candidateKeys.length) { setSpaces([]); return }

    const enriched = await enrichSpaces(candidateKeys, {}, 30)
    // Only show suggested spaces that have at least one post
    setSpaces(enriched.filter(s => s.postCount > 0).map(s => ({ ...s, _label: null })))
  }

  // ── Search ──────────────────────────────────────────────────────
  async function handleSearch(q) {
    const query = q.trim()
    if (!query) { setSearchResults(null); return }
    setSearching(true)
    try {
      const res  = await fetch(`${SUPABASE_URL}/functions/v1/book-search`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON}` },
        body:    JSON.stringify({ q: query }),
      })
      const data = await res.json()
      const hits = (data.results || []).slice(0, 12)
      if (!hits.length) { setSearchResults([]); setSearching(false); return }

      // Enrich with post counts — include even if 0 posts (show empty space)
      const olKeys = hits.map(h => h.olKey).filter(Boolean)
      const [ratingsRes, postCountsRes] = await Promise.all([
        olKeys.length ? sb.from('book_rating_summary')
          .select('ol_key, avg_rating, rating_count')
          .in('ol_key', olKeys) : Promise.resolve({ data: [] }),
        olKeys.length ? sb.from('feed_events')
          .select('book_ol_key, user_id, event_type')
          .in('book_ol_key', olKeys)
          .eq('visibility', 'public')
          .in('event_type', ['posted_review', 'finished', 'book_moment'])
          : Promise.resolve({ data: [] }),
      ])

      const ratingMap    = {}
      const postCountMap = {}
      const reviewSeen   = new Map()
      ;(ratingsRes.data || []).forEach(r => { ratingMap[r.ol_key] = r })
      ;(postCountsRes.data || []).forEach(ev => {
        if (ev.event_type === 'book_moment') {
          postCountMap[ev.book_ol_key] = (postCountMap[ev.book_ol_key] || 0) + 1
        } else {
          const key = `${ev.user_id}__${ev.book_ol_key}`
          if (!reviewSeen.has(key) || ev.event_type === 'posted_review') {
            if (reviewSeen.has(key)) postCountMap[ev.book_ol_key] = Math.max(0, (postCountMap[ev.book_ol_key] || 0) - 1)
            reviewSeen.set(key, ev.event_type)
            postCountMap[ev.book_ol_key] = (postCountMap[ev.book_ol_key] || 0) + 1
          }
        }
      })

      const results = hits.map(h => {
        const r = h.olKey ? (ratingMap[h.olKey] || {}) : {}
        return {
          olKey:       h.olKey    || null,
          title:       h.title    || '',
          author:      h.author   || '',
          coverUrl:    h.coverUrl || null,
          coverId:     h.coverId  || null,
          avgRating:   r.avg_rating   || null,
          ratingCount: r.rating_count || 0,
          postCount:   h.olKey ? (postCountMap[h.olKey] || 0) : 0,
          newSince:    null,
          _label:      null,
          _searchResult: true,
        }
      })
      setSearchResults(results)
    } catch { setSearchResults([]) }
    setSearching(false)
  }

  function onSearchChange(e) {
    const q = e.target.value
    setSearchQuery(q)
    clearTimeout(searchTimer[0])
    searchTimer[0] = setTimeout(() => handleSearch(q), 400)
  }

  function closeSearch() {
    setSearchOpen(false)
    setSearchQuery('')
    setSearchResults(null)
  }

  // ── Label config ───────────────────────────────────────────────
  const LABEL_CONFIG = {
    reading: { text: 'Reading',      bg: 'var(--rt-amber)',    col: '#fff' },
    read:    { text: 'Recently read', bg: '#22c55e',            col: '#fff' },
    posted:  { text: 'Posted',       bg: 'var(--rt-navy)',     col: '#fff' },
  }

  // ── Space card — full-width horizontal card, cover right ─────
  function SpaceCard({ space, isEmpty = false }) {
    const coverSrc = space.coverUrl
      || (space.coverId ? `https://covers.openlibrary.org/b/id/${space.coverId}-M.jpg` : null)
      || (space.olKey ? `https://covers.openlibrary.org/b/olid/${(space.olKey || '').replace('/works/', '')}-M.jpg` : null)

    const label = space._label ? LABEL_CONFIG[space._label] : null

    return (
      <div
        onClick={() => onOpenSpace({ olKey: space.olKey, title: space.title, author: space.author, coverUrl: space.coverUrl, coverId: space.coverId })}
        style={{ cursor: 'pointer', background: 'var(--rt-white)', border: '1px solid var(--rt-border)', borderRadius: 12, padding: '0.7rem 0.75rem', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}
      >
        {/* Meta — left, takes all available space */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.18rem' }}>
          {/* Title + badges */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
            <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.88rem', fontWeight: 700, color: 'var(--rt-navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {space.title || 'Untitled'}
            </div>
            {label && (
              <div style={{ flexShrink: 0, background: label.bg, color: label.col, fontSize: '0.48rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', borderRadius: 4, padding: '0.2em 0.45em' }}>
                {label.text}
              </div>
            )}
            {isEmpty && (
              <div style={{ flexShrink: 0, background: 'var(--rt-surface)', color: 'var(--rt-t3)', fontSize: '0.48rem', fontWeight: 700, borderRadius: 4, padding: '0.2em 0.45em', letterSpacing: '0.04em', textTransform: 'uppercase' }}>New</div>
            )}
          </div>

          {/* Author */}
          {space.author && (
            <div style={{ fontSize: '0.65rem', color: 'var(--rt-t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {space.author}
            </div>
          )}

          {/* Stats */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.1rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--rt-t3)' }}>
              {`${space.postCount} post${space.postCount !== 1 ? 's' : ''}`}
            </span>
            {space.newSince > 0 && (
              <>
                <span style={{ fontSize: '0.6rem', color: 'var(--rt-border-md)' }}>·</span>
                <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--rt-amber)' }}>{space.newSince} new</span>
              </>
            )}
            {space.avgRating && (
              <>
                <span style={{ fontSize: '0.6rem', color: 'var(--rt-border-md)' }}>·</span>
                <span style={{ fontSize: '0.65rem', color: 'var(--rt-amber)', fontWeight: 600 }}>★ {space.avgRating}</span>
                <span style={{ fontSize: '0.62rem', color: 'var(--rt-t3)' }}>({space.ratingCount})</span>
              </>
            )}
          </div>

          {/* Teaser or empty prompt */}
          {!isEmpty && space.teaser ? (
            <div style={{ marginTop: '0.35rem', borderLeft: '2px solid var(--rt-border-md)', paddingLeft: '0.5rem' }}>
              {space.teaser.name && (
                <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--rt-t2)', marginBottom: '0.1rem' }}>
                  {space.teaser.name}
                </div>
              )}
              <div style={{ fontSize: '0.72rem', color: 'var(--rt-t2)', fontStyle: 'italic', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                "{space.teaser.text}"
              </div>
            </div>
          ) : isEmpty ? (
            <div style={{ marginTop: '0.3rem', fontSize: '0.7rem', color: 'var(--rt-t3)', fontStyle: 'italic' }}>
              Be the first to post
            </div>
          ) : null}
        </div>

        {/* Cover — right side, standalone portrait thumbnail */}
        <div style={{ flexShrink: 0, width: 54, height: 78, borderRadius: 6, overflow: 'hidden', background: 'var(--rt-surface)', border: '1px solid var(--rt-border)' }}>
          {coverSrc && (
            <img
              src={coverSrc} alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              onError={e => { e.target.style.display = 'none' }}
            />
          )}
        </div>
      </div>
    )
  }

  // ── What to render ─────────────────────────────────────────────
  const displayList = searchResults !== null ? searchResults : (spaces || [])
  const isLoading   = searchResults === null && spaces === null
  const isSearching = searchResults !== null

  // Empty state messages per filter
  const EMPTY_MSGS = {
    'my-spaces':   { title: 'No spaces yet', body: 'Search for a book above to find a conversation, or post a review to join one.' },
    'most-active': { title: 'No active spaces', body: 'Be the first to start a conversation — post a review or reading moment.' },
    'suggested':   { title: 'Nothing to suggest yet', body: 'Add more books to your list so we can find spaces you\'ll love.' },
  }

  return (
    <div>
      {/* ── Filter row + search ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', minHeight: 36 }}>
        {/* Search icon / input */}
        {searchOpen ? (
          <div style={{ display: 'flex', alignItems: 'center', flex: 1, background: 'var(--rt-white)', border: '1.5px solid var(--rt-amber)', borderRadius: 99, padding: '0.3rem 0.75rem', gap: '0.4rem' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--rt-t3)" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              autoFocus
              value={searchQuery}
              onChange={onSearchChange}
              placeholder="Search for a book…"
              style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: '0.82rem', color: 'var(--rt-navy)' }}
            />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(''); setSearchResults(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--rt-t3)', fontSize: '0.9rem', lineHeight: 1, padding: 0 }}>×</button>
            )}
          </div>
        ) : (
          <>
            <button
              onClick={() => setSearchOpen(true)}
              style={{ flexShrink: 0, width: 32, height: 32, borderRadius: '50%', background: 'var(--rt-white)', border: '1.5px solid var(--rt-border-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--rt-navy)" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </button>
            {/* Pills */}
            <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', scrollbarWidth: 'none', flex: 1 }}>
              {FILTERS.map(f => {
                const active = activeFilter === f
                return (
                  <button
                    key={f}
                    onClick={() => { setActiveFilter(f); setSearchResults(null) }}
                    style={{
                      flexShrink: 0, padding: '0.3rem 0.85rem', borderRadius: 99,
                      fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                      border: `1.5px solid ${active ? 'var(--rt-navy)' : 'var(--rt-border-md)'}`,
                      background: active ? 'var(--rt-navy)' : 'var(--rt-white)',
                      color: active ? '#fff' : 'var(--rt-t2)',
                      transition: 'all 0.15s',
                    }}
                  >
                    {FILTER_LABELS[f]}
                  </button>
                )
              })}
            </div>
            {/* Close search — only shown when search was open and pills are back */}
          </>
        )}
        {searchOpen && (
          <button onClick={closeSearch} style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, color: 'var(--rt-t3)', padding: '0 0.25rem' }}>
            Cancel
          </button>
        )}
      </div>

      {/* ── Grid ── */}
      {isLoading || searching ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--rt-t3)', fontSize: '0.85rem' }}>
          {searching ? 'Searching…' : 'Loading spaces…'}
        </div>
      ) : displayList.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          {isSearching ? (
            <>
              <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🔍</div>
              <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--rt-navy)', marginBottom: '0.25rem' }}>No results for "{searchQuery}"</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--rt-t3)', lineHeight: 1.5 }}>Try a different title or author name.</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📖</div>
              <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--rt-navy)', marginBottom: '0.25rem' }}>{EMPTY_MSGS[activeFilter]?.title}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--rt-t3)', lineHeight: 1.5 }}>{EMPTY_MSGS[activeFilter]?.body}</div>
            </>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          {displayList.map(space => (
            <SpaceCard
              key={space.olKey || space.title}
              space={space}
              isEmpty={space.postCount === 0}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Discover page ────────────────────────────────────────────
export default function Discover({ onNavigate, onOpenChatModal, onRecommend, pendingRecOpen, onOpenSpace }) {
  const { user }                               = useAuthContext()
  const { books, addBook, findDuplicate }      = useBooksContext()
  const { recs, friends, feed, dismissRec, acceptRecToTBR, sendRecommendation, preferredMoods } = useSocialContext()
  const { chats, startOrOpenChat }             = useChatContext()

  const {
    feed: editorialFeed, loading: editorialLoading, moods,
    activeMood, setActiveMood, dismissBook, shuffleFeed, getCoverForBook, getCoverUrlForBook, getOlKeyForBook,
  } = useLitLoopPicks({ userId: user?.id, books, preferredMoods })

  const aiPicks = useAiPicks(user, books)

  const [discoverTab, setDiscoverTab]       = useState('picks')
  const swipeRef = useSwipeTabs(DISCOVER_TABS, discoverTab, setDiscoverTab)
  const [selectedBook, setSelectedBook]     = useState(null)
  const [showRecommend, setShowRecommend]   = useState(false)
  const [showChatPicker, setShowChatPicker] = useState(false)
  const [addedKeys, setAddedKeys]           = useState(new Set())
  const [dupMsgKey, setDupMsgKey]           = useState(null)
  const [pendingReread, setPendingReread]   = useState(null)

  // Deep-link from notification: open a specific recommended book's detail panel
  useEffect(() => {
    if (!pendingRecOpen?.current) return
    const r = pendingRecOpen.current
    pendingRecOpen.current = null
    setShowRecommend(false)
    setShowChatPicker(false)
    // Enrich with local books data if available (has coverUrl, description from DB)
    const localBook = books.find(b =>
      (r.book_ol_key && b.olKey === r.book_ol_key) ||
      (r.book_title && b.title?.toLowerCase() === r.book_title?.toLowerCase())
    )
    setSelectedBook({
      title:        r.book_title  || '',
      author:       r.book_author || '',
      coverId:      localBook?.coverId  || r.cover_id    || null,
      coverUrl:     localBook?.coverUrl || null,
      description:  localBook?.description || null,
      olKey:        localBook?.olKey || r.book_ol_key || null,
      fromFriend:   r.profiles?.display_name || r.profiles?.username || 'A friend',
      message:      r.message     || null,
      recommenders: [{ name: r.profiles?.display_name || r.profiles?.username || 'A friend', userId: r.from_user_id, message: r.message }],
      _key:         `fr-${r.book_ol_key || r.book_title}`,
      _recs:        [r],
      _rec:         r,
    })
  }) // runs every render — ref check makes it a no-op when nothing pending

  const pendingRecs = (recs || []).filter(r => r.status === 'pending')

  // Group pending recs by book
  const groupedRecs = Object.values(
    pendingRecs.reduce((acc, r) => {
      const key = r.book_ol_key || r.book_title
      if (!acc[key]) {
        acc[key] = { ...r, recommenders: [], _key: `fr-${key}`, _recs: [] }
      }
      const name = r.profiles?.display_name || r.profiles?.username || 'A friend'
      acc[key].recommenders.push({ name, userId: r.from_user_id, message: r.message })
      acc[key]._recs.push(r)
      return acc
    }, {})
  )

  // Friends currently reading — only show if no subsequent finished/review event
  const friendIds = new Set((friends || []).map(f => f.userId))
  const recOlKeys = new Set(pendingRecs.map(r => r.book_ol_key).filter(Boolean))
  const recTitles = new Set(pendingRecs.map(r => r.book_title).filter(Boolean))

  // Build a set of olKeys that a friend has since finished (to filter stale currently-reading)
  const friendFinishedKeys = new Set(
    (feed || [])
      .filter(ev => friendIds.has(ev.user_id) && (ev.event_type === 'finished' || ev.event_type === 'posted_review') && ev.book_ol_key)
      .map(ev => `${ev.user_id}__${ev.book_ol_key}`)
  )

  const friendsReading = (() => {
    const seen = new Set()
    return (feed || [])
      .filter(ev =>
        ev.event_type === 'started_reading' &&
        friendIds.has(ev.user_id) &&
        // Not already finished
        !(ev.book_ol_key && friendFinishedKeys.has(`${ev.user_id}__${ev.book_ol_key}`)) &&
        // Deduplicate against pending recs
        !(ev.book_ol_key && recOlKeys.has(ev.book_ol_key)) &&
        !(ev.book_title && recTitles.has(ev.book_title))
      )
      .filter(ev => {
        const dedupeKey = ev.book_ol_key || ev.book_title
        if (!dedupeKey || seen.has(dedupeKey)) return false
        seen.add(dedupeKey)
        return true
      })
      .slice(0, 6)
      .map(ev => ({
        title: ev.book_title || 'Unknown',
        author: ev.book_author || '',
        coverId: ev.cover_id || null,
        olKey: ev.book_ol_key || null,
        friendName: ev.profiles?.display_name || ev.profiles?.username || 'A friend',
        userId: ev.user_id,
        _key: `fr-reading-${ev.book_ol_key || ev.book_title}`,
        _friendReading: true,
      }))
  })()

  // Friends recent reads — books friends have finished, not already in recs or currently reading
  const readingOlKeys = new Set(friendsReading.map(b => b.olKey).filter(Boolean))
  const friendsRecentReads = (() => {
    const seen = new Set()
    return (feed || [])
      .filter(ev =>
        (ev.event_type === 'finished' || ev.event_type === 'posted_review') &&
        friendIds.has(ev.user_id) &&
        !(ev.book_ol_key && recOlKeys.has(ev.book_ol_key)) &&
        !(ev.book_ol_key && readingOlKeys.has(ev.book_ol_key))
      )
      .filter(ev => {
        const dedupeKey = ev.book_ol_key || ev.book_title
        if (!dedupeKey || seen.has(dedupeKey)) return false
        seen.add(dedupeKey)
        return true
      })
      .slice(0, 4)
      .map(ev => ({
        title: ev.book_title || 'Unknown',
        author: ev.book_author || '',
        coverId: ev.cover_id || null,
        olKey: ev.book_ol_key || null,
        friendName: ev.profiles?.display_name || ev.profiles?.username || 'A friend',
        userId: ev.user_id,
        _key: `fr-recent-${ev.book_ol_key || ev.book_title}`,
        _friendRecent: true,
      }))
  })()

  // Order: (1) friend recs, (2) friends currently reading, (3) friends recent reads
  const allFriendCards = [...groupedRecs, ...friendsReading, ...friendsRecentReads]

  function addToTBR(book, key) {
    // No duplicate blocking for AI picks — allow adding books already in history
    if (!book._aiPick) {
      const dup = findDuplicate(book.title, book.author)
      if (dup) {
        if (dup.status === 'tbr' || dup.status === 'reading') { setDupMsgKey(key); return }
        setPendingReread({ book, key }); setDupMsgKey(key); return
      }
    }
    addBook({ title: book.title, author: book.author, status: 'tbr', coverId: book.coverId || null, coverUrl: book.coverUrl || null, olKey: book.olKey || null, googleBooksId: book.googleBooksId || null, isbn: book.isbn || null, description: book.description || null })
    setAddedKeys(prev => new Set([...prev, key]))
    if (book._aiIndex !== undefined) aiPicks.markAdded(book._aiIndex)
    setTimeout(() => setSelectedBook(null), 900)
  }

  function confirmReread() {
    if (!pendingReread) return
    const { book, key } = pendingReread
    addBook({ title: book.title, author: book.author, status: 'tbr', coverId: book.coverId || null, coverUrl: book.coverUrl || null, olKey: book.olKey || null, googleBooksId: book.googleBooksId || null, isbn: book.isbn || null, description: book.description || null })
    setPendingReread(null); setDupMsgKey(null)
    setAddedKeys(prev => new Set([...prev, key]))
    if (book._aiIndex !== undefined) aiPicks.markAdded(book._aiIndex)
    setTimeout(() => setSelectedBook(null), 900)
  }

  async function acceptFriendRec(r) {
    const key = `fr-${r.id}`
    await acceptRecToTBR(r.id, r.book_ol_key, r.book_title, r.book_author, r.cover_id, addBook, books, r.cover_url || null)
    setAddedKeys(prev => new Set([...prev, key]))
    setTimeout(() => setSelectedBook(null), 900)
  }

  return (
    <div ref={swipeRef} className="rt-page" style={{ maxWidth: 760, margin: '0 auto' }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 1rem' }}>
        <h2 style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.35rem', fontWeight: 600, color: 'var(--rt-navy)', margin: 0 }}>Discover</h2>
        <button onClick={onRecommend} style={{ background: 'var(--rt-amber-pale)', border: 'none', borderRadius: 99, padding: '0.25rem 0.75rem', fontSize: '0.7rem', fontWeight: 700, color: 'var(--rt-amber)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <span style={{ fontSize: '0.9rem', lineHeight: 1 }}>+</span> Recommend
        </button>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', borderBottom: '2px solid var(--rt-border)', marginBottom: '1.25rem' }}>
        {DISCOVER_TABS.map(t => (
          <button
            key={t}
            onClick={() => setDiscoverTab(t)}
            style={{
              flex: 1, background: 'none', border: 'none', cursor: 'pointer',
              padding: '0.6rem 0.5rem',
              fontFamily: 'var(--rt-font-body)',
              fontSize: '0.88rem',
              fontWeight: discoverTab === t ? 600 : 500,
              color: discoverTab === t ? 'var(--rt-navy)' : 'var(--rt-t3)',
              borderBottom: `2.5px solid ${discoverTab === t ? 'var(--rt-amber)' : 'transparent'}`,
              marginBottom: '-2px',
              transition: 'color 0.15s',
            }}
          >
            {DISCOVER_TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* ── Spaces tab ── */}
      {discoverTab === 'spaces' && (
        <SpacesTab
          user={user}
          books={books}
          friends={friends}
          onOpenSpace={onOpenSpace}
        />
      )}

      {/* ── Genres tab ── */}
      {discoverTab === 'genres' && (
        <GenresTab
          user={user}
          addBook={addBook}
          onSelectBook={book => {
            setShowRecommend(false)
            setShowChatPicker(false)
            setSelectedBook(book)
          }}
        />
      )}

      {/* ── Picks tab ── */}
      {/* ── Picks tab ── */}
      {discoverTab === 'picks' && <>

      {/* ── LitLoop Picks ── */}
      <PicksSection
        title="LitLoop Picks"
        loading={editorialLoading}
        loadingMsg="Loading picks…"
        empty={!editorialLoading && editorialFeed.length === 0}
        emptyMsg={activeMood ? 'No picks in this mood yet.' : 'All caught up — check back soon.'}
        action={
          <button
            onClick={shuffleFeed}
            style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, color: 'var(--rt-t3)', padding: 0 }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/></svg>
            Shuffle
          </button>
        }
      >
        {/* Mood filter pills — always visible, scroll horizontally */}
        <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', paddingBottom: '0.5rem', scrollbarWidth: 'none', marginBottom: '0.75rem' }}>
          <button
            onClick={() => setActiveMood(null)}
            style={{ flexShrink: 0, padding: '0.25rem 0.75rem', borderRadius: 99, fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', border: `1.5px solid ${!activeMood ? 'var(--rt-navy)' : 'var(--rt-border-md)'}`, background: !activeMood ? 'var(--rt-navy)' : 'var(--rt-white)', color: !activeMood ? '#fff' : 'var(--rt-t2)', transition: 'all 0.15s' }}
          >
            All
          </button>
          {moods.map(m => (
            <button
              key={m.id}
              onClick={() => setActiveMood(activeMood === m.id ? null : m.id)}
              style={{ flexShrink: 0, padding: '0.25rem 0.75rem', borderRadius: 99, fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', border: `1.5px solid ${activeMood === m.id ? 'var(--rt-amber)' : 'var(--rt-border-md)'}`, background: activeMood === m.id ? 'var(--rt-amber)' : 'var(--rt-white)', color: activeMood === m.id ? '#fff' : 'var(--rt-t2)', transition: 'all 0.15s' }}
            >
              {m.label}
            </button>
          ))}
        </div>
        <PicksCarousel>
          {editorialFeed.map((book, i) => (
            <PicksBookCard
              key={book.ol_key || i}
              title={book.title}
              coverId={getCoverForBook(book)}
              olKey={book.ol_key}
              coverUrl={getCoverUrlForBook(book)}
              badge={book._wildcard ? 'New' : null}
              badgeColour="var(--rt-teal)"
              added={addedKeys.has(`ll-${book.ol_key}`)}
              onClick={() => {
                setShowRecommend(false); setShowChatPicker(false)
                setSelectedBook({
                  title: book.title, author: book.author,
                  coverId: getCoverForBook(book) || null,
                  olKey: getOlKeyForBook(book) || null,
                  coverUrl: getCoverUrlForBook(book) || null,
                  editorNote: book.editor_note,
                  _key: `ll-${book.ol_key}`, _dbOlKey: book.ol_key,
                  _editorial: true, _moodId: book.mood_id,
                  _moodLabel: moods.find(m => m.id === book.mood_id)?.label || null,
                  _rawBook: book,
                })
              }}
            />
          ))}
        </PicksCarousel>
      </PicksSection>

      {/* ── Friends' Picks ── */}
      <PicksSection
        title="Friends' Picks"
        badge={pendingRecs.length > 0 ? pendingRecs.length : null}
        empty={!!user && allFriendCards.length === 0}
        emptyMsg={!user ? 'Sign in to see friends’ recommendations.' : 'No recommendations yet — add friends to get started.'}
      >
        <div style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none', paddingBottom: '0.5rem' }}>
          {allFriendCards.map((g) => {
            const isReading    = !!g._friendReading
            const isRecent     = !!g._friendRecent
            const isFriendBook = isReading || isRecent
            const totalCards   = allFriendCards.length
            return (
              <div
                key={g._key}
                onClick={() => {
                  setShowRecommend(false); setShowChatPicker(false)
                  if (isFriendBook) {
                    setSelectedBook({ title: g.title, author: g.author, coverId: g.coverId, olKey: g.olKey, friendReading: isReading ? g.friendName : null, _key: g._key })
                  } else {
                    const localBook = books.find(b => (g.book_ol_key && b.olKey === g.book_ol_key) || (g.book_title && b.title?.toLowerCase() === g.book_title?.toLowerCase()))
                    setSelectedBook({ title: g.book_title, author: g.book_author, coverId: localBook?.coverId || g.cover_id, coverUrl: localBook?.coverUrl || g.cover_url || null, description: localBook?.description || null, olKey: localBook?.olKey || g.book_ol_key, fromFriend: g.recommenders[0]?.name, message: g.recommenders[0]?.message, recommenders: g.recommenders, _key: g._key, _recs: g._recs, _rec: g._recs[0] })
                  }
                }}
                style={{ flexShrink: 0, width: totalCards === 1 ? '100%' : '85%', scrollSnapAlign: 'start', background: 'var(--rt-white)', borderRadius: 'var(--rt-r3)', border: '1px solid var(--rt-border)', padding: '0.9rem 1rem', boxShadow: 'var(--rt-s1)', display: 'flex', gap: '0.85rem', alignItems: 'center', cursor: 'pointer', boxSizing: 'border-box', position: 'relative' }}
              >
                <CoverImage
                  coverId={isFriendBook ? g.coverId : g.cover_id}
                  olKey={isFriendBook ? g.olKey : g.book_ol_key}
                  coverUrl={isFriendBook ? g.coverUrl : (g.cover_url || null)}
                  title={isFriendBook ? g.title : g.book_title}
                  size="M"
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--rt-teal)', marginBottom: '0.25rem' }}>
                    {isReading ? `${g.friendName} is reading this` : isRecent ? `${g.friendName} recently read` : g.recommenders.length === 1 ? `${g.recommenders[0].name} recommends` : `${g.recommenders.length} friends recommend`}
                  </div>
                  <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.92rem', fontWeight: 700, color: 'var(--rt-navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {isFriendBook ? g.title : (g.book_title || 'Unknown')}
                  </div>
                  {(isFriendBook ? g.author : g.book_author) && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--rt-t3)', marginTop: '0.15rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {isFriendBook ? g.author : g.book_author}
                    </div>
                  )}
                  {!isFriendBook && g.recommenders[0]?.message && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--rt-t2)', marginTop: '0.3rem', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>"{g.recommenders[0].message}"</div>
                  )}
                </div>
                {!isFriendBook && g.recommenders.length > 1 && (
                  <div style={{ position: 'absolute', top: 8, right: 10, background: 'var(--rt-amber)', color: '#fff', borderRadius: 99, fontSize: '0.6rem', fontWeight: 700, padding: '0.15em 0.45em', minWidth: 18, textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.25)' }}>
                    {g.recommenders.length}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </PicksSection>

      {/* ── AI Picks ── */}
      <PicksSection
        title="✦ AI Picks"
        empty={false}
        action={aiPicks.state === 'done' ? (
          <button onClick={aiPicks.refresh} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, color: 'var(--rt-t3)', padding: 0 }}>
            Refresh
          </button>
        ) : null}
      >
        {aiPicks.state === 'idle' && (
          <div style={{ background: 'var(--rt-white)', borderRadius: 'var(--rt-r3)', border: '1px solid var(--rt-border)', padding: '1.5rem', textAlign: 'center' }}>
            {aiPicks.error && (
              <p style={{ fontSize: '0.8rem', color: '#991b1b', marginBottom: '0.75rem', lineHeight: 1.5 }}>{aiPicks.error}</p>
            )}
            <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>✦</div>
            <p style={{ fontSize: '0.83rem', color: 'var(--rt-t2)', marginBottom: '1.1rem', lineHeight: 1.6, maxWidth: 280, margin: '0 auto 1.1rem' }}>
              Claude analyses your reading history to surface books you'll love.
            </p>
            <button
              onClick={aiPicks.fetchPicks}
              style={{ background: 'var(--rt-navy)', color: '#fff', border: 'none', borderRadius: 99, padding: '0.6rem 1.5rem', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}
            >
              ✦ Get my picks
            </button>
          </div>
        )}
        {aiPicks.state === 'loading' && (
          <div style={{ background: 'var(--rt-white)', borderRadius: 'var(--rt-r3)', border: '1px solid var(--rt-border)', padding: '2rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem', animation: 'rt-fadein 0.5s ease' }}>✦</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--rt-t3)' }}>Reading your history…</div>
          </div>
        )}
        {aiPicks.state === 'error' && (
          <div style={{ background: 'var(--rt-white)', borderRadius: 'var(--rt-r3)', border: '1px solid var(--rt-border)', padding: '1.5rem', textAlign: 'center' }}>
            <p style={{ fontSize: '0.8rem', color: '#991b1b', marginBottom: '0.75rem', lineHeight: 1.5 }}>{aiPicks.error}</p>
            <button onClick={aiPicks.fetchPicks} style={{ background: 'var(--rt-navy)', color: '#fff', border: 'none', borderRadius: 99, padding: '0.55rem 1.25rem', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}>
              Try again
            </button>
          </div>
        )}
        {aiPicks.state === 'done' && (
          <PicksCarousel>
            {aiPicks.recs.map(rec => (
              <PicksBookCard
                key={rec._index}
                title={rec.title}
                coverId={rec.coverId || null}
                olKey={rec.olKey || null}
                coverUrl={rec.coverUrl || null}
                added={aiPicks.added.has(rec._index)}
                onClick={() => {
                  setShowRecommend(false)
                  setSelectedBook({
                    title: rec.title, author: rec.author,
                    coverId: rec.coverId || null, olKey: rec.olKey || null,
                    coverUrl: rec.coverUrl || null,
                    why: rec.why, desc: rec.desc,
                    _key: `ai-${rec._index}`,
                    _aiPick: true, _aiIndex: rec._index,
                  })
                }}
              />
            ))}
          </PicksCarousel>
        )}
      </PicksSection>

      {/* ── Recommend modal ── */}
      {selectedBook && showRecommend && (
        <RecommendModal
          book={selectedBook} friends={friends} user={user}
          recs={recs} feed={feed} sendRecommendation={sendRecommendation}
          onClose={() => setShowRecommend(false)}
          onStartChatWith={() => { setShowRecommend(false); setShowChatPicker(true) }}
        />
      )}

      {/* ── Chat picker ── */}
      {selectedBook && showChatPicker && (
        <DiscoverChatPicker
          book={selectedBook} friends={friends} chats={chats}
          startOrOpenChat={startOrOpenChat} onOpenChatModal={onOpenChatModal}
          onClose={() => setShowChatPicker(false)}
        />
      )}
      </>}


      {/* ── Book modal (shared across both tabs) ── */}
      {selectedBook && !showRecommend && !showChatPicker && (() => {
        const currentKey = selectedBook._key
        const isGenreBook = !!selectedBook._genreBook
        const dup = (!isGenreBook && dupMsgKey === currentKey && !selectedBook._aiPick) ? findDuplicate(selectedBook.title, selectedBook.author) : null
        let dupMsg = null
        if (dup) {
          if (dup.status === 'tbr') dupMsg = `"${dup.title}" is already in your To Read list.`
          else if (dup.status === 'reading') dupMsg = `You're currently reading "${dup.title}".`
          else dupMsg = `You've already read "${dup.title}". Add it again as a reread?`
        }
        const isAdded = addedKeys.has(currentKey) || (selectedBook._aiIndex !== undefined && aiPicks.added.has(selectedBook._aiIndex))
        return (
          <BookModal
            book={selectedBook}
            added={isAdded}
            dupMsg={dupMsg}
            onReread={dup && dup.status !== 'tbr' && dup.status !== 'reading' ? confirmReread : null}
            onClose={() => { setSelectedBook(null); setDupMsgKey(null); setPendingReread(null) }}
            onAddToTBR={isGenreBook
              ? async (status) => {
                  await addBook({
                    title:    selectedBook.title,
                    author:   selectedBook.author   || '',
                    olKey:    selectedBook.olKey     || null,
                    coverUrl: selectedBook.coverUrl  || null,
                    coverId:  selectedBook.coverId   || null,
                    status,
                    dateRead: status === 'read' ? new Date().toISOString().split('T')[0] : null,
                  })
                  selectedBook._onStatusChange?.(selectedBook._bookId, status)
                  setSelectedBook(null)
                }
              : () => {
                  if (selectedBook._recs?.length) {
                    selectedBook._recs.forEach(r => acceptFriendRec(r))
                  } else if (selectedBook._rec) {
                    acceptFriendRec(selectedBook._rec)
                  } else {
                    addToTBR(selectedBook, currentKey)
                  }
                }
            }
            onRecommend={() => setShowRecommend(true)}
            onChat={() => setShowChatPicker(true)}
            onDismiss={
              isGenreBook
                ? () => selectedBook._onDismiss?.(selectedBook._bookId)
                : selectedBook._editorial
                  ? () => dismissBook(selectedBook._dbOlKey || currentKey)
                  : selectedBook._aiPick
                    ? () => aiPicks.dismiss(selectedBook._aiIndex)
                    : null
            }
          />
        )
      })()}
    </div>
  )
}