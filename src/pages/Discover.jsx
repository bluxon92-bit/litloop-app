import { useState } from 'react'
import { useBooksContext } from '../context/BooksContext'
import { useSocialContext } from '../context/SocialContext'
import { useAuthContext } from '../context/AuthContext'
import { avatarColour, avatarInitial } from '../lib/utils'
import CoverImage from '../components/books/CoverImage'

// Supabase config needed for edge function call
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
  const fmt  = b => `"${safe(b.title)}"${b.author ? ` by ${safe(b.author)}` : ''}${b.genre ? ` (${safe(b.genre)})` : ''}${b.rating ? ` ${b.rating}/5★` : ''}`
  return `You are a deeply well-read friend. Here is someone's reading history:

LOVED (4-5★):
${sample.map(fmt).join('\n') || 'None yet'}

CURRENTLY READING:
${reading.map(fmt).join('\n') || 'Nothing'}

DID NOT FINISH:
${dnf.map(b => `"${safe(b.title)}"${b.author ? ` by ${safe(b.author)}` : ''}`).join('\n') || 'None'}

WANTS TO READ:
${tbr.map(b => safe(b.title)).join(', ') || 'Empty'}

Genres they read: ${genres.map(safe).join(', ') || 'mixed'}. Total finished: ${read.length}.

Recommend exactly 4 books. Respond ONLY with valid JSON — no markdown, no preamble. Format:
[
  {
    "title": "Book Title",
    "author": "Author Name",
    "why": "One sentence referencing something they actually read",
    "desc": "One sentence on what makes this book special"
  }
]`
}

