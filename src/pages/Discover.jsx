import { useState } from 'react'
import { useBooksContext } from '../context/BooksContext'
import { useSocialContext } from '../context/SocialContext'
import { useAuthContext } from '../context/AuthContext'
import { avatarColour, avatarInitial } from '../lib/utils'
import CoverImage from '../components/books/CoverImage'

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

// ── Progress bar (matches screenshot) ──────────────────────────
function ProgressBar({ total, current }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.1rem' }}>
      <div style={{ flex: 1, display: 'flex', gap: '0.35rem' }}>
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} style={{
            flex: 1, height: 5, borderRadius: 99,
            background: i === current ? 'var(--rt-navy)' : 'var(--rt-border-md)',
            transition: 'background 0.25s',
          }}/>
        ))}
      </div>
      <span style={{ fontSize: '0.72rem', color: 'var(--rt-t3)', flexShrink: 0, fontWeight: 500 }}>
        {current + 1} of {total}
      </span>
    </div>
  )
}

export default function Discover({ onNavigate }) {
  const { user }   = useAuthContext()
  const { books, addBook, isDuplicate } = useBooksContext()
  const { recs, dismissRec, acceptRecToTBR } = useSocialContext()

  const [aiState, setAiState]     = useState('idle')
  const [recQueue, setRecQueue]   = useState([])
  const [recIdx, setRecIdx]       = useState(0)
  const [recCovers, setRecCovers] = useState({})
  const [addedIdxs, setAddedIdxs] = useState(new Set())
  const [aiError, setAiError]     = useState(null)
  const [discoverTab, setDiscoverTab] = useState('ai')

  const pendingRecs = recs.filter(r => r.status === 'pending')

  async function startRecs() {
    const readOrReading = books.filter(b => b.status === 'read' || b.status === 'reading')
    if (!readOrReading.length) {
      setAiError('Log some books first — Claude needs your reading history to make great picks!')
      return
    }
    setAiState('loading'); setAiError(null); setAddedIdxs(new Set())
    try {
      const result = await fetchRecs(buildRecsPrompt(books))
      if (!Array.isArray(result) || result.length === 0) throw new Error('No recommendations returned.')
      setRecQueue(result); setRecIdx(0); setAiState('cards')
      result.forEach((rec, i) => {
        fetchOLCover(rec.title, rec.author).then(coverId => {
          if (coverId) setRecCovers(prev => ({ ...prev, [i]: coverId }))
        })
      })
    } catch(err) {
      setAiState('error'); setAiError(err.message)
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
    }, 600)
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
      <h2 style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.6rem', fontWeight: 700, color: 'var(--rt-navy)', margin: '0 0 1.25rem' }}>
        Find your next great read
      </h2>

      {/* ── Full-width tabs ── */}
      <div style={{ display: 'flex', borderBottom: '2px solid var(--rt-border)', marginBottom: '1.5rem' }}>
        {[
          ['ai', '✦ AI Picks', 0],
          ['friends', "Friends' Recs", pendingRecs.length],
        ].map(([id, label, count]) => (
          <button key={id} onClick={() => setDiscoverTab(id)}
            style={{
              flex: 1, fontFamily: 'var(--rt-font-body)', fontSize: '0.88rem',
              fontWeight: discoverTab === id ? 700 : 500,
              color: discoverTab === id ? 'var(--rt-navy)' : 'var(--rt-t3)',
              background: 'none', border: 'none',
              borderBottom: `2.5px solid ${discoverTab === id ? 'var(--rt-amber)' : 'transparent'}`,
              marginBottom: -2, padding: '0.6rem 0.5rem',
              cursor: 'pointer', transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
            }}>
            {label}
            {count > 0 && (
              <span style={{ background: discoverTab === id ? 'var(--rt-amber)' : 'var(--rt-border-md)', color: discoverTab === id ? '#fff' : 'var(--rt-t3)', borderRadius: 99, fontSize: '0.62rem', fontWeight: 700, padding: '0.1em 0.5em', lineHeight: '1.6' }}>{count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── AI Picks ── */}
      {discoverTab === 'ai' && (
        <div>
          {/* Idle / error */}
          {(aiState === 'idle' || aiState === 'error') && (
            <div className="rt-card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
              <div style={{ fontSize: '2.2rem', marginBottom: '0.85rem' }}>✦</div>
              <h3 style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.15rem', fontWeight: 700, color: 'var(--rt-navy)', marginBottom: '0.5rem' }}>
                Personalised book recommendations
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--rt-t3)', marginBottom: '1.5rem', maxWidth: 340, margin: '0 auto 1.5rem' }}>
                Claude analyses your full reading history to find books you'll love.
              </p>
              {aiError && <p style={{ fontSize: '0.82rem', color: '#991b1b', marginBottom: '1rem' }}>{aiError}</p>}
              <button className="rt-submit-btn" onClick={startRecs}>✦ Get recommendations</button>
            </div>
          )}

          {/* Loading */}
          {aiState === 'loading' && (
            <div className="rt-card" style={{ textAlign: 'center', padding: '3.5rem 1.5rem' }}>
              <div style={{ fontSize: '1.8rem', marginBottom: '1rem', animation: 'pulse 1.5s ease infinite' }}>✦</div>
              <p style={{ color: 'var(--rt-t3)', fontSize: '0.9rem' }}>Reading your history…</p>
            </div>
          )}

          {/* ── CARD — screenshot style ── */}
          {aiState === 'cards' && currentRec && (
            <div>
              <ProgressBar total={recQueue.length} current={recIdx} />

              {/* Card */}
              <div style={{
                borderRadius: 16, overflow: 'hidden',
                boxShadow: '0 4px 24px rgba(26,39,68,0.12)',
                background: 'var(--rt-white)',
              }}>
                {/* Navy top section */}
                <div style={{
                  background: 'linear-gradient(160deg, #111C35 0%, var(--rt-navy) 100%)',
                  padding: '1.25rem',
                  display: 'flex', gap: '1rem', alignItems: 'flex-start',
                }}>
                  {/* Cover */}
                  <div style={{ flexShrink: 0, width: 90, height: 130, borderRadius: 8, overflow: 'hidden', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(0,0,0,0.35)' }}>
                    {recCovers[recIdx]
                      ? <img src={`https://covers.openlibrary.org/b/id/${recCovers[recIdx]}-M.jpg`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={currentRec.title} />
                      : <span style={{ fontSize: '2rem', opacity: 0.5 }}>📚</span>
                    }
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--rt-amber)', marginBottom: '0.4rem' }}>
                      Why you'll love it
                    </div>
                    <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.2rem', fontWeight: 700, color: '#fff', lineHeight: 1.2, marginBottom: '0.3rem' }}>
                      {currentRec.title}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.55)', marginBottom: '0.65rem' }}>
                      by {currentRec.author || ''}
                    </div>
                    {currentRec.why && (
                      <div style={{ fontSize: '0.83rem', color: 'rgba(255,255,255,0.5)', fontStyle: 'italic', lineHeight: 1.5 }}>
                        {currentRec.why}
                      </div>
                    )}
                  </div>
                </div>

                {/* White bottom section */}
                <div style={{ padding: '1.25rem' }}>
                  {currentRec.desc && (
                    <p style={{ fontSize: '1rem', color: 'var(--rt-navy)', lineHeight: 1.6, margin: '0 0 1.25rem', fontWeight: 400 }}>
                      {currentRec.desc}
                    </p>
                  )}

                  {/* Buttons */}
                  <div style={{ display: 'flex', gap: '0.6rem' }}>
                    <button
                      onClick={() => addRecAndNext(recIdx)}
                      disabled={addedIdxs.has(recIdx)}
                      style={{
                        flex: 1, background: addedIdxs.has(recIdx) ? 'var(--rt-surface)' : 'var(--rt-navy)',
                        color: addedIdxs.has(recIdx) ? 'var(--rt-t3)' : '#fff',
                        border: 'none', borderRadius: 12, padding: '0.9rem 1rem',
                        fontFamily: 'var(--rt-font-body)', fontSize: '0.92rem', fontWeight: 700,
                        cursor: addedIdxs.has(recIdx) ? 'default' : 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      {addedIdxs.has(recIdx) ? '✓ Added' : '+ Add to My List'}
                    </button>
                    <button
                      onClick={() => skipRec(recIdx)}
                      style={{
                        background: 'rgba(153,27,27,0.07)', color: '#991b1b',
                        border: 'none', borderRadius: 12, padding: '0.9rem 1.1rem',
                        fontFamily: 'var(--rt-font-body)', fontSize: '0.92rem', fontWeight: 700,
                        cursor: 'pointer', whiteSpace: 'nowrap',
                      }}
                    >
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
              <button className="rt-submit-btn" onClick={() => { setAiState('idle'); setAiError(null) }}>
                ✦ Get 4 more recommendations
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Friends' Recs ── */}
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
                  <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'flex-start', marginBottom: '0.85rem' }}>
                    <div style={{ flexShrink: 0, width: 52, height: 74, borderRadius: 6, overflow: 'hidden', background: 'var(--rt-surface)' }}>
                      {r.cover_id
                        ? <img src={`https://covers.openlibrary.org/b/id/${r.cover_id}-S.jpg`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" onError={e => e.target.style.display='none'} />
                        : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>📚</div>
                      }
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.92rem', fontWeight: 700, color: 'var(--rt-navy)', marginBottom: '0.2rem' }}>{r.book_title || 'Unknown book'}</div>
                      {r.book_author && <div style={{ fontSize: '0.75rem', color: 'var(--rt-t3)', marginBottom: '0.35rem' }}>{r.book_author}</div>}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <div style={{ width: 16, height: 16, borderRadius: '50%', background: colour, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.5rem', fontWeight: 700, color: '#fff', flexShrink: 0 }}>{init}</div>
                        <span style={{ fontSize: '0.72rem', color: 'var(--rt-t3)' }}>from {name}</span>
                      </div>
                      {r.message && <div style={{ fontSize: '0.75rem', color: 'var(--rt-t2)', fontStyle: 'italic', marginTop: '0.3rem' }}>"{r.message.slice(0, 80)}{r.message.length > 80 ? '…' : ''}"</div>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="rt-submit-btn" style={{ flex: 1, fontSize: '0.85rem', padding: '0.6rem' }} onClick={() => handleAcceptRec(r)}>
                      + Add to My List
                    </button>
                    <button onClick={() => dismissRec(r.id)}
                      style={{ padding: '0.6rem 0.85rem', background: 'none', border: '1px solid var(--rt-border-md)', borderRadius: 'var(--rt-r3)', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--rt-t3)' }}>
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
