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
import { IcoBook } from '../components/icons'
import MomentComposer from '../components/MomentComposer'

const TABS = ['to-read', 'history', 'dnf']
const TAB_LABELS = { 'to-read': 'To Read', history: 'History', dnf: 'DNF' }

// ── Drag-to-reorder TBR list ─────────────────────────────────────
function TBRList({ tbr, updateBook, deleteBook, openDetail }) {
  const [order, setOrder] = useState(() => [...tbr])
  const orderRef   = useRef(order)   // always current, never stale
  const dragSrcId  = useRef(null)

  // keep ref in sync
  function applyOrder(next) {
    orderRef.current = next
    setOrder(next)
  }

  const saving = useRef(false)

  useEffect(() => {
    if (dragSrcId.current === null && !saving.current) applyOrder([...tbr])
  }, [tbr])

  function reorder(srcId, targetId) {
    const list      = [...orderRef.current]
    const srcIdx    = list.findIndex(b => String(b.id) === String(srcId))
    const targetIdx = list.findIndex(b => String(b.id) === String(targetId))
    if (srcIdx === -1 || targetIdx === -1) return
    const [moved] = list.splice(srcIdx, 1)
    list.splice(targetIdx, 0, moved)
    applyOrder(list)
    // Block tbr prop sync while DB writes are in flight
    saving.current = true
    list.forEach((b, i) => {
      if (b.tbrPosition !== i) updateBook(b.id, { tbrPosition: i })
    })
    setTimeout(() => { saving.current = false }, 1000)
  }

  if (order.length === 0) {
    return (
      <div className="rt-empty-state">
        <div className="rt-empty-icon"><IcoBook size={40} color="var(--rt-t3)" /></div>
        <p>Your reading list is empty — tap + to add a book.</p>
      </div>
    )
  }

  return (
    <div>
      {order.map((book, i) => (
        <div
          key={book.id}
          className="rt-tbr-item"
          draggable
          onDragStart={e => {
            dragSrcId.current = String(book.id)
            e.currentTarget.classList.add('dragging')
            e.dataTransfer.effectAllowed = 'move'
          }}
          onDragEnd={e => {
            e.currentTarget.classList.remove('dragging')
            document.querySelectorAll('.rt-tbr-item').forEach(el => el.classList.remove('drag-over'))
            dragSrcId.current = null
          }}
          onDragOver={e => {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            if (String(book.id) !== dragSrcId.current) {
              document.querySelectorAll('.rt-tbr-item').forEach(el => el.classList.remove('drag-over'))
              e.currentTarget.classList.add('drag-over')
            }
          }}
          onDrop={e => {
            e.preventDefault()
            if (String(book.id) === dragSrcId.current) return
            reorder(dragSrcId.current, String(book.id))
          }}
          onClick={() => { if (!dragSrcId.current) openDetail(book, 'mylist-tbr') }}
        >
          <div className="rt-tbr-drag-handle" onClick={e => e.stopPropagation()}>
            <span/><span/><span/>
          </div>
          <span className="rt-tbr-num">{i + 1}</span>
          <CoverImage coverId={book.coverId} olKey={book.olKey} coverUrl={book.coverUrl} title={book.title} size="M" />
          <div className="rt-tbr-item-body">
            <div className="rt-book-title">{book.title}</div>
            {book.author && <div className="rt-book-author">{book.author}</div>}
            <div style={{ marginTop: '0.4rem' }} onClick={e => e.stopPropagation()}>
              <button
                className="rt-start-reading-btn"
                onClick={() => updateBook(book.id, { status: 'reading', dateStarted: new Date().toISOString().split('T')[0] })}
              >Start</button>
            </div>
          </div>
          <div className="rt-tbr-item-actions" onClick={e => e.stopPropagation()}>
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
  const [crCarouselIdx, setCrCarouselIdx]     = useState(0)
  const [pendingMoment, setPendingMoment]     = useState(null)

  const tbr = books
    .filter(b => b.status === 'tbr')
    .sort((a, b) => (a.tbrPosition || 999) - (b.tbrPosition || 999))

  const reading = books
    .filter(b => b.status === 'reading')
    .sort((a, b) => new Date(b.dateStarted || b.added || 0) - new Date(a.dateStarted || a.added || 0))

  const history = books.filter(b => b.status === 'read').sort((a, b) => {
    if (sortHistory === 'date-desc') {
      // No dateRead = treated as oldest (sinks to bottom)
      const da = a.dateRead ? new Date(a.dateRead) : new Date(0)
      const db = b.dateRead ? new Date(b.dateRead) : new Date(0)
      return db - da
    }
    if (sortHistory === 'date-asc') {
      const da = a.dateRead ? new Date(a.dateRead) : new Date(0)
      const db = b.dateRead ? new Date(b.dateRead) : new Date(0)
      return da - db
    }
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
      position: 'relative', top: '-6px',
      background: active ? 'var(--rt-amber)' : 'var(--rt-border-md)',
      color: active ? '#fff' : 'var(--rt-t3)',
      borderRadius: 99, fontSize: '0.55rem', fontWeight: 700,
      padding: '0.1em 0.45em', lineHeight: '1.6', transition: 'all 0.15s',
      verticalAlign: 'top',
    }
  }

  return (
    <div className="rt-page" style={{ maxWidth: 760, margin: '0 auto' }}>

      {/* ── Page title ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 1rem' }}>
        <h2 style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.35rem', fontWeight: 700, color: 'var(--rt-navy)', margin: 0 }}>
          My List
        </h2>
        <button onClick={() => setAddModal(true)} style={{ background: 'var(--rt-amber-pale)', border: 'none', borderRadius: 99, padding: '0.25rem 0.75rem', fontSize: '0.7rem', fontWeight: 700, color: 'var(--rt-amber)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <span style={{ fontSize: '0.9rem', lineHeight: 1 }}>+</span> Add Book
        </button>
      </div>

      {/* ── Currently reading carousel (above tabs) ── */}
      {reading.length > 0 && (
        <div style={{ marginBottom: '1.25rem' }}>
          <div
            className="rt-cr-carousel"
            style={{ display: 'flex', gap: '0.75rem' }}
            onScroll={e => {
              const w = e.currentTarget.firstChild?.offsetWidth || e.currentTarget.offsetWidth
              if (w) setCrCarouselIdx(Math.round(e.currentTarget.scrollLeft / (w + 12)))
            }}
          >
            {reading.map(book => (
              <div
                key={book.id}
                onClick={() => openDetail(book, 'mylist-reading')}
                style={{
                  flexShrink: 0,
                  width: reading.length === 1 ? '100%' : '85%',
                  scrollSnapAlign: 'start',
                  background: 'var(--rt-white)', borderRadius: 'var(--rt-r3)',
                  border: '1px solid var(--rt-border)', padding: '0.9rem 1rem',
                  boxShadow: 'var(--rt-s1)', display: 'flex', gap: '0.85rem',
                  alignItems: 'center', cursor: 'pointer', boxSizing: 'border-box'
                }}
              >
                <div style={{ width: 64, height: 92, borderRadius: 6, overflow: 'hidden', flexShrink: 0, boxShadow: '0 2px 8px rgba(26,39,68,0.15)' }}>
                  <CoverImage coverId={book.coverId} olKey={book.olKey} coverUrl={book.coverUrl} title={book.title} size="M" priority={true} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="rt-reading-badge" style={{ marginBottom: '0.3rem' }}>Currently reading</div>
                  <div className="rt-reading-title">{book.title}</div>
                  {book.author && <div className="rt-reading-author">{book.author}</div>}
                  {book.dateStarted && <div className="rt-reading-meta" style={{ marginTop: '0.3rem' }}>Started {fmtDate(book.dateStarted)}</div>}
                  {book.currentPage > 0 && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <div style={{ flex: 1, height: 3, background: 'var(--rt-border)', borderRadius: 99, overflow: 'hidden' }}>
                          <div style={{ height: '100%', background: 'var(--rt-amber)', borderRadius: 99, width: `${Math.min(100, book.currentPage)}%` }} />
                        </div>
                        <span style={{ fontSize: '0.65rem', color: 'var(--rt-t3)', whiteSpace: 'nowrap' }}>{book.currentPage}%</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {reading.length > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.35rem', marginTop: '0.6rem' }}>
              {reading.map((_, i) => (
                <div key={i} style={{ width: i === crCarouselIdx ? 18 : 6, height: 6, borderRadius: 99, background: i === crCarouselIdx ? 'var(--rt-amber)' : 'var(--rt-border)', transition: 'all 0.2s' }} />
              ))}
            </div>
          )}
        </div>
      )}

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
                      <CoverImage coverId={book.coverId} olKey={book.olKey} coverUrl={book.coverUrl} title={book.title} size="M" />
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
                  <CoverImage coverId={book.coverId} olKey={book.olKey} coverUrl={book.coverUrl} title={book.title} size="M" />
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
          onEdit={(mode) => { setEditBook({ ...detailBook, _initialMode: mode || 'view' }); setDetailBook(null) }}
          onOpenChatModal={(chatId, book) => onOpenChatModal?.(chatId, book || detailBook)}
          onStartChat={() => onOpenChatModal?.(null, detailBook)}
          onViewChat={(chatId) => onOpenChatModal?.(chatId || findExistingChat(detailBook.olKey)?.id)}
          onRecommend={() => setDetailBook(null)}
          onCoverUpdate={(id, coverId, olKey) => updateBook(id, { coverId, _olKey: olKey })}
          onProgressLogged={({ currentPage, totalPages }) => {
            updateBook(detailBook.id, { currentPage, totalPages })
          }}
          onShareMoment={({ book, page, total }) => {
            setDetailBook(null)
            setPendingMoment({ book, page, total })
          }}
        />
      )}

      {editBook?._finishMode && (
        <FinishModal
          book={editBook}
          user={user}
          onClose={() => setEditBook(null)}
          onSaved={changes => { updateBook(editBook.id, changes) }}
          onOpenChatModal={onOpenChatModal}
        />
      )}

      {editBook && !editBook._finishMode && (
        <BookSheet
          book={editBook}
          initialMode={editBook._initialMode || 'view'}
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

      {pendingMoment && (
        <MomentComposer
          user={user}
          books={books}
          preselectedBook={pendingMoment.book}
          prefilledType="update"
          prefilledPageRef={pendingMoment.pct || pendingMoment.page || null}
          onClose={() => setPendingMoment(null)}
          onPosted={() => setPendingMoment(null)}
        />
      )}
    </div>
  )
}