import { useState, useEffect, useRef } from 'react'
import { sb } from '../lib/supabase'
import { ModalShell } from './books/BookSheet'
import CoverImage from './books/CoverImage'

const MAX_UPDATE = 280
const MAX_QUOTE  = 500

export default function MomentComposer({ user, books, onClose, onPosted, preselectedBook = null, prefilledType = 'update', prefilledPageRef = null }) {
  const [step, setStep]             = useState(preselectedBook ? 'compose' : 'book')
  const [search, setSearch]         = useState('')
  const [selectedBook, setSelectedBook] = useState(preselectedBook)
  const [momentType, setMomentType] = useState(prefilledType)
  const [body, setBody]             = useState('')
  const [pageRef, setPageRef]       = useState(prefilledPageRef ? String(prefilledPageRef) : '')
  const [posting, setPosting]         = useState(false)
  const [spoilerWarning, setSpoilerWarning] = useState(false)
  const textareaRef = useRef(null)

  // Sort: currently reading first, then rest of library
  const reading = (books || []).filter(b => b.status === 'reading')
  const others  = (books || []).filter(b => b.status !== 'reading')
  const allBooks = [...reading, ...others]

  const filtered = search.trim()
    ? allBooks.filter(b =>
        b.title?.toLowerCase().includes(search.toLowerCase()) ||
        b.author?.toLowerCase().includes(search.toLowerCase())
      )
    : allBooks

  const maxChars = momentType === 'quote' ? MAX_QUOTE : MAX_UPDATE
  const charsLeft = maxChars - body.length
  const overLimit = charsLeft < 0

  // Focus textarea when entering compose step
  useEffect(() => {
    if (step === 'compose') {
      setTimeout(() => textareaRef.current?.focus(), 100)
    }
  }, [step, momentType])

  // Reset body when switching type
  useEffect(() => { setBody('') }, [momentType])

  function selectBook(book) {
    setSelectedBook(book)
    setStep('compose')
  }

  function selectNoBook() {
    setSelectedBook(null)
    setStep('compose')
  }

  async function post() {
    if (!body.trim() || overLimit || posting || !user) return
    setPosting(true)
    try {
      await sb.rpc('create_book_moment', {
        p_user_id:     user.id,
        p_book_ol_key: selectedBook?.olKey   || null,
        p_book_title:  selectedBook?.title   || null,
        p_book_author: selectedBook?.author  || null,
        p_cover_id:    selectedBook?.coverId ? Number(selectedBook.coverId) : null,
        p_moment_type: momentType,
        p_body:        body.trim(),
        p_page_ref:    pageRef ? parseInt(pageRef, 10) : null,
        p_spoiler:     spoilerWarning,
      })
      onPosted?.()
      onClose()
    } catch (e) {
      console.error('[MomentComposer] post error:', e)
    }
    setPosting(false)
  }

  // ── Book picker step ─────────────────────────────────────
  if (step === 'book') {
    return (
      <ModalShell onClose={onClose} maxWidth={480}>
        <style>{`.rt-ms-handle { visibility: hidden; margin: 0 !important; height: 0 !important; }`}</style>
        <div style={{ background: 'linear-gradient(160deg,#111C35,var(--rt-navy))', padding: '1.25rem 1rem 0.75rem', flexShrink: 0, borderRadius: '20px 20px 0 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1rem', fontWeight: 700, color: '#fff' }}>Share a moment</div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%', width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', fontSize: '0.95rem' }}>×</button>
          </div>
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search your books…"
            style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '0.5rem 0.75rem', fontSize: '0.85rem', color: '#fff', outline: 'none', fontFamily: 'var(--rt-font-body)' }}
          />
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '0.25rem 0' }}>
          {filtered.map(book => (
            <div
              key={book.id}
              onClick={() => selectBook(book)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 1rem', cursor: 'pointer', borderBottom: '1px solid var(--rt-border)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--rt-surface)'}
              onMouseLeave={e => e.currentTarget.style.background = ''}
            >
              <div style={{ width: 30, height: 44, borderRadius: 3, overflow: 'hidden', flexShrink: 0, background: 'var(--rt-surface)' }}>
                <CoverImage coverId={book.coverId} olKey={book.olKey} title={book.title} size="S" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--rt-navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{book.title}</div>
                {book.author && <div style={{ fontSize: '0.75rem', color: 'var(--rt-t3)' }}>{book.author}</div>}
              </div>
              {book.status === 'reading' && (
                <span style={{ fontSize: '0.65rem', fontWeight: 700, background: 'var(--rt-teal)', color: '#fff', borderRadius: 99, padding: '0.15em 0.55em', flexShrink: 0 }}>reading</span>
              )}
            </div>
          ))}

          {/* No specific book option */}
          <div
            onClick={selectNoBook}
            style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 1rem', cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--rt-surface)'}
            onMouseLeave={e => e.currentTarget.style.background = ''}
          >
            <div style={{ width: 30, height: 44, borderRadius: 3, background: 'var(--rt-surface)', border: '1px dashed var(--rt-border-md)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--rt-t3)" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--rt-t2)' }}>No specific book</div>
          </div>
        </div>
      </ModalShell>
    )
  }

  // ── Compose step ─────────────────────────────────────────
  const borderColour = momentType === 'quote' ? 'var(--rt-amber)' : 'var(--rt-teal)'
  const placeholder  = momentType === 'quote'
    ? 'Paste or type the quote…'
    : "What's on your mind about this book…"

  return (
    <ModalShell onClose={onClose} maxWidth={480}>
      <style>{`.rt-ms-handle { visibility: hidden; margin: 0 !important; height: 0 !important; }`}</style>
      {/* Header */}
      <div style={{ background: 'linear-gradient(160deg,#111C35,var(--rt-navy))', padding: '1.25rem 1rem 0.9rem', flexShrink: 0, borderRadius: '20px 20px 0 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1rem', fontWeight: 700, color: '#fff' }}>Share a moment</div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%', width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', fontSize: '0.95rem' }}>×</button>
        </div>
      </div>

      <div style={{ overflowY: 'auto', flex: 1, padding: '1rem' }}>
        {/* Selected book row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', background: 'var(--rt-surface)', borderRadius: 8, padding: '0.5rem 0.75rem', marginBottom: '0.9rem' }}>
          {selectedBook ? (
            <>
              <div style={{ width: 26, height: 38, borderRadius: 3, overflow: 'hidden', flexShrink: 0, background: 'var(--rt-border)' }}>
                <CoverImage coverId={selectedBook.coverId} olKey={selectedBook.olKey} title={selectedBook.title} size="S" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--rt-navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedBook.title}</div>
                {selectedBook.author && <div style={{ fontSize: '0.7rem', color: 'var(--rt-t3)' }}>{selectedBook.author}</div>}
              </div>
            </>
          ) : (
            <div style={{ flex: 1, fontSize: '0.8rem', color: 'var(--rt-t3)' }}>No specific book</div>
          )}
          <button onClick={() => setStep('book')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--rt-amber)', fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap' }}>← Change</button>
        </div>

        {/* Type toggle */}
        <div style={{ display: 'flex', background: 'var(--rt-surface)', borderRadius: 8, padding: 3, marginBottom: '0.9rem' }}>
          {[{ id: 'update', label: 'Reading update' }, { id: 'quote', label: 'Quote' }].map(t => (
            <button
              key={t.id}
              onClick={() => setMomentType(t.id)}
              style={{
                flex: 1, border: 'none', borderRadius: 6, padding: '0.4rem 0',
                fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                background: momentType === t.id ? 'var(--rt-white)' : 'transparent',
                color: momentType === t.id
                  ? (t.id === 'quote' ? 'var(--rt-amber)' : 'var(--rt-teal)')
                  : 'var(--rt-t3)',
                boxShadow: momentType === t.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Composer area with coloured left border */}
        <div style={{ borderLeft: `3px solid ${borderColour}`, paddingLeft: '0.75rem', marginBottom: '0.75rem' }}>
          <textarea
            ref={textareaRef}
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder={placeholder}
            rows={4}
            style={{
              width: '100%', border: 'none', outline: 'none', background: 'none', resize: 'none',
              fontFamily: momentType === 'quote' ? 'Georgia, serif' : 'var(--rt-font-body)',
              fontStyle: momentType === 'quote' ? 'italic' : 'normal',
              fontSize: '0.9rem', color: 'var(--rt-navy)', lineHeight: 1.65,
            }}
          />
        </div>

        {/* % complete */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--rt-t3)' }}>% complete</span>
          <input
            type="number"
            value={pageRef}
            onChange={e => setPageRef(e.target.value)}
            placeholder="e.g. 57"
            min={0}
            max={100}
            style={{ width: 80, background: 'var(--rt-surface)', border: '1px solid var(--rt-border-md)', borderRadius: 6, padding: '0.3rem 0.5rem', fontSize: '0.8rem', color: 'var(--rt-navy)', outline: 'none' }}
          />
          <span style={{ fontSize: '0.7rem', color: 'var(--rt-t3)' }}>optional</span>
        </div>

        {/* Spoiler + char count row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', userSelect: 'none' }}>
            <input type="checkbox" checked={spoilerWarning} onChange={e => setSpoilerWarning(e.target.checked)}
              style={{ width: 14, height: 14, accentColor: 'var(--rt-navy)', cursor: 'pointer' }} />
            <span style={{ fontSize: '0.72rem', color: 'var(--rt-t3)' }}>Contains spoilers</span>
          </label>
          <span style={{ fontSize: '0.75rem', color: overLimit ? '#dc2626' : 'var(--rt-t3)' }}>{body.length} / {maxChars}</span>
        </div>

        {/* Post button */}
        <button
          onClick={post}
          disabled={!body.trim() || overLimit || posting}
          style={{
            width: '100%', background: body.trim() && !overLimit ? 'var(--rt-navy)' : 'var(--rt-surface)',
            color: body.trim() && !overLimit ? '#fff' : 'var(--rt-t3)',
            border: 'none', borderRadius: 99, padding: '0.65rem', fontSize: '0.9rem',
            fontWeight: 700, cursor: body.trim() && !overLimit ? 'pointer' : 'default',
            transition: 'all 0.15s',
          }}
        >
          {posting ? 'Posting…' : 'Post moment'}
        </button>
      </div>
    </ModalShell>
  )
}