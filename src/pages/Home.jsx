import { useState } from 'react'
import { useBooksContext } from '../context/BooksContext'
import { useSocialContext } from '../context/SocialContext'
import { useChatContext } from '../context/ChatContext'
import { useAuthContext } from '../context/AuthContext'
import { avatarColour, avatarInitial, fmtDate, GENRE_COLOURS, loadGoal, saveGoal } from '../lib/utils'
import CoverImage from '../components/books/CoverImage'
import BookDetailPanel from '../components/books/BookDetailPanel'
import AddBookModal from '../components/books/AddBookModal'
import BookSheet, { FinishModal } from '../components/books/BookSheet'

export default function Home({ onNavigate, onOpenChatModal }) {
  const { user } = useAuthContext()
  const { books, addBook, updateBook } = useBooksContext()
  const { friends, feed, recs, loaded: socialLoaded, myDisplayName } = useSocialContext()
  const { chats, startOrOpenChat } = useChatContext()

  const [goal, setGoal]                     = useState(loadGoal)
  const [detailBook, setDetailBook]         = useState(null)
  const [detailLocation, setDetailLocation] = useState(null)
  const [finishBook, setFinishBook]         = useState(null)
  const [addModal, setAddModal]             = useState(false)

  const year     = new Date().getFullYear()
  const read     = books.filter(b => b.status === 'read')
  const thisYear = read.filter(b => b.dateRead && b.dateRead.startsWith(String(year)))
  const pct      = Math.min(100, Math.round((thisYear.length / Math.max(goal, 1)) * 100))
  const reading  = books.filter(b => b.status === 'reading')
    .sort((a, b) => new Date(b.dateStarted || b.added || 0) - new Date(a.dateStarted || a.added || 0))
  const pendingRecs    = (recs || []).filter(r => r.status === 'pending')
  const fiveStarBooks  = read.filter(b => b.rating === 5)

  // Friends' user IDs — for filtering feed to friends only, not self
  const friendIds = new Set((friends || []).map(f => f.userId))

  // Genre pie data
  const genreMap = {}
  thisYear.forEach(b => { if (b.genre) genreMap[b.genre] = (genreMap[b.genre] || 0) + 1 })
  const genreEntries = Object.entries(genreMap).sort((a, b) => b[1] - a[1]).slice(0, 6)
  const genreTotal   = genreEntries.reduce((s, [, n]) => s + n, 0)

  function buildPie() {
    const R = 44, CX = 50, CY = 50
    let angle = -Math.PI / 2
    return genreEntries.map(([, count], i) => {
      const slice = (count / genreTotal) * 2 * Math.PI
      const x1 = CX + R * Math.cos(angle), y1 = CY + R * Math.sin(angle)
      angle += slice
      const x2 = CX + R * Math.cos(angle), y2 = CY + R * Math.sin(angle)
      const large = slice > Math.PI ? 1 : 0
      const colour = GENRE_COLOURS[i % GENRE_COLOURS.length]
      if (genreEntries.length === 1) return <circle key={i} cx={CX} cy={CY} r={R} fill={colour} />
      return <path key={i} d={`M${CX},${CY} L${x1.toFixed(1)},${y1.toFixed(1)} A${R},${R} 0 ${large},1 ${x2.toFixed(1)},${y2.toFixed(1)} Z`} fill={colour} />
    })
  }

  // Feed: deduplicate — prefer posted_review over finished for same user+book
  const reviewEvents = (() => {
    const all = (feed || []).filter(ev =>
      friendIds.has(ev.user_id) &&
      (ev.event_type === 'posted_review' || ev.event_type === 'finished')
    )
    const seen = new Map()
    for (const ev of all) {
      const key = `${ev.user_id}__${ev.book_ol_key}`
      const existing = seen.get(key)
      if (!existing) { seen.set(key, ev); continue }
      // prefer posted_review over finished
      if (ev.event_type === 'posted_review') seen.set(key, ev)
    }
    return [...seen.values()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  })()

  function findExistingChat(olKey) {
    if (!olKey || !chats) return null
    return chats.find(c => c.bookOlKey === olKey) || null
  }

  function openDetail(book, location) { setDetailBook(book); setDetailLocation(location) }

  const showGenreBlock = genreEntries.length > 0

  return (
    <div className="rt-page" style={{ maxWidth: 760, margin: '0 auto' }}>

      {/* ── Welcome header ── */}
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.6rem', fontWeight: 700, color: 'var(--rt-navy)', margin: '0 0 0.1rem' }}>
          Welcome back{myDisplayName ? `, ${myDisplayName}` : ''}
        </h2>
      </div>

      {/* ── Reading goal card ── */}
      <div className="rt-stat-card rt-stat-goal" style={{ marginBottom: '1rem' }}>
        <div className="rt-stat-label">Reading goal {year}</div>
        <div className="rt-goal-display">
          <span className="rt-goal-current">{thisYear.length}</span>
          <span className="rt-goal-sep">/</span>
          <input type="number" className="rt-goal-input" value={goal} min="1" max="365"
            onChange={e => { const v = parseInt(e.target.value) || 12; setGoal(v); saveGoal(v) }} />
          <span className="rt-goal-unit">books</span>
        </div>
        <div className="rt-goal-bar-wrap">
          <div className="rt-goal-bar"><div className="rt-goal-fill" style={{ width: pct + '%' }} /></div>
          <span className="rt-goal-pct">{pct}%</span>
        </div>
      </div>

      {/* ── Stats: favourites 1/3 + genre donut 2/3 ── */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>

        {/* Favourites — 1/3 */}
        <div className="rt-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '0.85rem 0.5rem', minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.8rem', fontWeight: 700, color: 'var(--rt-navy)', lineHeight: 1 }}>{fiveStarBooks.length}</div>
          <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginTop: '0.3rem', textAlign: 'center' }}>favourites</div>
          <div style={{ fontSize: '0.6rem', color: 'var(--rt-t3)', marginTop: '0.15rem', textAlign: 'center' }}>{read.length} read total</div>
        </div>

        {/* Genre donut — 2/3 */}
        {showGenreBlock ? (
          <div className="rt-card" style={{ flex: 2, minWidth: 0, padding: '0.85rem 1rem' }}>
            <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.6rem' }}>Genres {year}</div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <svg width="72" height="72" viewBox="0 0 100 100" style={{ flexShrink: 0 }} aria-hidden="true">
                {buildPie()}
                <circle cx="50" cy="50" r="20" fill="white" />
                <text x="50" y="51" textAnchor="middle" dominantBaseline="middle" fontSize="11" fontWeight="700" fill="#1a2744">{genreTotal}</text>
              </svg>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                {genreEntries.slice(0, 4).map(([genre, count], i) => (
                  <div key={genre} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: GENRE_COLOURS[i % GENRE_COLOURS.length], flexShrink: 0 }} />
                    <span style={{ fontSize: '0.7rem', color: 'var(--rt-navy)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{genre}</span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--rt-t3)', fontWeight: 600 }}>{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="rt-card" style={{ flex: 2, minWidth: 0, padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>📚</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)' }}>Finish some books to see your genres</div>
            </div>
          </div>
        )}
      </div>

      {/* ── Currently Reading + notification row ── */}
      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <div className="rt-section-heading" style={{ margin: 0 }}>Currently Reading</div>
          <button onClick={() => setAddModal(true)} style={{ background: 'var(--rt-amber-pale)', border: 'none', borderRadius: 99, padding: '0.25rem 0.75rem', fontSize: '0.7rem', fontWeight: 700, color: 'var(--rt-amber)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ fontSize: '0.9rem', lineHeight: 1 }}>+</span> Add Book
          </button>
        </div>

        {reading.length === 0 ? (
          <div className="rt-card" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem 1rem', color: 'var(--rt-t3)', fontSize: '0.85rem' }}>
            <span style={{ fontSize: '1.3rem' }}>📖</span>
            <span>Nothing on the go — add a book to get started.</span>
          </div>
        ) : reading.length === 1 ? (
          <div className="rt-card" style={{ display: 'flex', gap: '0.85rem', alignItems: 'center', cursor: 'pointer' }}
            onClick={() => openDetail(reading[0], 'home-reading')}>
            <CoverImage coverId={reading[0].coverId} olKey={reading[0].olKey} title={reading[0].title} size="M" />
            <div className="rt-reading-card-body">
              <div className="rt-reading-badge">Currently reading</div>
              <div className="rt-reading-title">{reading[0].title}</div>
              {reading[0].author && <div className="rt-reading-author">{reading[0].author}</div>}
              {reading[0].dateStarted && <div className="rt-reading-meta">Started {fmtDate(reading[0].dateStarted)}</div>}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', paddingBottom: '0.5rem', scrollbarWidth: 'none' }}>
            {reading.map(book => (
              <div key={book.id}
                onClick={() => openDetail(book, 'home-reading')}
                style={{ flexShrink: 0, width: 130, background: 'var(--rt-white)', borderRadius: 'var(--rt-r3)', border: '1px solid var(--rt-border)', padding: '0.7rem', cursor: 'pointer', boxShadow: 'var(--rt-s1)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: 72, height: 104, borderRadius: 6, overflow: 'hidden', background: 'var(--rt-surface)', flexShrink: 0 }}>
                  {book.coverId
                    ? <img src={`https://covers.openlibrary.org/b/id/${book.coverId}-M.jpg`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                    : book.olKey
                      ? <img src={`https://covers.openlibrary.org/b/olid/${book.olKey.replace('/works/','')}-M.jpg`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" onError={e => e.target.style.display='none'} />
                      : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>📚</div>
                  }
                </div>
                <div style={{ width: '100%' }}>
                  <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.75rem', fontWeight: 700, color: 'var(--rt-navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>{book.title}</div>
                  {book.author && <div style={{ fontSize: '0.62rem', color: 'var(--rt-t3)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{book.author}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
            {/* ── Notification strips ── */}
      {user && (
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <button onClick={() => onNavigate('chat')} className="rt-notif-strip-btn">
            <div className="rt-notif-strip-label">Messages</div>
            <div className="rt-notif-strip-val" style={{ color: 'var(--rt-t2)' }}>Go to Chat</div>
          </button>
          <button onClick={() => onNavigate('discover')} className="rt-notif-strip-btn">
            <div className="rt-notif-strip-label">Recommendations</div>
            <div className="rt-notif-strip-val" style={{ color: pendingRecs.length > 0 ? 'var(--rt-amber)' : 'var(--rt-t2)' }}>
              {pendingRecs.length > 0 ? `${pendingRecs.length} new` : 'Discover books'}
            </div>
          </button>
        </div>
      )}

      {/* ── Recently Read carousel ── */}
      {read.length > 0 && (
        <div className="rt-card" style={{ marginBottom: '1.25rem', padding: '1rem 1rem 0.75rem' }}>
          <div className="rt-section-heading" style={{ marginBottom: '0.75rem' }}>Recently Read</div>
          <div style={{ display: 'flex', gap: '0.85rem', overflowX: 'auto', paddingBottom: '0.5rem', scrollbarWidth: 'none', msOverflowStyle: 'none' }} className="rt-recent-carousel">
            {[...read]
              .sort((a, b) => new Date(b.dateRead || b.added || 0) - new Date(a.dateRead || a.added || 0))
              .slice(0, 10)
              .map(book => (
                <div key={book.id} onClick={() => openDetail(book, 'mylist-history')} style={{ cursor: 'pointer', flexShrink: 0, width: 64 }}>
                  <div style={{ width: 64, height: 90, borderRadius: 6, overflow: 'hidden', boxShadow: '0 2px 8px rgba(26,39,68,0.13)' }}>
                    <CoverImage coverId={book.coverId} olKey={book.olKey} title={book.title} size="S" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <div style={{ fontSize: '0.6rem', color: 'var(--rt-t2)', marginTop: '0.35rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 64, lineHeight: 1.3, fontWeight: 500 }}>{book.title}</div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ── Friends' Reviews ── */}
      {user && (
        <div className="rt-card" style={{ marginBottom: '1.25rem' }}>
          <div className="rt-section-heading" style={{ marginBottom: '0.85rem' }}>Friends' Reviews</div>
          {!socialLoaded ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--rt-t3)', fontSize: '0.85rem' }}>Loading…</div>
          ) : reviewEvents.length === 0 ? (
            <div className="rt-feed-empty">
              <div className="rt-feed-empty-icon">📖</div>
              <p>{friends.length === 0 ? 'Add friends to see their reviews here.' : 'No reviews from friends yet.'}</p>
            </div>
          ) : (
            reviewEvents.slice(0, 10).map(ev => {
              const profile     = ev.profiles || null
              const username    = profile?.username    || profile?.display_name || 'friend'
              const displayName = profile?.display_name || profile?.username    || 'friend'
              const colour      = avatarColour(ev.user_id)
              const init        = avatarInitial(displayName)
              const rating      = ev.rating || 0
              const stars       = rating ? '★'.repeat(rating) + '☆'.repeat(5 - rating) : ''
              const reviewText  = ev.review_body || ''
              const coverId     = ev.cover_id || null
              const olKey       = ev.book_ol_key || null

              const feedBook = {
                id: ev.id, title: ev.book_title || 'Unknown book',
                author: ev.book_author || '', coverId, olKey,
                status: null, rating, reviewBody: reviewText,
                friendName: displayName, friendUserId: ev.user_id,
              }

              return (
                <div key={ev.id} onClick={() => openDetail(feedBook, 'home-feed')}
                  style={{ display: 'flex', gap: '0.9rem', padding: '0.9rem 0', borderBottom: '1px solid var(--rt-border)', cursor: 'pointer' }}>
                  <div style={{ width: 52, height: 74, borderRadius: 7, overflow: 'hidden', flexShrink: 0, background: 'var(--rt-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(26,39,68,0.12)' }}>
                    {coverId ? (
                      <img src={`https://covers.openlibrary.org/b/id/${coverId}-S.jpg`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} alt={ev.book_title || ''} loading="lazy" onError={e => { e.target.style.display = 'none'; e.target.parentElement.innerHTML = '<span style="font-size:1.4rem">📖</span>' }} />
                    ) : olKey ? (
                      <img src={`https://covers.openlibrary.org/b/olid/${olKey.replace('/works/', '')}-S.jpg`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} alt={ev.book_title || ''} loading="lazy" onError={e => { e.target.style.display = 'none'; e.target.parentElement.innerHTML = '<span style="font-size:1.4rem">📖</span>' }} />
                    ) : (
                      <span style={{ fontSize: '1.4rem' }}>📖</span>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem' }}>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', background: colour, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.55rem', fontWeight: 700, color: '#fff', flexShrink: 0 }}>{init}</div>
                      <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--rt-t2)' }}>{displayName}{username !== displayName ? ` · @${username}` : ''}</span>
                    </div>
                    <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.9rem', fontWeight: 700, color: 'var(--rt-navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '0.15rem' }}>{ev.book_title || 'Unknown book'}</div>
                    {ev.book_author && <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)', marginBottom: '0.25rem' }}>{ev.book_author}</div>}
                    {stars && <div style={{ fontSize: '0.88rem', color: 'var(--rt-amber)', letterSpacing: '0.5px', marginBottom: '0.3rem' }}>{stars}</div>}
                    {reviewText ? (
                      <div style={{ fontSize: '0.82rem', color: 'var(--rt-t2)', lineHeight: 1.55, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{reviewText}</div>
                    ) : (
                      <div style={{ fontSize: '0.75rem', color: 'var(--rt-t3)', fontStyle: 'italic' }}>finished reading</div>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ── Modals ── */}
      {detailBook && (
        <BookDetailPanel
          book={detailBook}
          location={detailLocation}
          user={user}
          existingChatId={findExistingChat(detailBook.olKey)?.id}
          friendName={detailBook.friendName || null}
          onClose={() => setDetailBook(null)}
          onMarkFinished={() => { setFinishBook(detailBook); setDetailBook(null) }}
          onStartReading={() => { updateBook(detailBook.id, { status: 'reading', dateStarted: new Date().toISOString().split('T')[0] }); setDetailBook(null) }}
          onEdit={() => { setDetailBook(null) }}
          onRecommend={() => setDetailBook(null)}
          onAddToTBR={() => { addBook({ title: detailBook.title, author: detailBook.author, status: 'tbr', olKey: detailBook.olKey, coverId: detailBook.coverId }); setDetailBook(null) }}
          onOpenChatModal={(chatId, book) => onOpenChatModal?.(chatId, book || detailBook)}
          onStartChat={() => onOpenChatModal?.(null, detailBook)}
          onViewChat={(chatId) => onOpenChatModal?.(chatId || findExistingChat(detailBook.olKey)?.id)}
        />
      )}

      {finishBook && (
        <FinishModal
          book={finishBook}
          user={user}
          onClose={() => setFinishBook(null)}
          onSaved={changes => { const id = finishBook?.id; if (id) updateBook(id, changes); setFinishBook(null) }}
        />
      )}

      {addModal && (
        <AddBookModal
          defaultStatus="reading"
          books={books}
          onAdd={async d => { await addBook(d); setAddModal(false) }}
          onClose={() => setAddModal(false)}
          user={user}
        />
      )}
    </div>
  )
}