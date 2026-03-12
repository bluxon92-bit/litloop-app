import { useState, useEffect, useRef } from 'react'
import { useLitLoopPicks } from '../hooks/useLitLoopPicks'
import { useBooksContext } from '../context/BooksContext'
import { useSocialContext } from '../context/SocialContext'
import { useChatContext } from '../context/ChatContext'
import { useAuthContext } from '../context/AuthContext'
import { avatarColour, avatarInitial } from '../lib/utils'

const SUPABASE_URL  = 'https://danknyhumorgkvidrdve.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhbmtueWh1bW9yZ2t2aWRyZHZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3OTMzMzksImV4cCI6MjA4ODM2OTMzOX0.uTbNT_MBipxNCJckFI2JFACvftdtSy3M-YRQuJVDziU'

function buildRecsPrompt(books) {
  const read    = books.filter(b => b.status === 'read')
  const reading = books.filter(b => b.status === 'reading')
  const dnf     = books.filter(b => b.status === 'dnf').slice(0, 4)
  const tbr     = books.filter(b => b.status === 'tbr').slice(0, 5)
  const genres  = [...new Set(books.map(b => b.genre).filter(Boolean))]
  const topRated = read.filter(b => b.rating >= 4).slice(0, 8)
  const sample   = topRated.length ? topRated : read.slice(0, 6)
  const safe = s => (s || '').replace(/[\r\n]+/g, ' ').slice(0, 200)
  const fmt  = b => `"${safe(b.title)}"${b.author ? ` by ${safe(b.author)}` : ''}${b.genre ? ` (${safe(b.genre)})` : ''}${b.rating ? ` ${b.rating}/5` : ''}`
  return `You are a deeply well-read friend. Here is someone's reading history:\n\nLOVED (4-5 stars):\n${sample.map(fmt).join('\n') || 'None yet'}\n\nCURRENTLY READING:\n${reading.map(fmt).join('\n') || 'Nothing'}\n\nDID NOT FINISH:\n${dnf.map(b => `"${safe(b.title)}"${b.author ? ` by ${safe(b.author)}` : ''}`).join('\n') || 'None'}\n\nWANTS TO READ:\n${tbr.map(b => safe(b.title)).join(', ') || 'Empty'}\n\nGenres they read: ${genres.map(safe).join(', ') || 'mixed'}. Total finished: ${read.length}.\n\nRecommend exactly 6 books. Respond ONLY with valid JSON array, no markdown, no preamble:\n[{"title":"...","author":"...","why":"one sentence referencing their history","desc":"one sentence on what makes this special"}]`
}