async function fetchRecs(prompt) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/recommendations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON}` },
      body: JSON.stringify({ prompt }),
      signal: controller.signal
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const text = data.text || data.content?.find(c => c.type === 'text')?.text || ''
    if (!text) throw new Error('empty response')
    const clean = text.replace(/```json|```/g, '').trim()
    return JSON.parse(clean)
  } catch(e) {
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

export default function Discover() {
  const { user } = useAuthContext()
  const { books, addBook, isDuplicate } = useBooksContext()
  const { recs, dismissRec, acceptRecToTBR } = useSocialContext()

  // AI recs state
  const [aiState, setAiState]       = useState('idle') // idle | loading | cards | done | error
  const [recQueue, setRecQueue]      = useState([])
  const [recIdx, setRecIdx]          = useState(0)
  const [recCovers, setRecCovers]    = useState({})
  const [addedIdxs, setAddedIdxs]   = useState(new Set())
  const [aiError, setAiError]        = useState(null)

  // Friend recs sub-tab
  const [discoverTab, setDiscoverTab] = useState('ai') // ai | friends

  const pendingRecs = recs.filter(r => r.status === 'pending')

  async function startRecs() {
    const readOrReading = books.filter(b => b.status === 'read' || b.status === 'reading')
    if (!readOrReading.length) {
      setAiError('Log some books first — Claude needs your reading history to make good recommendations!')
      return
    }
    setAiState('loading')
    setAiError(null)
    setAddedIdxs(new Set())
    try {
      const result = await fetchRecs(buildRecsPrompt(books))
      if (!Array.isArray(result) || result.length === 0) throw new Error('No recommendations returned.')
      setRecQueue(result)
      setRecIdx(0)
      setAiState('cards')
      // Fetch covers in background
      result.forEach((rec, i) => {
        fetchOLCover(rec.title, rec.author).then(coverId => {
          if (coverId) setRecCovers(prev => ({ ...prev, [i]: coverId }))
        })
      })
    } catch(err) {
      setAiState('error')
      setAiError(err.message)
    }
  }

  function addRecAndNext(idx) {
    const rec = recQueue[idx]
    if (!isDuplicate(rec.title, rec.author)) {
      addBook({ title: rec.title, author: rec.author, status: 'tbr', coverId: recCovers[idx] || null })
    }
    setAddedIdxs(prev => new Set([...prev, idx]))
    setTimeout(() => {
      const next = idx + 1
      if (next >= recQueue.length) setAiState('done')
      else setRecIdx(next)
    }, 800)
  }

  function skipRec(idx) {
    const next = idx + 1
    if (next >= recQueue.length) setAiState('done')
    else setRecIdx(next)
  }

  async function handleAcceptRec(r) {
    await acceptRecToTBR(r.id, r.book_ol_key, r.book_title, r.book_author, r.cover_id, addBook, books)
  }

  const currentRec = recQueue[recIdx]

  return (
    <div style={{ padding: '1.5rem', maxWidth: 720, margin: '0 auto' }}>
      <h2 style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.6rem', fontWeight: 700, color: 'var(--rt-navy)', margin: '0 0 1.5rem' }}>Discover</h2>

      {/* Sub-tabs */}
      <div className="rt-status-tabs" style={{ marginBottom: '1.5rem' }}>
        <button
          className={`rt-status-tab${discoverTab === 'ai' ? ' active' : ''}`}
          onClick={() => setDiscoverTab('ai')}
        >
          ✦ AI Picks
        </button>
        <button
          className={`rt-status-tab${discoverTab === 'friends' ? ' active' : ''}`}
          onClick={() => setDiscoverTab('friends')}
        >
          Friends' Recs
          {pendingRecs.length > 0 && (
            <span style={{ marginLeft: '0.4rem', background: 'var(--rt-amber)', color: 'white', borderRadius: '99px', fontSize: '0.6rem', padding: '0.1em 0.45em', fontWeight: 700 }}>
              {pendingRecs.length}
            </span>
          )}
        </button>
      </div>

      {/* ── AI Recommendations tab ── */}
      {discoverTab === 'ai' && (
        <div>
          {/* Idle / error state */}
          {(aiState === 'idle' || aiState === 'error') && (
            <div className="rt-card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>✦</div>
              <h3 style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.15rem', fontWeight: 700, color: 'var(--rt-navy)', marginBottom: '0.5rem' }}>
                Personalised book recommendations
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--rt-t3)', marginBottom: '1.5rem', maxWidth: 340, margin: '0 auto 1.5rem' }}>
                Claude analyses your reading history to find books you'll love.
              </p>
              {aiError && (
                <p style={{ fontSize: '0.82rem', color: '#991b1b', marginBottom: '1rem' }}>{aiError}</p>
              )}
              <button className="rt-submit-btn" onClick={startRecs}>
                ✦ Get recommendations
              </button>
            </div>
          )}

          {/* Loading */}
          {aiState === 'loading' && (
            <div className="rt-card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>✦</div>
              <p style={{ color: 'var(--rt-t3)', fontSize: '0.9rem' }}>Finding your books…</p>
            </div>
          )}

          {/* Rec cards */}
          {aiState === 'cards' && currentRec && (
            <div>
              {/* Progress dots */}
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
                {recQueue.map((_, i) => (
                  <div key={i} style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: i <= recIdx ? 'var(--rt-amber)' : 'var(--rt-border-md)',
                    transition: 'background 0.2s'
                  }}/>
                ))}
                <span style={{ fontSize: '0.72rem', color: 'var(--rt-t3)', marginLeft: '0.4rem' }}>{recIdx + 1} of {recQueue.length}</span>
              </div>

              <div className="rt-rec-card">
                <div className="rt-rec-card-top">
                  {recCovers[recIdx]
                    ? <img src={`https://covers.openlibrary.org/b/id/${recCovers[recIdx]}-M.jpg`} className="rt-rec-cover" alt={currentRec.title} />
                    : <div className="rt-rec-cover--placeholder">📚</div>
                  }
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="rt-rec-why">Why you'll love it</div>
                    <div className="rt-rec-title">{currentRec.title}</div>
                    <div className="rt-rec-author">by {currentRec.author || ''}</div>
                    <div className="rt-rec-quote">{currentRec.why || ''}</div>
                  </div>
                </div>
                <div className="rt-rec-card-body">
                  <p className="rt-rec-desc">{currentRec.desc || ''}</p>
                  <div className="rt-rec-actions">
                    <button
                      className="rt-rec-add-btn"
                      disabled={addedIdxs.has(recIdx)}
                      onClick={() => addRecAndNext(recIdx)}
                    >
                      {addedIdxs.has(recIdx) ? '✓ Added' : '+ Add to My List'}
                    </button>
                    <button className="rt-rec-dismiss-btn" onClick={() => skipRec(recIdx)}>
                      Skip →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Done */}
          {aiState === 'done' && (
            <div className="rt-card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🎉</div>
              <h3 style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--rt-navy)', marginBottom: '0.5rem' }}>
                That's your picks!
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--rt-t3)', marginBottom: '1.5rem' }}>
                Check your To Read list for anything you added.
              </p>
              <button
                className="rt-submit-btn"
                onClick={() => { setAiState('idle'); setAiError(null) }}
              >
                ✦ Get 4 more recommendations
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Friends' Recommendations tab ── */}
      {discoverTab === 'friends' && (
        <div>
          {!user ? (
            <div className="rt-feed-empty">
              <div className="rt-feed-empty-icon">🔒</div>
              <p>Sign in to see recommendations from friends.</p>
            </div>
          ) : pendingRecs.length === 0 ? (
            <div className="rt-feed-empty">
              <div className="rt-feed-empty-icon">📬</div>
              <p>No recommendations yet. Add friends to start sharing books!</p>
            </div>
          ) : (
            pendingRecs.map(r => {
              const name   = r.profiles?.display_name || r.profiles?.username || 'A friend'
              const colour = avatarColour(r.from_user_id)
              const init   = avatarInitial(name)
              return (
                <div key={r.id} className="rt-card" style={{ marginBottom: '0.75rem' }}>
                  <div className="rt-profile-review-item" style={{ marginBottom: '0.75rem' }}>
                    <div className="rt-profile-review-cover">
                      {r.cover_id
                        ? <img src={`https://covers.openlibrary.org/b/id/${r.cover_id}-S.jpg`} alt="" loading="lazy" onError={e => e.target.parentElement.innerHTML='📚'} />
                        : '📚'}
                    </div>
                    <div className="rt-profile-review-body-wrap">
                      <div className="rt-profile-review-title">{r.book_title || 'Unknown book'}</div>
                      {r.book_author && <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)', marginBottom: 3 }}>{r.book_author}</div>}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: 2 }}>
                        <div style={{ width: 14, height: 14, borderRadius: '50%', background: colour, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.48rem', fontWeight: 700, color: '#fff', flexShrink: 0 }}>{init}</div>
                        <span style={{ fontSize: '0.72rem', color: 'var(--rt-t3)' }}>from {name}</span>
                      </div>
                      {r.message && <div style={{ fontSize: '0.72rem', color: 'var(--rt-t2)', fontStyle: 'italic', marginTop: 3 }}>"{r.message.slice(0, 80)}{r.message.length > 80 ? '…' : ''}"</div>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      className="rt-submit-btn"
                      style={{ flex: 1, fontSize: '0.82rem', padding: '0.55rem' }}
                      onClick={() => handleAcceptRec(r)}
                    >
                      + Add to My List
                    </button>
                    <button
                      style={{ padding: '0.55rem 0.85rem', background: 'none', border: '1px solid var(--rt-border-md)', borderRadius: 'var(--rt-r3)', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--rt-t3)' }}
                      onClick={() => dismissRec(r.id)}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
