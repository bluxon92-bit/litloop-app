import { useState, useEffect, useRef, useCallback } from 'react'
import { useBooksContext } from '../context/BooksContext'
import { useSocialContext } from '../context/SocialContext'
import { useChatContext } from '../context/ChatContext'
import { useAuthContext } from '../context/AuthContext'
import { fmtDate } from '../lib/utils'
import CoverImage from '../components/books/CoverImage'
import BookDetailPanel from '../components/books/BookDetailPanel'
import BookSheet, { FinishModal } from '../components/books/BookSheet'
import AddBookModal from '../components/books/AddBookModal'

const TABS = ['to-read', 'history', 'dnf']
const TAB_LABELS = { 'to-read': 'To Read', history: 'History', dnf: 'DNF' }

// ── Drag-to-reorder TBR list ─────────────────────────────────────
// All handlers stored in refs so removeEventListener gets the same
// function reference that was added — plain functions recreate on
// every render, making removal silently fail.
function TBRList({ tbr, updateBook, deleteBook, openDetail }) {
  const [overIdx, setOverIdx] = useState(null)
  const dragIdxRef  = useRef(null)
  const overIdxRef  = useRef(null)
  const itemsRef    = useRef([])
  const tbrRef      = useRef(tbr)
  const updateRef   = useRef(updateBook)
  useEffect(() => { tbrRef.current   = tbr        }, [tbr])
  useEffect(() => { updateRef.current = updateBook }, [updateBook])

  // Stable refs — same function object for the lifetime of the component
  const onMoveRef = useRef(null)
  const onUpRef   = useRef(null)

  if (!onMoveRef.current) {
    onMoveRef.current = function onMove(e) {
      e.preventDefault()
      const y = e.clientY
      let target = null
      itemsRef.current.forEach((el, idx) => {
        if (!el) return
        const rect = el.getBoundingClientRect()
        if (y >= rect.top && y <= rect.bottom) target = idx
      })
      if (target !== null && target !== overIdxRef.current) {
        overIdxRef.current = target
        setOverIdx(target)
      }
    }
  }

  if (!onUpRef.current) {
    onUpRef.current = function onUp() {
      document.removeEventListener('pointermove', onMoveRef.current)
      document.removeEventListener('pointerup',   onUpRef.current)
      const from = dragIdxRef.current
      const to   = overIdxRef.current
      dragIdxRef.current = null
      overIdxRef.current = null
      setOverIdx(null)
      if (from !== null && to !== null && from !== to) {
        const reordered = [...tbrRef.current]
        const [moved] = reordered.splice(from, 1)
        reordered.splice(to, 0, moved)
        reordered.forEach((b, pos) => updateRef.current(b.id, { tbrPosition: pos }))
      }
    }
  }

  if (tbr.length === 0) {
    return (
      <div className="rt-empty-state">
        <div className="rt-empty-icon">📚</div>
        <p>Your reading list is empty — tap + to add a book.</p>
      </div>
    )
  }

  return (
    <div>
      {tbr.map((book, i) => (
        <div
          key={book.id}
          ref={el => itemsRef.current[i] = el}
          className="rt-tbr-item"
          style={{
            outline: overIdx === i && dragIdxRef.current !== i ? '2px solid var(--rt-amber)' : 'none',
            transition: 'outline 0.1s',
            opacity: overIdx !== null && dragIdxRef.current === i ? 0.4 : 1,
          }}
          onClick={() => openDetail(book, 'mylist-tbr')}
        >
          <div
            className="rt-tbr-drag-handle"
            data-handle="true"
            style={{ touchAction: 'none', cursor: 'grab' }}
            onPointerDown={e => {
              e.preventDefault()
              e.stopPropagation()
              dragIdxRef.current = i
              overIdxRef.current = i
              document.addEventListener('pointermove', onMoveRef.current, { passive: false })
              document.addEventListener('pointerup',   onUpRef.current)
            }}
            onClick={e => e.stopPropagation()}
          >
            <span/><span/><span/>
          </div>
          <span className="rt-tbr-num">{i + 1}</span>
          <CoverImage coverId={book.coverId} olKey={book.olKey} title={book.title} size="S" />
          <div className="rt-tbr-item-body">
            <div className="rt-book-title">{book.title}</div>
            {book.author && <div className="rt-book-author">{book.author}</div>}
          </div>
          <div className="rt-tbr-item-actions" onClick={e => e.stopPropagation()}>
            <button
              className="rt-start-reading-btn"
              onClick={() => updateBook(book.id, { status: 'reading', dateStarted: new Date().toISOString().split('T')[0] })}
            >Start</button>
            <button className="rt-delete rt-delete--quiet" onClick={() => deleteBook(book.id)}>×</button>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function MyList({ onNavigate, onOpenChatModal }) {
  const { user }                                   = useAuthContext()
  const { books, addBook, updateBook, deleteBook } = useBooksContext()
  const { friends }                                = useSocialContext()
  const { chats }                                  = useChatContext()

  const [tab, setTab]                         = useState('to-read')
  const [detailBook, setDetailBook]           = useState(null)
  const [detailLocation, setDetailLocation]   = useState(null)
  const [editBook, setEditBook]               = useState(null)
  const [sortHistory, setSortHistory]         = useState('date-desc')
  const [showAll, setShowAll]                 = useState(false)
  const [addModal, setAddModal]               = useState(false)

  const tbr = books
    .filter(b => b.status === 'tbr')
    .sort((a, b) => (a.tbrPosition || 999) - (b.tbrPosition || 999))

  const reading = books
    .filter(b => b.status === 'reading')
    .sort((a, b) => new Date(b.dateStarted || b.added || 0) - new Date(a.dateStarted || a.added || 0))

  const history = books.filter(b => b.status === 'read').sort((a, b) => {
    if (sortHistory === 'date-desc') return new Date(b.dateRead || b.added || 0) - new Date(a.dateRead || a.added || 0)
    if (sortHistory === 'date-asc')  return new Date(a.dateRead || a.added || 0) - new Date(b.dateRead || b.added || 0)
    if (sortHistory === 'rating')    return (b.rating || 0) - (a.rating || 0)
    if (sortHistory === 'title')     return (a.title || '').localeCompare(b.title || '')
    return 0
  })

  const dnf = books
    .filter(b => b.status === 'dnf')
    .sort((a, b) => new Date(b.added || 0) - new Date(a.added || 0))

  function findExistingChat(olKey) {
    if (!olKey || !chats) return null
    return chats.find(c => c.bookOlKey === olKey) || null
  }

  function openDetail(book, location) { setDetailBook(book); setDetailLocation(location) }

  const historyVisible = showAll ? history : history.slice(0, 20)

  function tabPill(t) {
    const active = tab === t
    return {
      background: active ? 'var(--rt-amber)' : 'var(--rt-border-md)',
      color: active ? '#fff' : 'var(--rt-t3)',
      borderRadius: 99, fontSize: '0.62rem', fontWeight: 700,
      padding: '0.1em 0.5em', lineHeight: '1.6', transition: 'all 0.15s',
    }
  }

  return (
    <div className="rt-page" style={{ maxWidth: 720, margin: '0 auto' }}>

      {/* ── Page title ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 1rem' }}>
        <h2 style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.6rem', fontWeight: 700, color: 'var(--rt-navy)', margin: 0 }}>
          My List
        </h2>
        <button onClick={() => setAddModal(true)} style={{ background: 'var(--rt-amber-pale)', border: 'none', borderRadius: 99, padding: '0.25rem 0.75rem', fontSize: '0.7rem', fontWeight: 700, color: 'var(--rt-amber)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <span style={{ fontSize: '0.9rem', lineHeight: 1 }}>+</span> Add Book
        </button>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--rt-border)', marginBottom: '1.25rem' }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '0.7rem 1.1rem 0.65rem',
              fontFamily: 'var(--rt-font-display)',
              fontSize: '0.95rem',
              fontWeight: tab === t ? 700 : 500,
              color: tab === t ? 'var(--rt-navy)' : 'var(--rt-t3)',
              borderBottom: `2.5px solid ${tab === t ? 'var(--rt-amber)' : 'transparent'}`,
              marginBottom: '-1px',
              transition: 'color 0.15s',
              display: 'flex', alignItems: 'center', gap: '0.35rem',
            }}
          >
            {TAB_LABELS[t]}
            {t === 'to-read' && tbr.length > 0 && <span style={tabPill(t)}>{tbr.length}</span>}
            {t === 'history' && history.length > 0 && <span style={tabPill(t)}>{history.length}</span>}
            {t === 'dnf' && dnf.length > 0 && <span style={tabPill(t)}>{dnf.length}</span>}
          </button>
        ))}
      </div>

      {/* ── Currently reading strip (always visible) ── */}
      {reading.length > 0 && (
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-teal)', marginBottom: '0.5rem' }}>Currently reading</div>
          {reading.map(book => (
            <div
              key={book.id}
              className="rt-card"
              style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.5rem', cursor: 'pointer' }}
              onClick={() => openDetail(book, 'mylist-reading')}
            >
              <CoverImage coverId={book.coverId} olKey={book.olKey} title={book.title} size="S" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="rt-book-title">{book.title}</div>
                {book.author && <div className="rt-book-author">{book.author}</div>}
                {book.dateStarted && <div className="rt-book-date">Started {fmtDate(book.dateStarted)}</div>}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--rt-teal)', fontWeight: 600, flexShrink: 0 }}>reading ›</div>
            </div>
          ))}
        </div>
      )}

      {/* ── TO READ TAB ── */}
      {tab === 'to-read' && (
        <TBRList
          tbr={tbr}
          updateBook={updateBook}
          deleteBook={deleteBook}
          openDetail={openDetail}
        />
      )}

      {/* ── HISTORY TAB ── */}
      {tab === 'history' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--rt-t3)' }}>{history.length} books</span>
            <select className="rt-sort-select" value={sortHistory} onChange={e => setSortHistory(e.target.value)}>
              <option value="date-desc">Newest first</option>
              <option value="date-asc">Oldest first</option>
              <option value="rating">By rating</option>
              <option value="title">By title</option>
            </select>
          </div>
          {history.length === 0 ? (
            <div className="rt-empty-state">
              <div className="rt-empty-icon">✓</div>
              <p>No finished books yet.</p>
            </div>
          ) : (
            <>
              {historyVisible.map(book => {
                const stars = book.rating ? '★'.repeat(book.rating) + '☆'.repeat(5 - book.rating) : ''
                return (
                  <div key={book.id} className="rt-hist-card" style={{ cursor: 'pointer', position: 'relative' }} onClick={() => openDetail(book, 'mylist-history')}>
                    <div className="rt-hist-card-inner">
                      <CoverImage coverId={book.coverId} olKey={book.olKey} title={book.title} size="S" />
                      <div className="rt-hist-body">
                        <div className="rt-book-title">{book.title}</div>
                        {book.author && <div className="rt-book-author">{book.author}</div>}
                        <div className="rt-hist-meta">
                          {stars && <span className="rt-book-stars">{stars}</span>}
                          {book.dateRead && <span className="rt-book-date">{fmtDate(book.dateRead)}</span>}
                          {book.genre && <span style={{ fontSize: '0.68rem', background: 'var(--rt-surface)', border: '1px solid var(--rt-border)', borderRadius: 99, padding: '0.1em 0.5em', color: 'var(--rt-t2)' }}>{book.genre}</span>}
                        </div>
                        {book.notes && <div className="rt-hist-notes">{book.notes.slice(0, 120)}{book.notes.length > 120 ? '…' : ''}</div>}
                      </div>
                    </div>
                    <button className="rt-hist-delete" onClick={e => { e.stopPropagation(); deleteBook(book.id) }}>×</button>
                  </div>
                )
              })}
              {history.length > 20 && !showAll && (
                <div style={{ textAlign: 'center', marginTop: '0.75rem' }}>
                  <button className="rt-show-more-btn" onClick={() => setShowAll(true)}>Show all {history.length} books</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── DNF TAB ── */}
      {tab === 'dnf' && (
        <div>
          {dnf.length === 0 ? (
            <div className="rt-empty-state">
              <div className="rt-empty-icon">🚫</div>
              <p>No DNF books yet.</p>
            </div>
          ) : (
            dnf.map(book => (
              <div key={book.id} className="rt-hist-card rt-hist-card--dnf" style={{ cursor: 'pointer', position: 'relative' }} onClick={() => openDetail(book, 'mylist-dnf')}>
                <div className="rt-hist-card-inner">
                  <CoverImage coverId={book.coverId} olKey={book.olKey} title={book.title} size="S" />
                  <div className="rt-hist-body">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <div className="rt-book-title">{book.title}</div>
                      <span className="rt-dnf-label">DNF</span>
                    </div>
                    {book.author && <div className="rt-book-author">{book.author}</div>}
                    {book.notes && <div className="rt-hist-notes">{book.notes.slice(0, 120)}{book.notes.length > 120 ? '…' : ''}</div>}
                  </div>
                </div>
                <button className="rt-hist-delete" onClick={e => { e.stopPropagation(); deleteBook(book.id) }}>×</button>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Panels & modals ── */}
      {detailBook && (
        <BookDetailPanel
          book={detailBook}
          location={detailLocation}
          user={user}
          existingChatId={findExistingChat(detailBook.olKey)?.id}
          onClose={() => setDetailBook(null)}
          onMarkFinished={() => { setEditBook({ ...detailBook, _finishMode: true }); setDetailBook(null) }}
          onStartReading={() => { updateBook(detailBook.id, { status: 'reading', dateStarted: new Date().toISOString().split('T')[0] }); setDetailBook(null) }}
          onEdit={() => { setEditBook(detailBook); setDetailBook(null) }}
          onOpenChatModal={(chatId, book) => onOpenChatModal?.(chatId, book || detailBook)}
          onStartChat={() => onOpenChatModal?.(null, detailBook)}
          onViewChat={(chatId) => onOpenChatModal?.(chatId || findExistingChat(detailBook.olKey)?.id)}
          onRecommend={() => setDetailBook(null)}
          onCoverUpdate={(id, coverId) => updateBook(id, { coverId })}
        />
      )}

      {editBook?._finishMode && (
        <FinishModal
          book={editBook}
          user={user}
          onClose={() => setEditBook(null)}
          onSaved={changes => { updateBook(editBook.id, changes); setEditBook(null) }}
        />
      )}

      {editBook && !editBook._finishMode && (
        <BookSheet
          book={editBook}
          onClose={() => setEditBook(null)}
          onSaved={changes => { updateBook(editBook.id, changes); setEditBook(null) }}
          onDeleted={() => { deleteBook(editBook.id); setEditBook(null) }}
          user={user}
        />
      )}

      {addModal && (
        <AddBookModal
          defaultStatus="tbr"
          books={books}
          onAdd={async d => { await addBook(d); setAddModal(false) }}
          onClose={() => setAddModal(false)}
          user={user}
        />
      )}
    </div>
  )
}