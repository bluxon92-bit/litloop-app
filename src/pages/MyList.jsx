import { useState } from 'react'
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

export default function MyList({ onNavigate }) {
  const { user }                              = useAuthContext()
  const { books, addBook, updateBook, deleteBook } = useBooksContext()
  const { friends }                           = useSocialContext()
  const { chats, startOrOpenChat }            = useChatContext()

  const [tab, setTab]                 = useState('to-read')
  const [addModal, setAddModal]       = useState(false)
  const [detailBook, setDetailBook]   = useState(null)
  const [detailLocation, setDetailLocation] = useState(null)
  const [editBook, setEditBook]       = useState(null)
  const [sortHistory, setSortHistory] = useState('date-desc')
  const [showAll, setShowAll]         = useState(false)

  // TBR with drag-reorder
  const [dragIdx, setDragIdx]  = useState(null)
  const [overIdx, setOverIdx]  = useState(null)

  const tbr     = books.filter(b => b.status === 'tbr').sort((a, b) => (a.tbrPosition||999) - (b.tbrPosition||999))
  const reading = books.filter(b => b.status === 'reading').sort((a, b) => new Date(b.dateStarted||b.added||0) - new Date(a.dateStarted||a.added||0))
  const history = books.filter(b => b.status === 'read').sort((a, b) => {
    if (sortHistory === 'date-desc') return new Date(b.dateRead||b.added||0) - new Date(a.dateRead||a.added||0)
    if (sortHistory === 'date-asc')  return new Date(a.dateRead||a.added||0) - new Date(b.dateRead||b.added||0)
    if (sortHistory === 'rating')    return (b.rating||0) - (a.rating||0)
    if (sortHistory === 'title')     return (a.title||'').localeCompare(b.title||'')
    return 0
  })
  const dnf = books.filter(b => b.status === 'dnf').sort((a, b) => new Date(b.added||0) - new Date(a.added||0))

  function findExistingChat(olKey) {
    if (!olKey || !chats) return null
    return chats.find(c => c.bookOlKey === olKey) || null
  }

  function openDetail(book, location) { setDetailBook(book); setDetailLocation(location) }

  // ── TBR drag-to-reorder ───────────────────────────────────────
  function handleDragStart(i) { setDragIdx(i) }
  function handleDragOver(e, i) { e.preventDefault(); setOverIdx(i) }
  function handleDrop() {
    if (dragIdx === null || overIdx === null || dragIdx === overIdx) { setDragIdx(null); setOverIdx(null); return }
    const reordered = [...tbr]
    const [moved] = reordered.splice(dragIdx, 1)
    reordered.splice(overIdx, 0, moved)
    reordered.forEach((b, i) => updateBook(b.id, { tbrPosition: i }))
    setDragIdx(null); setOverIdx(null)
  }

  const historyVisible = showAll ? history : history.slice(0, 20)

  return (
    <div style={{ padding: '1.5rem', maxWidth: 720, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <h2 style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.6rem', fontWeight: 700, color: 'var(--rt-navy)', margin: 0 }}>My List</h2>
        <button className="rt-add-fab" onClick={() => setAddModal(true)} title="Add book">+</button>
      </div>

      {/* Currently reading strip (always visible) */}
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

      {/* Tabs + content — white container */}
      <div style={{
        background: 'var(--rt-white)',
        borderRadius: 'var(--rt-r2)',
        border: '1px solid var(--rt-border)',
        boxShadow: 'var(--rt-s1)',
        padding: '1.25rem',
      }}>

        {/* Tabs */}
        <div className="rt-status-tabs" style={{ marginBottom: '1.25rem' }}>
          {TABS.map(t => (
            <button key={t} className={`rt-status-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
              {TAB_LABELS[t]}
              {t === 'to-read' && tbr.length > 0 && (
                <span style={{ marginLeft: '0.35rem', fontSize: '0.68rem', opacity: 0.65 }}>({tbr.length})</span>
              )}
            </button>
          ))}
        </div>

        {/* ── TO READ TAB ── */}
        {tab === 'to-read' && (
          <div>
            {/* Add book block at top */}
            <div
              onClick={() => setAddModal(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.85rem 1rem', marginBottom: '0.75rem',
                background: 'var(--rt-white)', border: '1.5px dashed var(--rt-border-md)',
                borderRadius: 'var(--rt-r3)', cursor: 'pointer', transition: 'border-color 0.15s'
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--rt-amber)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--rt-border-md)'}
            >
              <div style={{ width: 36, height: 36, borderRadius: 'var(--rt-r2)', background: 'var(--rt-amber-pale)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>+</div>
              <div>
                <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--rt-navy)' }}>Add a book</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)' }}>Search Open Library or add manually</div>
              </div>
            </div>

            {tbr.length === 0 ? (
              <div className="rt-empty-state">
                <div className="rt-empty-icon">📚</div>
                <p>Your reading list is empty.</p>
              </div>
            ) : (
              tbr.map((book, i) => (
                <div
                  key={book.id}
                  className="rt-tbr-item"
                  draggable
                  onDragStart={() => handleDragStart(i)}
                  onDragOver={e => handleDragOver(e, i)}
                  onDrop={handleDrop}
                  onDragEnd={() => { setDragIdx(null); setOverIdx(null) }}
                  style={{
                    opacity: dragIdx === i ? 0.4 : 1,
                    outline: overIdx === i && dragIdx !== i ? '2px solid var(--rt-amber)' : 'none'
                  }}
                  onClick={() => openDetail(book, 'mylist-tbr')}
                >
                  <div className="rt-tbr-drag-handle" onClick={e => e.stopPropagation()}>
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
                      onClick={() => updateBook(book.id, { status: 'reading', dateStarted: new Date().toISOString().split('T')[0] })}
                      className="rt-start-reading-btn"
                    >Start</button>
                    <button className="rt-delete rt-delete--quiet" onClick={() => deleteBook(book.id)}>×</button>
                  </div>
                </div>
              ))
            )}
          </div>
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
                    <div
                      key={book.id}
                      className="rt-hist-card"
                      style={{ cursor: 'pointer', position: 'relative' }}
                      onClick={() => openDetail(book, 'mylist-history')}
                    >
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
                <div
                  key={book.id}
                  className="rt-hist-card rt-hist-card--dnf"
                  style={{ cursor: 'pointer', position: 'relative' }}
                  onClick={() => openDetail(book, 'mylist-dnf')}
                >
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

      </div> {/* end white container */}

      {/* BookDetailPanel */}
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
          onStartChat={() => {
            const b = detailBook
            if (b.olKey) startOrOpenChat(b.olKey, b.title, b.author, b.coverId, friends?.map(f => f.userId) || [])
            onNavigate('community'); setDetailBook(null)
          }}
          onViewChat={() => { onNavigate('community'); setDetailBook(null) }}
          onRecommend={() => setDetailBook(null)}
        />
      )}

      {/* Finish flow — triggered from "Mark finished" */}
      {editBook?._finishMode && (
        <FinishModal
          book={editBook}
          user={user}
          onClose={() => setEditBook(null)}
          onSaved={changes => { updateBook(editBook.id, changes); setEditBook(null) }}
        />
      )}

      {/* Edit sheet — for all other edit actions */}
      {editBook && !editBook._finishMode && (
        <BookSheet
          book={editBook}
          onClose={() => setEditBook(null)}
          onSaved={changes => { updateBook(editBook.id, changes); setEditBook(null) }}
          onDeleted={() => { deleteBook(editBook.id); setEditBook(null) }}
          user={user}
        />
      )}

      {/* Add book modal */}
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