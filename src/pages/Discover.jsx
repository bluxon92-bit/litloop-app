import { useState, useEffect } from 'react'
import { useLitLoopPicks } from '../hooks/useLitLoopPicks'
import { useBooksContext } from '../context/BooksContext'
import { useSocialContext } from '../context/SocialContext'
import { useChatContext } from '../context/ChatContext'
import { useAuthContext } from '../context/AuthContext'
import { useAiPicks } from '../hooks/useAiPicks'
import { avatarColour, avatarInitial } from '../lib/utils'
import { IcoBook, IcoChat } from '../components/icons'
import CoverImage from '../components/books/CoverImage'

// ── Robust OL search ──────────────────────────────────────────────
async function searchOL(title, author, fields = 'cover_i,key') {
  const cleanTitle = (title || '').replace(/\s*\([^)]*#\d[^)]*\)/g, '').replace(/[:\u2014\u2013].*/u, '').trim()
  const cleanAuthor = author ? author.split(',')[0].split(' ').pop() : ''
  const JUNK = ['sparknotes', 'cliffsnotes', 'study guide', 'summary', 'analysis', 'gradesaver', 'bookrags', 'litcharts']
  const strategies = [
    cleanAuthor ? `title=${encodeURIComponent(cleanTitle)}&author=${encodeURIComponent(cleanAuthor)}&type=work` : null,
    `title=${encodeURIComponent(cleanTitle)}&type=work`,
    `q=${encodeURIComponent(cleanTitle + (cleanAuthor ? ' ' + cleanAuthor : ''))}&type=work`,
  ].filter(Boolean)
  for (const params of strategies) {
    try {
      const res = await fetch(`https://openlibrary.org/search.json?${params}&fields=${fields}&limit=5`)
      const data = await res.json()
      const doc = (data.docs || []).find(d => {
        const t = (d.title || '').toLowerCase()
        return (d.cover_i || d.key) && !JUNK.some(k => t.includes(k))
      })
      if (doc) return doc
    } catch {}
  }
  return null
}

// ── Small book card for carousels ────────────────────────────────
function BookCard({ title, author, coverId, olKey, coverUrl, onClick, moodLabel, onDismiss }) {
  return (
    <div style={{ flexShrink: 0, width: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
      <div onClick={onClick} style={{ cursor: 'pointer', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <CoverImage coverId={coverId} olKey={olKey} coverUrl={coverUrl} title={title} size="L"
          style={{ width: 76, height: 110, borderRadius: 8, boxShadow: '0 3px 10px rgba(26,39,68,0.15)' }} />
        <div style={{ marginTop: '0.4rem', width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--rt-navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
          {author && <div style={{ fontSize: '0.6rem', color: 'var(--rt-t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{author}</div>}
          {moodLabel && <div style={{ fontSize: '0.55rem', color: 'var(--rt-t3)', marginTop: '0.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.75 }}>{moodLabel}</div>}
        </div>
      </div>
      {onDismiss && (
        <button
          onClick={e => { e.stopPropagation(); onDismiss() }}
          title="Not for me"
          style={{ marginTop: '0.35rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.65rem', color: 'var(--rt-t3)', padding: '0.1rem 0.3rem', borderRadius: 4, lineHeight: 1 }}
        >
          ✕ not for me
        </button>
      )}
    </div>
  )
}

// ── Horizontal carousel ───────────────────────────────────────────
function Carousel({ children }) {
  return (
    <div style={{ display: 'flex', gap: '0.65rem', overflowX: 'auto', paddingBottom: '0.25rem', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
      {children}
    </div>
  )
}

// ── LitLoop Picks section ─────────────────────────────────────────
function LitLoopPicksSection({ feed, loading, moods, activeMood, setActiveMood, shuffleFeed, getCoverForBook, getCoverUrlForBook, onSelect, onDismiss, addedKeys }) {
  const [filterOpen, setFilterOpen] = useState(false)
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.65rem' }}>
        <span style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.95rem', fontWeight: 600, color: 'var(--rt-navy)', flex: 1 }}>
          LitLoop Picks
          {activeMood && (
            <span style={{ marginLeft: '0.4rem', fontSize: '0.72rem', fontWeight: 600, color: 'var(--rt-amber)', background: 'var(--rt-amber-pale)', borderRadius: 99, padding: '0.1em 0.5em' }}>
              {moods.find(m => m.id === activeMood)?.label}
            </span>
          )}
        </span>
        <button
          onClick={() => setFilterOpen(v => !v)}
          style={{ background: filterOpen ? 'var(--rt-navy)' : 'var(--rt-surface)', border: `1px solid ${filterOpen ? 'var(--rt-navy)' : 'var(--rt-border-md)'}`, borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.15s' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={filterOpen ? '#fff' : 'var(--rt-navy)'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
        </button>
      </div>
      {filterOpen && (
        <div style={{ marginBottom: '0.65rem', display: 'flex', gap: '0.4rem', overflowX: 'auto', paddingBottom: '0.25rem', scrollbarWidth: 'none' }}>
          {activeMood && (
            <button onClick={() => { setActiveMood(null); setFilterOpen(false) }}
              style={{ flexShrink: 0, background: 'var(--rt-navy)', color: '#fff', border: 'none', borderRadius: 99, padding: '0.35rem 0.85rem', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
              ✕ Clear
            </button>
          )}
          {moods.map(m => (
            <button key={m.id} onClick={() => { setActiveMood(activeMood === m.id ? null : m.id); setFilterOpen(false) }}
              style={{ flexShrink: 0, background: activeMood === m.id ? 'var(--rt-amber)' : 'var(--rt-surface)', color: activeMood === m.id ? '#fff' : 'var(--rt-navy)', border: `1px solid ${activeMood === m.id ? 'var(--rt-amber)' : 'var(--rt-border-md)'}`, borderRadius: 99, padding: '0.35rem 0.85rem', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s' }}>
              {m.label}
            </button>
          ))}
        </div>
      )}
      <div style={{ background: 'var(--rt-white)', borderRadius: 'var(--rt-r3)', border: '1px solid var(--rt-border)', boxShadow: 'var(--rt-s1)', padding: '1rem' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '1.5rem 0', color: 'var(--rt-t3)', fontSize: '0.85rem' }}>Loading picks…</div>
        ) : feed.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--rt-t3)', marginBottom: '0.5rem' }}>
              {activeMood ? 'No picks in this mood yet.' : 'All caught up — check back soon.'}
            </div>
            {activeMood && <button onClick={() => setActiveMood(null)} style={{ background: 'none', border: 'none', color: 'var(--rt-amber)', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>Show all moods</button>}
          </div>
        ) : (
          <>
            <Carousel>
              {feed.map((book, i) => (
                <div key={book.ol_key || i} style={{ position: 'relative', flexShrink: 0 }}>
                  <BookCard
                    title={book.title} author={book.author}
                    coverId={getCoverForBook(book)} olKey={book.ol_key}
                    coverUrl={getCoverUrlForBook(book)}
                    onClick={() => onSelect(book)}
                    moodLabel={moods.find(m => m.id === book.mood_id)?.label}
                  />
                  {book._wildcard && (
                    <div style={{ position: 'absolute', top: 4, left: 2, background: 'var(--rt-teal)', color: '#fff', borderRadius: 4, fontSize: '0.52rem', fontWeight: 700, padding: '0.1em 0.35em', whiteSpace: 'nowrap', letterSpacing: '0.03em' }}>NEW</div>
                  )}
                  {addedKeys.has(`ll-${book.ol_key}`) && (
                    <div style={{ position: 'absolute', top: 4, right: 12, background: 'var(--rt-teal)', color: '#fff', borderRadius: 4, fontSize: '0.52rem', fontWeight: 700, padding: '0.1em 0.35em' }}>✓</div>
                  )}
                </div>
              ))}
            </Carousel>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.75rem' }}>
              <button onClick={shuffleFeed} style={{ background: 'none', border: 'none', fontSize: '0.78rem', color: 'var(--rt-t3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/></svg>
                Shuffle picks
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Book detail modal ─────────────────────────────────────────────
function BookModal({ book, added, dupMsg, onReread, onClose, onAddToTBR, onRecommend, onChat, onDismiss }) {
  const [desc, setDesc]               = useState('')
  const [descLoading, setDescLoading] = useState(true)
  const [showFullDesc, setShowFullDesc] = useState(false)

  useEffect(() => {
    setDesc(''); setDescLoading(true)
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
        if (cached) { if (!cancelled) { setDesc(cached); setDescLoading(false) }; return }

        // 1. Try with provided olKey first
        let description = ''
        if (book.olKey) {
          description = await fetchDesc(book.olKey)
        }

        // 2. If that failed or returned nothing, search OL by title/author for a fresh key
        if (!description) {
          const doc = await searchOL(book.title, book.author, 'key')
          if (doc?.key) {
            description = await fetchDesc(doc.key)
          }
        }

        if (description) {
          try { localStorage.setItem(cacheKey, description) } catch {}
        }
        if (!cancelled) setDesc(description)
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
            {onReread ? (
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

// ── Main Discover page ────────────────────────────────────────────
export default function Discover({ onNavigate, onOpenChatModal, onRecommend, pendingRecOpen }) {
  const { user }                               = useAuthContext()
  const { books, addBook, findDuplicate }      = useBooksContext()
  const { recs, friends, feed, dismissRec, acceptRecToTBR, sendRecommendation, preferredMoods } = useSocialContext()
  const { chats, startOrOpenChat }             = useChatContext()

  const {
    feed: editorialFeed, loading: editorialLoading, moods,
    activeMood, setActiveMood, dismissBook, shuffleFeed, getCoverForBook, getCoverUrlForBook, getOlKeyForBook,
  } = useLitLoopPicks({ userId: user?.id, books, preferredMoods })

  const aiPicks = useAiPicks(user, books)

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
    setSelectedBook({
      title:        r.book_title  || '',
      author:       r.book_author || '',
      coverId:      r.cover_id    || null,
      olKey:        r.book_ol_key || null,
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
    addBook({ title: book.title, author: book.author, status: 'tbr', coverId: book.coverId || null, olKey: book.olKey || null })
    setAddedKeys(prev => new Set([...prev, key]))
    if (book._aiIndex !== undefined) aiPicks.markAdded(book._aiIndex)
    setTimeout(() => setSelectedBook(null), 900)
  }

  function confirmReread() {
    if (!pendingReread) return
    const { book, key } = pendingReread
    addBook({ title: book.title, author: book.author, status: 'tbr', coverId: book.coverId || null, olKey: book.olKey || null })
    setPendingReread(null); setDupMsgKey(null)
    setAddedKeys(prev => new Set([...prev, key]))
    if (book._aiIndex !== undefined) aiPicks.markAdded(book._aiIndex)
    setTimeout(() => setSelectedBook(null), 900)
  }

  async function acceptFriendRec(r) {
    const key = `fr-${r.id}`
    await acceptRecToTBR(r.id, r.book_ol_key, r.book_title, r.book_author, r.cover_id, addBook, books)
    setAddedKeys(prev => new Set([...prev, key]))
    setTimeout(() => setSelectedBook(null), 900)
  }

  return (
    <div className="rt-page" style={{ maxWidth: 760, margin: '0 auto' }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 1rem' }}>
        <h2 style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.35rem', fontWeight: 600, color: 'var(--rt-navy)', margin: 0 }}>Discover</h2>
        <button onClick={onRecommend} style={{ background: 'var(--rt-amber-pale)', border: 'none', borderRadius: 99, padding: '0.25rem 0.75rem', fontSize: '0.7rem', fontWeight: 700, color: 'var(--rt-amber)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <span style={{ fontSize: '0.9rem', lineHeight: 1 }}>+</span> Recommend
        </button>
      </div>

      {/* ── Block 1: LitLoop Picks ── */}
      <LitLoopPicksSection
        feed={editorialFeed} loading={editorialLoading} moods={moods}
        activeMood={activeMood} setActiveMood={setActiveMood}
        shuffleFeed={shuffleFeed} getCoverForBook={getCoverForBook}
        getCoverUrlForBook={getCoverUrlForBook}
        onSelect={book => {
          setShowRecommend(false); setShowChatPicker(false)
          const cover = getCoverForBook(book)
          const confirmedOlKey = getOlKeyForBook(book)
          setSelectedBook({
            title: book.title, author: book.author, coverId: cover || null,
            olKey: confirmedOlKey || null, coverUrl: getCoverUrlForBook(book) || null,
            editorNote: book.editor_note,
            _key: `ll-${book.ol_key}`, _dbOlKey: book.ol_key,
            _editorial: true, _moodId: book.mood_id,
            _moodLabel: moods.find(m => m.id === book.mood_id)?.label || null,
            _rawBook: book,
          })
        }}
        onDismiss={dismissBook}
        addedKeys={addedKeys}
      />

      {/* ── Block 2: Friends' Picks ── */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.65rem' }}>
          <span style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.95rem', fontWeight: 600, color: 'var(--rt-navy)' }}>Friends' Picks</span>
          {pendingRecs.length > 0 && (
            <span style={{ background: 'var(--rt-amber)', color: '#fff', borderRadius: 99, fontSize: '0.62rem', fontWeight: 700, padding: '0.1em 0.5em' }}>{pendingRecs.length}</span>
          )}
        </div>
        {!user ? (
          <div className="rt-card" style={{ color: 'var(--rt-t3)', fontSize: '0.85rem', padding: '1rem' }}>Sign in to see friends' recommendations.</div>
        ) : allFriendCards.length === 0 ? (
          <div className="rt-card" style={{ color: 'var(--rt-t3)', fontSize: '0.85rem', padding: '1rem' }}>No recommendations yet — add friends to get started.</div>
        ) : (
          <div style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none', paddingBottom: '0.25rem' }}>
            {allFriendCards.map((g, idx) => {
              const isReading = !!g._friendReading
              const isRecent  = !!g._friendRecent
              const isFriendBook = isReading || isRecent
              const totalCards = allFriendCards.length
              return (
                <div
                  key={g._key}
                  onClick={() => {
                    setShowRecommend(false); setShowChatPicker(false)
                    if (isFriendBook) {
                      setSelectedBook({ title: g.title, author: g.author, coverId: g.coverId, olKey: g.olKey, friendReading: isReading ? g.friendName : null, _key: g._key })
                    } else {
                      setSelectedBook({ title: g.book_title, author: g.book_author, coverId: g.cover_id, olKey: g.book_ol_key, fromFriend: g.recommenders[0]?.name, message: g.recommenders[0]?.message, recommenders: g.recommenders, _key: g._key, _recs: g._recs, _rec: g._recs[0] })
                    }
                  }}
                  style={{
                    flexShrink: 0,
                    width: totalCards === 1 ? '100%' : '85%',
                    scrollSnapAlign: 'start',
                    background: 'var(--rt-white)', borderRadius: 'var(--rt-r3)',
                    border: '1px solid var(--rt-border)', padding: '0.9rem 1rem',
                    boxShadow: 'var(--rt-s1)', display: 'flex', gap: '0.85rem',
                    alignItems: 'center', cursor: 'pointer', boxSizing: 'border-box', position: 'relative',
                  }}
                >
                  <CoverImage
                    coverId={isFriendBook ? g.coverId : g.cover_id}
                    olKey={isFriendBook ? g.olKey : g.book_ol_key}
                    title={isFriendBook ? g.title : g.book_title}
                    size="M"
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--rt-teal)', marginBottom: '0.25rem' }}>
                      {isReading
                        ? `${g.friendName} is reading this`
                        : isRecent
                          ? `${g.friendName} recently read`
                          : g.recommenders.length === 1
                            ? `${g.recommenders[0].name} recommends`
                            : `${g.recommenders.length} friends recommend`}
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
        )}
      </div>

      {/* ── Block 3: AI Picks ── */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.65rem' }}>
          <span style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.95rem', fontWeight: 600, color: 'var(--rt-navy)' }}>AI Picks</span>
        </div>
        <div style={{ background: 'var(--rt-white)', borderRadius: 'var(--rt-r3)', border: '1px solid var(--rt-border)', boxShadow: 'var(--rt-s1)', padding: '1rem' }}>
          {aiPicks.state === 'idle' ? (
            <div style={{ textAlign: 'center' }}>
              {aiPicks.error && <p style={{ fontSize: '0.8rem', color: '#991b1b', marginBottom: '0.75rem' }}>{aiPicks.error}</p>}
              <p style={{ fontSize: '0.83rem', color: 'var(--rt-t3)', marginBottom: '1rem', lineHeight: 1.5 }}>
                Claude analyses your reading history to find books you'll love.
              </p>
              <button className="rt-submit-btn" onClick={aiPicks.fetchPicks}>✦ Get recommendations</button>
            </div>
          ) : aiPicks.state === 'loading' ? (
            <div style={{ textAlign: 'center', padding: '1.25rem 0', color: 'var(--rt-t3)', fontSize: '0.9rem' }}>
              <div style={{ fontSize: '1.4rem', marginBottom: '0.5rem' }}>✦</div>
              Reading your history…
            </div>
          ) : aiPicks.state === 'error' ? (
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '0.8rem', color: '#991b1b', marginBottom: '0.75rem' }}>{aiPicks.error}</p>
              <button className="rt-submit-btn" onClick={aiPicks.fetchPicks}>Try again</button>
            </div>
          ) : (
            <>
              <Carousel>
                {aiPicks.recs.map(rec => (
                  <BookCard
                    key={rec._index}
                    title={rec.title}
                    author={rec.author}
                    coverId={rec.coverId || null}
                    olKey={rec.olKey || null}
                    coverUrl={rec.coverUrl || null}
                    onClick={() => {
                      setShowRecommend(false)
                      setSelectedBook({
                        title: rec.title, author: rec.author,
                        coverId: rec.coverId || null, olKey: rec.olKey || null,
                        coverUrl: rec.coverUrl || null,
                        why: rec.why, desc: rec.desc,
                        _key: `ai-${rec._index}`,
                        _aiPick: true,
                        _aiIndex: rec._index,
                      })
                    }}
                    onDismiss={() => aiPicks.dismiss(rec._index)}
                  />
                ))}
              </Carousel>
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.85rem' }}>
                <button onClick={aiPicks.refresh} style={{ background: 'none', border: 'none', fontSize: '0.78rem', color: 'var(--rt-t3)', cursor: 'pointer', textDecoration: 'underline' }}>
                  Refresh picks
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Book modal ── */}
      {selectedBook && !showRecommend && !showChatPicker && (() => {
        const currentKey = selectedBook._key
        const dup = (dupMsgKey === currentKey && !selectedBook._aiPick) ? findDuplicate(selectedBook.title, selectedBook.author) : null
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
            onAddToTBR={() => {
              if (selectedBook._recs?.length) {
                selectedBook._recs.forEach(r => acceptFriendRec(r))
              } else if (selectedBook._rec) {
                acceptFriendRec(selectedBook._rec)
              } else {
                addToTBR(selectedBook, currentKey)
              }
            }}
            onRecommend={() => setShowRecommend(true)}
            onChat={() => setShowChatPicker(true)}
            onDismiss={
              selectedBook._editorial
                ? () => dismissBook(selectedBook._dbOlKey || currentKey)
                : selectedBook._aiPick
                  ? () => aiPicks.dismiss(selectedBook._aiIndex)
                  : null
            }
          />
        )
      })()}

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
    </div>
  )
}