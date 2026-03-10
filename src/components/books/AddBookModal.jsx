import { useState, useRef } from 'react'
import { GENRES } from '../../lib/utils'
import { ModalShell } from './BookSheet'

function Stars({ value, onChange }) {
  const [hover, setHover] = useState(0)
  return (
    <div style={{ display: 'flex', gap: '0.2rem' }}>
      {[1,2,3,4,5].map(n => (
        <button
          key={n}
          type="button"
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(value === n ? 0 : n)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '0.1rem',
            fontSize: '1.55rem', lineHeight: 1,
            color: n <= (hover || value) ? 'var(--rt-amber)' : 'var(--rt-border-md)',
            transition: 'color 0.1s'
          }}
        >★</button>
      ))}
    </div>
  )
}

export default function AddBookModal({ defaultStatus, books, onAdd, onClose, user }) {
  const [title, setTitle]   = useState('')
  const [author, setAuthor] = useState('')
  const [status, setStatus] = useState(defaultStatus || 'tbr')
  const [rating, setRating] = useState(0)
  const [genre, setGenre]   = useState('')
  const [notes, setNotes]   = useState('')
  const [review, setReview] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [date, setDate]     = useState(new Date().toISOString().split('T')[0])
  const [olKey, setOlKey]   = useState(null)
  const [coverId, setCoverId] = useState(null)
  const [olDropdown, setOlDropdown] = useState([])
  const [error, setError]   = useState(null)
  const olTimer = useRef(null)

  function normTitle(s) {
    return (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
  }
  function isDup(t, a) {
    const nt = normTitle(t), na = normTitle(a)
    return books.some(b => {
      if (normTitle(b.title) !== nt) return false
      if (na && normTitle(b.author) && normTitle(b.author) !== na) return false
      return true
    })
  }

  async function searchOL(q) {
    if (q.length < 3) { setOlDropdown([]); return }
    try {
      const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&fields=key,title,author_name,first_publish_year,cover_i&limit=6&language=eng`
      const res = await fetch(url)
      const data = await res.json()
      setOlDropdown((data.docs || []).slice(0, 6))
    } catch { setOlDropdown([]) }
  }

  function handleTitleChange(v) {
    setTitle(v)
    setOlKey(null); setCoverId(null)
    clearTimeout(olTimer.current)
    olTimer.current = setTimeout(() => searchOL(v), 500)
  }

  function selectOL(doc) {
    setTitle(doc.title || '')
    setAuthor((doc.author_name || []).join(', ') || '')
    setOlKey(doc.key || null)
    setCoverId(doc.cover_i || null)
    setOlDropdown([])
  }

  async function handleSubmit() {
    if (!title.trim()) { setError('Title is required.'); return }
    if (isDup(title, author)) { setError('This book is already in your list.'); return }
    await onAdd({
      title: title.trim(),
      author: author.trim() || '',
      status,
      rating:       status === 'read' ? (rating || null) : null,
      genre:        genre || null,
      notes:        notes.trim() || null,
      reviewBody:   (isPublic && review.trim()) ? review.trim() : null,
      reviewPublic: isPublic && !!review.trim(),
      dateRead:     status === 'read' ? (date || null) : null,
      dateStarted:  status === 'reading' ? new Date().toISOString().split('T')[0] : null,
      olKey:        olKey || null,
      coverId:      coverId || null
    })
  }

  return (
    <ModalShell onClose={onClose} maxWidth={560}>
      {/* Header */}
      <div style={{ padding: '1.1rem 1.25rem 0.85rem', borderBottom: '1px solid var(--rt-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1rem', fontWeight: 700, color: 'var(--rt-navy)' }}>Add a book</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.3rem', color: 'var(--rt-t3)' }}>×</button>
      </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '1.25rem' }}>
          {error && <p style={{ fontSize: '0.82rem', color: '#991b1b', marginBottom: '0.75rem' }}>{error}</p>}

          {/* Title with OL autocomplete */}
          <div style={{ marginBottom: '1rem', position: 'relative' }}>
            <label className="rt-field-label">Title *</label>
            <input
              className="rt-input"
              style={{ width: '100%' }}
              placeholder="Search or type a title…"
              value={title}
              onChange={e => handleTitleChange(e.target.value)}
              autoComplete="off"
            />
            {coverId && (
              <img
                src={`https://covers.openlibrary.org/b/id/${coverId}-S.jpg`}
                style={{ position: 'absolute', right: 8, top: 28, height: 38, borderRadius: 4, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}
                alt=""
              />
            )}
            {olDropdown.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                background: 'var(--rt-white)', border: '1px solid var(--rt-border-md)',
                borderRadius: 'var(--rt-r3)', boxShadow: 'var(--rt-s2)', maxHeight: 260, overflowY: 'auto'
              }}>
                {olDropdown.map((doc, i) => {
                  const coverSrc = doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-S.jpg` : null
                  return (
                    <div
                      key={i}
                      onClick={() => selectOL(doc)}
                      style={{ display: 'flex', gap: '0.6rem', padding: '0.55rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid var(--rt-border)', alignItems: 'center' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--rt-surface)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      {coverSrc
                        ? <img src={coverSrc} style={{ width: 28, height: 40, borderRadius: 3, objectFit: 'cover', flexShrink: 0 }} alt="" />
                        : <div style={{ width: 28, height: 40, background: 'var(--rt-border)', borderRadius: 3, flexShrink: 0 }}/>
                      }
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--rt-navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.title}</div>
                        {doc.author_name?.[0] && <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)' }}>{doc.author_name[0]}{doc.first_publish_year ? ` · ${doc.first_publish_year}` : ''}</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label className="rt-field-label">Author</label>
            <input className="rt-input" style={{ width: '100%' }} placeholder="Author name" value={author} onChange={e => setAuthor(e.target.value)} />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label className="rt-field-label">Status</label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {[['reading','📖 Reading'],['tbr','📚 To Read'],['read','✓ Read']].map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setStatus(v)}
                  style={{
                    padding: '0.45rem 0.85rem', borderRadius: 'var(--rt-r3)', fontSize: '0.82rem', cursor: 'pointer',
                    border: '1.5px solid', fontWeight: 500,
                    borderColor: status === v ? 'var(--rt-navy)' : 'var(--rt-border-md)',
                    background: status === v ? 'var(--rt-navy)' : 'transparent',
                    color: status === v ? '#fff' : 'var(--rt-t2)'
                  }}
                >{l}</button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label className="rt-field-label">Genre</label>
            <select className="rt-input" value={genre} onChange={e => setGenre(e.target.value)}>
              <option value="">— none —</option>
              {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          {status === 'read' && (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <label className="rt-field-label">Date finished</label>
                <input type="date" className="rt-input" value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label className="rt-field-label">Rating</label>
                <Stars value={rating} onChange={setRating} />
              </div>
            </>
          )}

          {(status === 'read' || status === 'reading') && (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <label className="rt-field-label">Private notes</label>
                <textarea
                  className="rt-textarea" rows={3} placeholder="Your private notes…"
                  value={notes} onChange={e => setNotes(e.target.value)}
                  style={{ width: '100%', resize: 'none' }}
                />
              </div>
              {status === 'read' && (
                <>
                  <div style={{ marginBottom: '0.5rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}>
                      <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} />
                      <span style={{ fontSize: '0.85rem', color: 'var(--rt-navy)' }}>Share a public review</span>
                    </label>
                  </div>
                  {isPublic && (
                    <div style={{ marginBottom: '1rem' }}>
                      <textarea
                        className="rt-textarea" rows={4} placeholder="Write your review…"
                        value={review} onChange={e => setReview(e.target.value)}
                        style={{ width: '100%', resize: 'none' }}
                      />
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '0.85rem 1.25rem', borderTop: '1px solid var(--rt-border)', display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
          <button className="rt-ghost-btn" onClick={onClose}>Cancel</button>
          <button className="rt-submit-btn" style={{ flex: 1 }} onClick={handleSubmit}>Add book</button>
        </div>
    </ModalShell>
  )
}
