import { useState, useEffect } from 'react'
import { ModalShell } from './BookSheet'

const CACHE_KEY = 'litloop_book_desc_v1'

function descCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') } catch { return {} }
}
function descCacheSet(olKey, data) {
  try {
    const c = descCache()
    c[olKey] = { ...data, _ts: Date.now() }
    const keys = Object.keys(c)
    if (keys.length > 100) {
      keys.sort((a, b) => (c[a]._ts || 0) - (c[b]._ts || 0))
        .slice(0, keys.length - 100)
        .forEach(k => delete c[k])
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(c))
  } catch {}
}

async function fetchOLDetail(book) {
  let olKey = book.olKey
  if (!olKey) {
    const q = book.author ? `${book.title} ${book.author.split(',')[0]}` : book.title
    const res  = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&fields=key,title,author_name,first_publish_year,subject&limit=1`)
    const data = await res.json()
    const doc  = data.docs?.[0]
    if (doc) olKey = doc.key
  }
  if (!olKey) return null

  const cached = descCache()[olKey]
  if (cached) return cached

  const workRes  = await fetch(`https://openlibrary.org${olKey}.json`)
  const workData = await workRes.json()

  let description = ''
  if (workData.description) {
    description = typeof workData.description === 'string'
      ? workData.description
      : workData.description.value || ''
  }
  description = description
    .replace(/\r\n/g, '\n')
    .replace(/\[.*?\]\(.*?\)/g, '')
    .replace(/----------\n.*/s, '')
    .trim()

  const result = {
    description,
    year:     workData.first_publish_date || '',
    subjects: (workData.subjects || []).filter(s => s.length < 40).slice(0, 8)
  }
  descCacheSet(olKey, result)
  return result
}

// ── Pencil edit icon ──────────────────────────────────────────
function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  )
}

// ── Stars display ─────────────────────────────────────────────
function Stars({ value }) {
  if (!value) return null
  return <span style={{ fontSize: '1.3rem', color: 'var(--rt-amber)', letterSpacing: '1px', lineHeight: 1 }}>{'★'.repeat(value)}{'☆'.repeat(5 - value)}</span>
}

