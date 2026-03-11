import { useState, useEffect } from 'react'
import { useBooksContext } from '../context/BooksContext'
import { useSocialContext } from '../context/SocialContext'
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

async function fetchOLCover(title, author) {
  try {
    const q = author ? `${title} ${author.split(',')[0]}` : title
    const res = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&fields=cover_i&limit=1`)
    const data = await res.json()
    return data.docs?.[0]?.cover_i || null
  } catch { return null }
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

// ── Book detail modal ─────────────────────────────────────────────
function BookModal({ book, added, onClose, onAddToTBR, onRecommend }) {
  const [desc, setDesc]           = useState('')
  const [descLoading, setDescLoading] = useState(true)

  useEffect(() => {
    setDesc(''); setDescLoading(true)
    let cancelled = false
    async function load() {
      try {
        let olKey = book.olKey
        if (!olKey) {
          const q = book.author ? `${book.title} ${book.author.split(',')[0]}` : book.title
          const r = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&fields=key&limit=1`)
          const d = await r.json()
          olKey = d.docs?.[0]?.key
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--rt-white)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>

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
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', color: '#fff', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: '1.25rem', overflowY: 'auto', flex: 1 }}>
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

          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <button onClick={onAddToTBR} disabled={added}
              style={{ flex: 1, background: added ? 'var(--rt-surface)' : 'var(--rt-navy)', color: added ? 'var(--rt-t3)' : '#fff', border: 'none', borderRadius: 12, padding: '0.85rem 1rem', fontWeight: 700, fontSize: '0.9rem', cursor: added ? 'default' : 'pointer', transition: 'all 0.2s' }}>
              {added ? '✓ Added to To Read' : '+ Add to To Read'}
            </button>
            <button onClick={onRecommend}
              style={{ background: 'var(--rt-amber-pale)', color: 'var(--rt-amber)', border: 'none', borderRadius: 12, padding: '0.85rem 1rem', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Recommend →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Friend picker / recommend modal ──────────────────────────────
function RecommendModal({ book, friends, user, sendRecommendation, onClose }) {
  const [selected, setSelected] = useState(new Set())
  const [note, setNote]         = useState('')
  const [sending, setSending]   = useState(false)
  const [sent, setSent]         = useState(false)

  function toggle(id) {
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
        <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--rt-navy)', marginBottom: '0.2rem' }}>Recommend to a friend</div>
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
            <textarea
              value={note} onChange={e => setNote(e.target.value)}
              placeholder="Add a note (optional)…"
              style={{ width: '100%', borderRadius: 'var(--rt-r3)', border: '1px solid var(--rt-border-md)', padding: '0.6rem 0.75rem', fontSize: '0.85rem', fontFamily: 'inherit', resize: 'none', marginBottom: '0.75rem', boxSizing: 'border-box', minHeight: 68 }}
            />
            <button
              onClick={handleSend} disabled={!selected.size || sending}
              style={{ width: '100%', background: selected.size ? 'var(--rt-navy)' : 'var(--rt-surface)', color: selected.size ? '#fff' : 'var(--rt-t3)', border: 'none', borderRadius: 'var(--rt-r3)', padding: '0.85rem', fontWeight: 700, fontSize: '0.9rem', cursor: selected.size ? 'pointer' : 'default' }}
            >
              {sending ? 'Sending…' : `Send to ${selected.size || ''} friend${selected.size !== 1 ? 's' : ''}`}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default function Discover({ onNavigate }) {
  const { user }                               = useAuthContext()
  const { books, addBook, isDuplicate }        = useBooksContext()
  const { recs, friends, dismissRec, acceptRecToTBR, sendRecommendation } = useSocialContext()

  const [aiState, setAiState]     = useState('idle')
  const [aiRecs, setAiRecs]       = useState([])
  const [aiCovers, setAiCovers]   = useState({})
  const [aiError, setAiError]     = useState(null)

  const [selectedBook, setSelectedBook]   = useState(null)
  const [showRecommend, setShowRecommend] = useState(false)
  const [addedKeys, setAddedKeys]         = useState(new Set())

  const pendingRecs = (recs || []).filter(r => r.status === 'pending')

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
      result.forEach((rec, i) => {
        fetchOLCover(rec.title, rec.author).then(coverId => {
          if (coverId) setAiCovers(prev => ({ ...prev, [i]: coverId }))
        })
      })
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

  // Placeholder LitLoop items
  const placeholders = ['Coming soon', 'Staff favourites', 'Trending this week', 'Award winners']

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
              {pendingRecs.map(r => {
                const name = r.profiles?.display_name || r.profiles?.username || 'A friend'
                return (
                  <BookCard
                    key={r.id}
                    title={r.book_title || 'Unknown'}
                    author={r.book_author || ''}
                    coverId={r.cover_id}
                    olKey={r.book_ol_key}
                    onClick={() => { setShowRecommend(false); setSelectedBook({ title: r.book_title, author: r.book_author, coverId: r.cover_id, olKey: r.book_ol_key, fromFriend: name, message: r.message, _key: `fr-${r.id}`, _rec: r }) }}
                  />
                )
              })}
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

      {/* ── Block 3: LitLoop Picks (placeholder) ── */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.65rem' }}>
          <span>📚</span>
          <span style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1rem', fontWeight: 700, color: 'var(--rt-navy)' }}>LitLoop Picks</span>
        </div>
        <div style={{ background: 'var(--rt-white)', borderRadius: 'var(--rt-r3)', border: '1px solid var(--rt-border)', boxShadow: 'var(--rt-s1)', padding: '1rem' }}>
          <Carousel>
            {placeholders.map((label, i) => (
              <div key={i} style={{ flexShrink: 0, width: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: 0.4 }}>
                <div style={{ width: 76, height: 110, borderRadius: 8, background: 'var(--rt-surface)', border: '2px dashed var(--rt-border-md)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: '1.8rem' }}>📚</span>
                </div>
                <div style={{ marginTop: '0.4rem', fontSize: '0.68rem', color: 'var(--rt-t3)', textAlign: 'center', lineHeight: 1.3 }}>{label}</div>
              </div>
            ))}
          </Carousel>
          <div style={{ marginTop: '0.75rem', fontSize: '0.78rem', color: 'var(--rt-t3)', textAlign: 'center' }}>Curated picks coming soon 🎉</div>
        </div>
      </div>

      {/* ── Book modal ── */}
      {selectedBook && !showRecommend && (
        <BookModal
          book={selectedBook}
          added={addedKeys.has(selectedBook._key)}
          onClose={() => setSelectedBook(null)}
          onAddToTBR={() => {
            if (selectedBook._rec) {
              acceptFriendRec(selectedBook._rec)
            } else {
              addToTBR(selectedBook, selectedBook._key)
            }
          }}
          onRecommend={() => setShowRecommend(true)}
        />
      )}

      {/* ── Recommend modal ── */}
      {selectedBook && showRecommend && (
        <RecommendModal
          book={selectedBook}
          friends={friends}
          user={user}
          sendRecommendation={sendRecommendation}
          onClose={() => { setShowRecommend(false); setSelectedBook(null) }}
        />
      )}
    </div>
  )
}