// Strip Goodreads series info: "Title (Series, #N; Series2, #N)" → "Title"
function cleanBookTitle(title) {
  return (title || '')
    .replace(/\s*\([^)]*#\d[^)]*\)/g, '')  // remove (Series, #N)
    .replace(/[:\u2014\u2013].*/u, '')        // strip subtitles after : or —
    .trim()
}

async function fetchRecs(prompt) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/recommendations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON}` },
      body: JSON.stringify({ prompt }),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const text = data.text || data.content?.find(c => c.type === 'text')?.text || ''
    if (!text) throw new Error('empty response')
    const clean = text.replace(/```json|```/g, '').trim()
    return JSON.parse(clean)
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Request timed out — please try again.')
    throw e
  } finally {
    clearTimeout(timeout)
  }
}

// ── Robust OL search — tries multiple strategies for best hit rate ──
async function searchOL(title, author, fields = 'cover_i,key') {
  // Clean title — strip subtitles after : or — which confuse OL search
  const cleanTitle = cleanBookTitle(book?.title || title || '')
  // Clean author — first surname only
  const cleanAuthor = author ? author.split(',')[0].split(' ').pop() : ''

  const JUNK_KEYWORDS = ['sparknotes', 'cliffsnotes', 'study guide', 'summary', 'analysis', 'gradesaver', 'bookrags', 'litcharts']

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
        return (d.cover_i || d.key) && !JUNK_KEYWORDS.some(k => t.includes(k))
      })
      if (doc) return doc
    } catch {}
  }
  return null
}

async function fetchOLCover(title, author) {
  const doc = await searchOL(title, author, 'cover_i')
  return doc?.cover_i || null
}

// ── Small book card for carousel ─────────────────────────────────
function BookCard({ title, author, coverId, olKey, onClick }) {
  return (
    <div onClick={onClick} style={{ flexShrink: 0, width: 100, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ width: 76, height: 110, borderRadius: 8, overflow: 'hidden', background: 'var(--rt-surface)', flexShrink: 0, boxShadow: '0 3px 10px rgba(26,39,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {coverId ? (
          <img src={`https://covers.openlibrary.org/b/id/${coverId}-M.jpg`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={title} />
        ) : olKey ? (
          <img src={`https://covers.openlibrary.org/b/olid/${olKey.replace('/works/', '')}-M.jpg`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" onError={e => e.target.style.display='none'} />
        ) : (
          <span style={{ fontSize: '1.8rem', opacity: 0.35 }}>📚</span>
        )}
      </div>
      <div style={{ marginTop: '0.4rem', width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--rt-navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
        {author && <div style={{ fontSize: '0.6rem', color: 'var(--rt-t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{author}</div>}
      </div>
    </div>
  )
}

// ── Section block ─────────────────────────────────────────────────
function Section({ label, emoji, children }) {
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.65rem' }}>
        <span>{emoji}</span>
        <span style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1rem', fontWeight: 700, color: 'var(--rt-navy)' }}>{label}</span>
      </div>
      <div style={{ background: 'var(--rt-white)', borderRadius: 'var(--rt-r3)', border: '1px solid var(--rt-border)', boxShadow: 'var(--rt-s1)', padding: '1rem' }}>
        {children}
      </div>
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

// ── LitLoop Picks section ────────────────────────────────────────
function LitLoopPicksSection({ feed, loading, moods, activeMood, setActiveMood, shuffleFeed, getCoverForBook, onSelect, onDismiss, addedKeys }) {
  const [filterOpen, setFilterOpen] = useState(false)

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.65rem' }}>
        <span style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1rem', fontWeight: 700, color: 'var(--rt-navy)', flex: 1 }}>
          LitLoop Picks
          {activeMood && (
            <span style={{ marginLeft: '0.4rem', fontSize: '0.72rem', fontWeight: 600, color: 'var(--rt-amber)', background: 'var(--rt-amber-pale)', borderRadius: 99, padding: '0.1em 0.5em' }}>
              {moods.find(m => m.id === activeMood)?.label}
            </span>
          )}
        </span>
        {/* Filter funnel button */}
        <button
          onClick={() => setFilterOpen(v => !v)}
          style={{ background: filterOpen ? 'var(--rt-navy)' : 'var(--rt-surface)', border: `1px solid ${filterOpen ? 'var(--rt-navy)' : 'var(--rt-border-md)'}`, borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.15s' }}
          title="Filter by mood"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={filterOpen ? '#fff' : 'var(--rt-navy)'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
        </button>
      </div>

      {/* Mood filter drawer */}
      {filterOpen && (
        <div style={{ marginBottom: '0.65rem', display: 'flex', gap: '0.4rem', overflowX: 'auto', paddingBottom: '0.25rem', scrollbarWidth: 'none' }}>
          {activeMood && (
            <button
              onClick={() => { setActiveMood(null); setFilterOpen(false) }}
              style={{ flexShrink: 0, background: 'var(--rt-navy)', color: '#fff', border: 'none', borderRadius: 99, padding: '0.35rem 0.85rem', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
              ✕ Clear
            </button>
          )}
          {moods.map(m => (
            <button key={m.id}
              onClick={() => { setActiveMood(activeMood === m.id ? null : m.id); setFilterOpen(false) }}
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
                    title={book.title}
                    author={book.author}
                    coverId={getCoverForBook(book)}
                    olKey={book.ol_key}
                    onClick={() => onSelect(book)}
                  />
                  {/* Wildcard tag */}
                  {book._wildcard && (
                    <div style={{ position: 'absolute', top: 4, left: 2, background: 'var(--rt-teal)', color: '#fff', borderRadius: 4, fontSize: '0.52rem', fontWeight: 700, padding: '0.1em 0.35em', whiteSpace: 'nowrap', letterSpacing: '0.03em' }}>
                      NEW
                    </div>
                  )}
                  {/* Added badge */}
                  {addedKeys.has(`ll-${book.ol_key}`) && (
                    <div style={{ position: 'absolute', top: 4, right: 12, background: 'var(--rt-teal)', color: '#fff', borderRadius: 4, fontSize: '0.52rem', fontWeight: 700, padding: '0.1em 0.35em' }}>✓</div>
                  )}
                </div>
              ))}
            </Carousel>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.75rem' }}>
              <button onClick={shuffleFeed}
                style={{ background: 'none', border: 'none', fontSize: '0.78rem', color: 'var(--rt-t3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
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
function BookModal({ book, added, onClose, onAddToTBR, onRecommend, onChat, onDismiss }) {
  const [desc, setDesc]           = useState('')
  const [descLoading, setDescLoading] = useState(true)

  useEffect(() => {
    setDesc(''); setDescLoading(true)
    let cancelled = false
    async function load() {
      try {
        let olKey = book.olKey
        if (!olKey) {
          const doc = await searchOL(book.title, book.author, 'key,cover_i')
          olKey = doc?.key || null
          // Also grab cover if missing
          if (doc?.cover_i && !book.coverId) {
            // bubble up cover via state if we can — handled by parent
          }
        }
        if (!olKey) { if (!cancelled) setDescLoading(false); return }
        const r = await fetch(`https://openlibrary.org${olKey}.json`)
        const d = await r.json()
        let description = d.description
          ? (typeof d.description === 'string' ? d.description : d.description.value || '')
          : ''
        description = description.replace(/\r\n/g, '\n').replace(/\[.*?\]\(.*?\)/g, '').replace(/----------\n.*/s, '').trim()
        if (!cancelled) setDesc(description)
      } catch {}
      if (!cancelled) setDescLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [book.olKey, book.title])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} className="rt-modal-backdrop" onClick={onClose}>
      <style>{`@media (min-width: 768px) { .rt-modal-backdrop { align-items: center !important; } .rt-modal-sheet { border-radius: 16px !important; max-height: 80vh !important; } }`}</style>
      <div className="rt-modal-sheet" style={{ background: 'var(--rt-white)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>

        {/* Navy header */}
        <div style={{ background: 'linear-gradient(160deg, #111C35 0%, var(--rt-navy) 100%)', padding: '1.25rem', display: 'flex', gap: '1rem', alignItems: 'flex-start', flexShrink: 0 }}>
          <div style={{ width: 72, height: 104, borderRadius: 8, overflow: 'hidden', background: 'rgba(255,255,255,0.08)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 12px rgba(0,0,0,0.3)' }}>
            {book.coverId
              ? <img src={`https://covers.openlibrary.org/b/id/${book.coverId}-M.jpg`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
              : book.olKey
              ? <img src={`https://covers.openlibrary.org/b/olid/${book.olKey.replace('/works/', '')}-M.jpg`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" onError={e => e.target.style.display='none'} />
              : <span style={{ fontSize: '2rem', opacity: 0.4 }}>📚</span>
            }
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.1rem', fontWeight: 700, color: '#fff', lineHeight: 1.25, marginBottom: '0.25rem' }}>{book.title}</div>
            {book.author && <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.55)' }}>by {book.author}</div>}
            {book.fromFriend && <div style={{ fontSize: '0.72rem', color: 'var(--rt-amber)', marginTop: '0.4rem', fontWeight: 600 }}>Recommended by {book.fromFriend}</div>}
            {book.why && <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', fontStyle: 'italic', marginTop: '0.4rem', lineHeight: 1.4 }}>{book.why}</div>}
            {book._editorial && <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.4rem', background: 'var(--rt-amber)', color: '#fff', borderRadius: 4, fontSize: '0.6rem', fontWeight: 700, padding: '0.15em 0.5em', letterSpacing: '0.05em' }}>LITLOOP PICK</div>}
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', color: '#fff', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: '1.25rem', overflowY: 'auto', flex: 1 }}>
          {/* Editorial note */}
          {book.editorNote && (
            <div style={{ marginBottom: '1rem', borderLeft: '3px solid var(--rt-amber)', paddingLeft: '0.75rem' }}>
              <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-amber)', marginBottom: '0.25rem' }}>Editor's note</div>
              <p style={{ fontSize: '0.85rem', color: 'var(--rt-navy)', lineHeight: 1.6, margin: 0, fontStyle: 'italic' }}>{book.editorNote}</p>
            </div>
          )}
          {/* AI pick reason or friend message */}
          {book.desc && <p style={{ fontSize: '0.85rem', color: 'var(--rt-navy)', lineHeight: 1.6, margin: '0 0 1rem', fontStyle: 'italic', borderLeft: '3px solid var(--rt-amber)', paddingLeft: '0.75rem' }}>{book.desc}</p>}
          {book.message && <p style={{ fontSize: '0.85rem', color: 'var(--rt-t2)', fontStyle: 'italic', margin: '0 0 1rem' }}>"{book.message}"</p>}

          {/* OL description */}
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.4rem' }}>About this book</div>
            {descLoading
              ? <div style={{ color: 'var(--rt-t3)', fontSize: '0.82rem' }}>Loading…</div>
              : desc
              ? <p style={{ fontSize: '0.88rem', color: 'var(--rt-t2)', lineHeight: 1.65, margin: 0 }}>{desc.length > 500 ? desc.slice(0, 500) + '…' : desc}</p>
              : <p style={{ fontSize: '0.85rem', color: 'var(--rt-t3)', fontStyle: 'italic', margin: 0 }}>No description available.</p>
            }
          </div>

          {/* Recommenders list */}
          {book.recommenders?.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.4rem' }}>Recommended by</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {book.recommenders.map((r, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: avatarColour(r.userId || r.name), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                      {avatarInitial(r.name || '?')}
                    </div>
                    <span style={{ fontSize: '0.82rem', color: 'var(--rt-t2)', fontWeight: 600 }}>{r.name}</span>
                    {r.message && <span style={{ fontSize: '0.78rem', color: 'var(--rt-t3)', fontStyle: 'italic' }}>"{r.message}"</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.6rem' }}>
            {book._editorial && onDismiss && (
              <button onClick={() => { onDismiss(book.olKey); onClose() }}
                style={{ background: 'var(--rt-surface)', color: 'var(--rt-t3)', border: '1px solid var(--rt-border-md)', borderRadius: 12, padding: '0.85rem 1rem', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                Not for me
              </button>
            )}
            <button onClick={onAddToTBR} disabled={added}
              style={{ flex: 1, background: added ? 'var(--rt-surface)' : 'var(--rt-navy)', color: added ? 'var(--rt-t3)' : '#fff', border: 'none', borderRadius: 12, padding: '0.85rem 1rem', fontWeight: 700, fontSize: '0.9rem', cursor: added ? 'default' : 'pointer', transition: 'all 0.2s' }}>
              {added ? '✓ Added to To Read' : '+ Add to To Read'}
            </button>
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

  // Friends I've already recommended this book to
  const alreadySentTo = new Set(
    (recs || [])
      .filter(r => r.from_user_id === user?.id && (r.book_ol_key === book.olKey || r.book_title === book.title))
      .map(r => r.to_user_id)
  )
  // Friends who've finished this book (from feed events)
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
          <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--rt-navy)' }}>Recommend to a friend</div>
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
                const sel         = selected.has(f.userId)
                const sentAlready = alreadySentTo.has(f.userId)
                const hasRead     = alreadyReadBy.has(f.userId)
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
                      <button
                        onClick={e => { e.stopPropagation(); onStartChatWith?.(f.userId) }}
                        style={{ fontSize: '0.7rem', background: 'var(--rt-amber-pale)', color: 'var(--rt-amber)', border: 'none', borderRadius: 99, padding: '0.2rem 0.6rem', fontWeight: 700, cursor: 'pointer' }}
                      >💬 Chat about it</button>
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

// ── Lightweight chat picker for Discover ─────────────────────────
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

  // Show existing chats first
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 400, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--rt-white)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, padding: '1.25rem', maxHeight: '75vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--rt-navy)' }}>Chat about this book</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--rt-t3)' }}>×</button>
        </div>

        {bookChats.length > 0 && (
          <div style={{ marginBottom: '0.75rem' }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.4rem' }}>Existing chats</div>
            {bookChats.map(c => (
              <div key={c.id} onClick={() => { onOpenChatModal?.(c, book); onClose() }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.75rem', borderRadius: 'var(--rt-r3)', background: 'var(--rt-surface)', marginBottom: '0.4rem', cursor: 'pointer', border: '1px solid var(--rt-border)' }}>
                <span style={{ fontSize: '1.1rem' }}>💬</span>
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

export default function Discover({ onNavigate, onOpenChatModal }) {
  const { user }                               = useAuthContext()
  const { books, addBook, isDuplicate }        = useBooksContext()
  const { recs, friends, feed, dismissRec, acceptRecToTBR, sendRecommendation, preferredMoods } = useSocialContext()
  const { chats, startOrOpenChat }             = useChatContext()

  const {
    feed: editorialFeed,
    loading: editorialLoading,
    moods,
    activeMood,
    setActiveMood,
    dismissBook,
    shuffleFeed,
    getCoverForBook,
  } = useLitLoopPicks({ userId: user?.id, books, preferredMoods })

  const [aiState, setAiState]     = useState('idle')
  const [aiRecs, setAiRecs]       = useState([])
  const [aiCovers, setAiCovers]   = useState({})
  const [aiError, setAiError]     = useState(null)

  const [selectedBook, setSelectedBook]   = useState(null)
  const [showRecommend, setShowRecommend] = useState(false)
  const [showChatPicker, setShowChatPicker] = useState(false)
  const [addedKeys, setAddedKeys]         = useState(new Set())

  const pendingRecs = (recs || []).filter(r => r.status === 'pending')

  // Group pending recs by book (ol_key or title) so multiple recommenders collapse into one card
  const groupedRecs = Object.values(
    pendingRecs.reduce((acc, r) => {
      const key = r.book_ol_key || r.book_title
      if (!acc[key]) {
        acc[key] = {
          ...r,
          recommenders: [],
          _key: `fr-${key}`,
          _recs: []
        }
      }
      const name = r.profiles?.display_name || r.profiles?.username || 'A friend'
      acc[key].recommenders.push({ name, userId: r.from_user_id, message: r.message })
      acc[key]._recs.push(r)
      return acc
    }, {})
  )

  async function startRecs() {
    const readOrReading = books.filter(b => b.status === 'read' || b.status === 'reading')
    if (!readOrReading.length) {
      setAiError('Log some books first — Claude needs your reading history to make great picks!')
      setAiState('error'); return
    }
    setAiState('loading'); setAiError(null)
    try {
      const result = await fetchRecs(buildRecsPrompt(books))
      if (!Array.isArray(result) || !result.length) throw new Error('No recommendations returned.')
      setAiRecs(result); setAiState('done')
      // Fetch sequentially with delay to avoid OL rate limiting
      ;(async () => {
        for (let i = 0; i < result.length; i++) {
          const coverId = await fetchOLCover(result[i].title, result[i].author)
          if (coverId) setAiCovers(prev => ({ ...prev, [i]: coverId }))
          await new Promise(r => setTimeout(r, 300))
        }
      })()
    } catch (err) {
      setAiState('error'); setAiError(err.message)
    }
  }

  function addToTBR(book, key) {
    if (!isDuplicate(book.title, book.author)) {
      addBook({ title: book.title, author: book.author, status: 'tbr', coverId: book.coverId || null, olKey: book.olKey || null })
    }
    setAddedKeys(prev => new Set([...prev, key]))
    setTimeout(() => setSelectedBook(null), 900)
  }

  async function acceptFriendRec(r) {
    const key = `fr-${r.id}`
    await acceptRecToTBR(r.id, r.book_ol_key, r.book_title, r.book_author, r.cover_id, addBook, books)
    setAddedKeys(prev => new Set([...prev, key]))
    setTimeout(() => setSelectedBook(null), 900)
  }


  return (
    <div className="rt-page" style={{ maxWidth: 480, margin: '0 auto' }}>

      <h2 style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.6rem', fontWeight: 700, color: 'var(--rt-navy)', margin: '0 0 1.25rem' }}>
        Discover
      </h2>

      {/* ── Block 1: Friends' Picks ── */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.65rem' }}>
          <span>👥</span>
          <span style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1rem', fontWeight: 700, color: 'var(--rt-navy)' }}>
            Friends' Picks
          </span>
          {pendingRecs.length > 0 && (
            <span style={{ background: 'var(--rt-amber)', color: '#fff', borderRadius: 99, fontSize: '0.62rem', fontWeight: 700, padding: '0.1em 0.5em' }}>{pendingRecs.length}</span>
          )}
        </div>
        <div style={{ background: 'var(--rt-white)', borderRadius: 'var(--rt-r3)', border: '1px solid var(--rt-border)', boxShadow: 'var(--rt-s1)', padding: '1rem' }}>
          {!user ? (
            <div style={{ color: 'var(--rt-t3)', fontSize: '0.85rem' }}>Sign in to see friends' recommendations.</div>
          ) : pendingRecs.length === 0 ? (
            <div style={{ color: 'var(--rt-t3)', fontSize: '0.85rem' }}>No recommendations yet — add friends to get started.</div>
          ) : (
            <Carousel>
              {groupedRecs.map(g => (
                <div key={g._key} style={{ position: 'relative', flexShrink: 0 }}
                  onClick={() => { setShowRecommend(false); setShowChatPicker(false); setSelectedBook({ title: g.book_title, author: g.book_author, coverId: g.cover_id, olKey: g.book_ol_key, fromFriend: g.recommenders[0]?.name, message: g.recommenders[0]?.message, recommenders: g.recommenders, _key: g._key, _recs: g._recs, _rec: g._recs[0] }) }}>
                  <BookCard
                    title={g.book_title || 'Unknown'}
                    author={g.book_author || ''}
                    coverId={g.cover_id}
                    olKey={g.book_ol_key}
                    onClick={() => {}}
                  />
                  {g.recommenders.length > 1 && (
                    <div style={{ position: 'absolute', top: 4, right: 12, background: 'var(--rt-amber)', color: '#fff', borderRadius: 99, fontSize: '0.6rem', fontWeight: 700, padding: '0.15em 0.45em', minWidth: 18, textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.25)' }}>
                      {g.recommenders.length}
                    </div>
                  )}
                </div>
              ))}
            </Carousel>
          )}
        </div>
      </div>

      {/* ── Block 2: AI Picks ── */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.65rem' }}>
          <span>✦</span>
          <span style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1rem', fontWeight: 700, color: 'var(--rt-navy)' }}>AI Picks</span>
        </div>
        <div style={{ background: 'var(--rt-white)', borderRadius: 'var(--rt-r3)', border: '1px solid var(--rt-border)', boxShadow: 'var(--rt-s1)', padding: '1rem' }}>
          {aiState === 'idle' || aiState === 'error' ? (
            <div style={{ textAlign: 'center' }}>
              {aiError && <p style={{ fontSize: '0.8rem', color: '#991b1b', marginBottom: '0.75rem' }}>{aiError}</p>}
              <p style={{ fontSize: '0.83rem', color: 'var(--rt-t3)', marginBottom: '1rem', lineHeight: 1.5 }}>
                Claude analyses your reading history to find books you'll love.
              </p>
              <button className="rt-submit-btn" onClick={startRecs}>✦ Get recommendations</button>
            </div>
          ) : aiState === 'loading' ? (
            <div style={{ textAlign: 'center', padding: '1.25rem 0', color: 'var(--rt-t3)', fontSize: '0.9rem' }}>
              <div style={{ fontSize: '1.4rem', marginBottom: '0.5rem' }}>✦</div>
              Reading your history…
            </div>
          ) : (
            <>
              <Carousel>
                {aiRecs.map((rec, i) => (
                  <BookCard
                    key={i}
                    title={rec.title}
                    author={rec.author}
                    coverId={aiCovers[i] || null}
                    onClick={() => { setShowRecommend(false); setSelectedBook({ title: rec.title, author: rec.author, coverId: aiCovers[i] || null, why: rec.why, desc: rec.desc, _key: `ai-${i}` }) }}
                  />
                ))}
              </Carousel>
              <div style={{ textAlign: 'center', marginTop: '0.85rem' }}>
                <button onClick={() => { setAiState('idle'); setAiRecs([]); setAiCovers({}) }} style={{ background: 'none', border: 'none', fontSize: '0.78rem', color: 'var(--rt-t3)', cursor: 'pointer', textDecoration: 'underline' }}>
                  Refresh picks
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Block 3: LitLoop Picks ── */}
      <LitLoopPicksSection
        feed={editorialFeed}
        loading={editorialLoading}
        moods={moods}
        activeMood={activeMood}
        setActiveMood={setActiveMood}
        shuffleFeed={shuffleFeed}
        getCoverForBook={getCoverForBook}
        onSelect={book => {
          setShowRecommend(false); setShowChatPicker(false)
          const cover = getCoverForBook(book)
          setSelectedBook({
            title: book.title,
            author: book.author,
            coverId: cover || null,
            // Don't pass ol_key as olKey — let BookModal search OL fresh by title+author
            // so descriptions and covers are always correct
            olKey: null,
            editorNote: book.editor_note,
            _key: `ll-${book.ol_key}`,
            _dbOlKey: book.ol_key, // keep for dismissal tracking
            _editorial: true,
            _rawBook: book,
          })
        }}
        onDismiss={dismissBook}
        addedKeys={addedKeys}
      />

      {/* ── Book modal ── */}
      {selectedBook && !showRecommend && !showChatPicker && (
        <BookModal
          book={selectedBook}
          added={addedKeys.has(selectedBook._key)}
          onClose={() => setSelectedBook(null)}
          onAddToTBR={() => {
            if (selectedBook._recs?.length) {
              selectedBook._recs.forEach(r => acceptFriendRec(r))
            } else if (selectedBook._rec) {
              acceptFriendRec(selectedBook._rec)
            } else {
              addToTBR(selectedBook, selectedBook._key)
            }
          }}
          onRecommend={() => setShowRecommend(true)}
          onChat={() => setShowChatPicker(true)}
          onDismiss={selectedBook?._editorial ? (key => dismissBook(selectedBook._dbOlKey || key)) : null}
        />
      )}

      {/* ── Recommend modal ── */}
      {selectedBook && showRecommend && (
        <RecommendModal
          book={selectedBook}
          friends={friends}
          user={user}
          recs={recs}
          feed={feed}
          sendRecommendation={sendRecommendation}
          onClose={() => { setShowRecommend(false) }}
          onStartChatWith={() => { setShowRecommend(false); setShowChatPicker(true) }}
        />
      )}

      {/* ── Chat picker ── */}
      {selectedBook && showChatPicker && (
        <DiscoverChatPicker
          book={selectedBook}
          friends={friends}
          chats={chats}
          startOrOpenChat={startOrOpenChat}
          onOpenChatModal={onOpenChatModal}
          onClose={() => setShowChatPicker(false)}
        />
      )}
    </div>
  )
}