export default function BookDetailPanel({
  book,
  location,
  onClose,
  onMarkFinished,
  onStartReading,
  onRecommend,
  onStartChat,
  onViewChat,
  onAddToTBR,
  onEdit,
  existingChatId,
  user,
  onOpenChatModal,
  friendName,
}) {
  const [olData, setOlData]     = useState(null)
  const [loading, setLoading]   = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    setLoading(true); setOlData(null); setExpanded(false)
    fetchOLDetail(book)
      .then(d => { setOlData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [book?.id, book?.olKey])

  const description = olData?.description || ''
  const LIMIT       = 400
  const truncated   = !expanded && description.length > LIMIT
  const shownDesc   = truncated ? description.slice(0, LIMIT) + '…' : description

  const statusBadges = {
    reading: '📖 Currently reading',
    read:    '✓ Read',
    tbr:     '🔖 On your list',
    dnf:     'Did not finish'
  }

  const isHistory = location === 'mylist-history' || location === 'mylist-dnf'
  const isTBR     = location === 'mylist-tbr'
  const isReading = location === 'mylist-reading' || location === 'home-reading'
  const hasChat   = !!existingChatId

  return (
    <ModalShell onClose={onClose} maxWidth={600}>

      {/* ── Navy hero ── */}
      <div style={{ background: 'linear-gradient(160deg, var(--rt-navy) 0%, #2A4A6B 100%)', padding: '1.5rem 1.25rem 1.25rem', position: 'relative', flexShrink: 0 }}>
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: '0.85rem', right: '0.85rem', background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', fontSize: '1rem' }}
        >×</button>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
          <div style={{ flexShrink: 0 }}>
            {book.coverId
              ? <img src={`https://covers.openlibrary.org/b/id/${book.coverId}-M.jpg`}
                  style={{ width: 80, height: 116, borderRadius: 8, objectFit: 'cover', boxShadow: '0 4px 16px rgba(0,0,0,0.35)' }} alt={book.title} />
              : book.olKey
                ? <img src={`https://covers.openlibrary.org/b/olid/${book.olKey.replace('/works/','')}-M.jpg`}
                    style={{ width: 80, height: 116, borderRadius: 8, objectFit: 'cover', boxShadow: '0 4px 16px rgba(0,0,0,0.35)' }} alt={book.title}
                    onError={e => e.target.style.display='none'} />
                : <div style={{ width: 80, height: 116, borderRadius: 8, background: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>📚</div>
            }
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.1rem', fontWeight: 700, color: '#fff', lineHeight: 1.3, marginBottom: '0.3rem' }}>{book.title}</div>
            {book.author && <div style={{ fontSize: '0.83rem', color: 'rgba(255,255,255,0.6)', marginBottom: '0.5rem' }}>by {book.author}</div>}
            {olData?.year && <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', marginBottom: '0.4rem' }}>First published {olData.year}</div>}
            {book.status && (
              <span style={{ display: 'inline-block', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)', padding: '0.2em 0.6em', borderRadius: '99px' }}>
                {statusBadges[book.status] || book.status}
              </span>
            )}
          </div>
        </div>

        {/* Stars in hero if read */}
        {book.rating > 0 && (
          <div style={{ marginTop: '0.85rem' }}>
            <Stars value={book.rating} />
          </div>
        )}
      </div>

      {/* ── Scrollable body ── */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '1.1rem 1.25rem' }}>

        {/* FRIEND REVIEW — shown when opened from feed */}
        {(friendName || book.friendName) && (book.rating || book.reviewBody) && (
          <div style={{ marginBottom: '1.1rem', padding: '0.85rem 1rem', background: '#F5F0E8', borderRadius: 'var(--rt-r3)', border: '1px solid var(--rt-border)' }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.45rem' }}>
              {friendName || book.friendName}'s review
            </div>
            {book.rating > 0 && <div style={{ marginBottom: '0.45rem' }}><Stars value={book.rating} /></div>}
            {book.reviewBody && (
              <div style={{ fontSize: '0.88rem', color: 'var(--rt-t2)', lineHeight: 1.6, fontStyle: 'italic', borderLeft: '3px solid var(--rt-border-md)', paddingLeft: '0.75rem' }}>
                {book.reviewBody}
              </div>
            )}
          </div>
        )}

        {/* MY REVIEW — shown for history/dnf at top, with edit pencil */}
        {isHistory && (book.rating || book.reviewBody) && (
          <div style={{ marginBottom: '1.1rem', padding: '0.85rem 1rem', background: 'var(--rt-cream)', borderRadius: 'var(--rt-r3)', border: '1px solid var(--rt-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)' }}>My review</div>
              <button
                onClick={() => { onClose(); onEdit?.() }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--rt-t3)', fontSize: '0.72rem', padding: '0.1rem 0.25rem', borderRadius: 4 }}
                title="Edit review"
              >
                <PencilIcon /> Edit
              </button>
            </div>
            {book.rating > 0 && <div style={{ marginBottom: '0.45rem' }}><Stars value={book.rating} /></div>}
            {book.reviewBody && (
              <div style={{ borderLeft: '3px solid var(--rt-border-md)', paddingLeft: '0.75rem' }}>
                <div style={{ fontSize: '0.88rem', color: 'var(--rt-t2)', lineHeight: 1.6, fontStyle: 'italic' }}>{book.reviewBody}</div>
              </div>
            )}
          </div>
        )}

        {/* ABOUT THIS BOOK */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.4rem' }}>About this book</div>
          {loading ? (
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', color: 'var(--rt-t3)', fontSize: '0.82rem' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--rt-border-md)', animation: 'pulse 1.2s ease infinite' }}/>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--rt-border-md)', animation: 'pulse 1.2s ease infinite 0.2s' }}/>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--rt-border-md)', animation: 'pulse 1.2s ease infinite 0.4s' }}/>
              <span style={{ marginLeft: 4 }}>Loading…</span>
            </div>
          ) : description ? (
            <>
              <p style={{ fontSize: '0.88rem', color: 'var(--rt-t2)', lineHeight: 1.65, margin: 0 }}>{shownDesc}</p>
              {truncated && (
                <button onClick={() => setExpanded(true)} style={{ background: 'none', border: 'none', color: 'var(--rt-amber)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', padding: '0.35rem 0 0' }}>
                  Read more ↓
                </button>
              )}
            </>
          ) : (
            <p style={{ fontSize: '0.85rem', color: 'var(--rt-t3)', fontStyle: 'italic', margin: 0 }}>No description available.</p>
          )}
        </div>

        {/* SUBJECTS */}
        {olData?.subjects?.length > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.4rem' }}>Subjects</div>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {olData.subjects.map(s => (
                <span key={s} style={{ fontSize: '0.72rem', padding: '0.2em 0.6em', background: 'var(--rt-surface)', border: '1px solid var(--rt-border)', borderRadius: '99px', color: 'var(--rt-t2)' }}>{s}</span>
              ))}
            </div>
          </div>
        )}

        {/* Private notes (not shown in review section above) */}
        {book.notes && (
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.3rem' }}>🔒 Private notes</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--rt-t2)', lineHeight: 1.55, fontStyle: 'italic' }}>{book.notes}</div>
          </div>
        )}
      </div>

      {/* ── Footer actions ── */}
      <div style={{ padding: '0.85rem 1.25rem', borderTop: '1px solid var(--rt-border)', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', flexShrink: 0 }}>

        {/* TBR */}
        {isTBR && <>
          <button className="rt-bdp-btn rt-bdp-btn--primary" style={{ flex: 1 }}
            onClick={() => { onClose(); onStartReading?.() }}>📖 Start reading</button>
          {user && <button className="rt-bdp-btn rt-bdp-btn--amber" style={{ flex: 1 }}
            onClick={() => { onClose(); onRecommend?.() }}>📚 Recommend</button>}
        </>}

        {/* Currently reading */}
        {isReading && <>
          <button className="rt-bdp-btn rt-bdp-btn--primary" style={{ flex: 1 }}
            onClick={() => { onClose(); onMarkFinished?.() }}>✓ Mark finished</button>
          {user && <button className="rt-bdp-btn rt-bdp-btn--amber" style={{ flex: 1 }}
            onClick={() => { onClose(); onRecommend?.() }}>📚 Recommend</button>}
        </>}

        {/* History / DNF */}
        {isHistory && <>
          {user && <button className="rt-bdp-btn rt-bdp-btn--amber" style={{ flex: 1 }}
            onClick={() => { onClose(); onRecommend?.() }}>📚 Recommend</button>}
          {user && book.olKey && (
            hasChat
              ? <button className="rt-bdp-btn rt-bdp-btn--primary" style={{ flex: 1 }}
                  onClick={() => { onClose(); onOpenChatModal ? onOpenChatModal(existingChatId) : onViewChat?.(existingChatId) }}>💬 View chat</button>
              : <button className="rt-bdp-btn rt-bdp-btn--primary" style={{ flex: 1 }}
                  onClick={() => { onClose(); onOpenChatModal ? onOpenChatModal(null, book) : onStartChat?.() }}>💬 Start chat</button>
          )}
        </>}

        {/* Home feed — add to list + chat */}
        {location === 'home-feed' && <>
          <button className="rt-bdp-btn rt-bdp-btn--primary" style={{ flex: 1 }}
            onClick={() => { onClose(); onAddToTBR?.() }}>+ Add to list</button>
          {user && book.olKey && (
            hasChat
              ? <button className="rt-bdp-btn rt-bdp-btn--amber" style={{ flex: 1 }}
                  onClick={() => { onClose(); onOpenChatModal ? onOpenChatModal(existingChatId) : onViewChat?.(existingChatId) }}>💬 View chat</button>
              : <button className="rt-bdp-btn rt-bdp-btn--amber" style={{ flex: 1 }}
                  onClick={() => { onClose(); onOpenChatModal ? onOpenChatModal(null, book) : onStartChat?.() }}>💬 Start chat</button>
          )}
        </>}

        {/* Community chat view */}
        {location === 'community-chat' && <>
          {user && book.olKey && (
            hasChat
              ? <button className="rt-bdp-btn rt-bdp-btn--primary" style={{ flex: 1 }}
                  onClick={() => { onClose(); onOpenChatModal ? onOpenChatModal(existingChatId) : onViewChat?.() }}>💬 View chat</button>
              : <button className="rt-bdp-btn rt-bdp-btn--primary" style={{ flex: 1 }}
                  onClick={() => { onClose(); onOpenChatModal ? onOpenChatModal(null, book) : onStartChat?.() }}>💬 Start chat</button>
          )}
          <button className="rt-bdp-btn rt-bdp-btn--ghost" style={{ flex: 1 }}
            onClick={() => { onClose(); onAddToTBR?.() }}>+ Add to list</button>
        </>}
      </div>
    </ModalShell>
  )
}