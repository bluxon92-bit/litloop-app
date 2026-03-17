import React, { useState, useEffect, useRef } from 'react'
import { sb } from '../lib/supabase'
import { useBooksContext } from '../context/BooksContext'
import { useSocialContext } from '../context/SocialContext'
import { useChatContext } from '../context/ChatContext'
import { useAuthContext } from '../context/AuthContext'
import { avatarColour, avatarInitial, fmtDate, GENRE_COLOURS, loadGoal, saveGoal } from '../lib/utils'
import CoverImage from '../components/books/CoverImage'
import BookDetailPanel from '../components/books/BookDetailPanel'
import AddBookModal from '../components/books/AddBookModal'
import BookSheet, { FinishModal } from '../components/books/BookSheet'
import ReviewThreadSheet from '../components/ReviewThreadSheet'
import { IcoOpenBook } from '../components/icons'
import MomentComposer from '../components/MomentComposer'

// ── Engagement bar — likes + comments ─────────────────────────
function SpoilerBody({ isSpoiler, isItalic, barCol = 'var(--rt-navy)', onClick, children }) {
  const [revealed, setRevealed] = React.useState(false)
  const showBlur = isSpoiler && !revealed
  return (
    <div
      onClick={showBlur ? e => { e.stopPropagation(); setRevealed(true) } : onClick}
      style={{ borderLeft: `3px solid ${barCol}`, paddingLeft: '0.5rem', cursor: 'pointer', position: 'relative' }}
    >
      <p style={{
        fontSize: '0.82rem', color: 'var(--rt-navy)', lineHeight: 1.6, margin: 0,
        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        fontStyle: isItalic ? 'italic' : 'normal', fontFamily: isItalic ? 'Georgia, serif' : 'inherit',
        filter: showBlur ? 'blur(4px)' : 'none', userSelect: showBlur ? 'none' : 'auto', transition: 'filter 0.2s',
      }}>
        {children}
      </p>
      {showBlur && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--rt-t3)', background: 'var(--rt-white)', border: '1px solid var(--rt-border)', borderRadius: 99, padding: '0.15em 0.6em', letterSpacing: '0.04em' }}>
            ⚠ Spoiler — tap to reveal
          </span>
        </div>
      )}
    </div>
  )
}

function FeedEngagementBar({ entryId, user, onOpenThread }) {
  const [likes, setLikes]     = useState([])
  const [commentCount, setCommentCount] = useState(0)
  const [liking, setLiking]   = useState(false)

  useEffect(() => {
    if (!entryId) return
    // Fetch like count + own like
    sb.from('review_likes').select('id, user_id').eq('entry_id', entryId)
      .then(({ data }) => setLikes(data || []))
    // Fetch comment count
    sb.from('review_comments').select('id', { count: 'exact', head: true }).eq('entry_id', entryId)
      .then(({ count }) => setCommentCount(count || 0))
  }, [entryId])

  const myLike = likes.find(l => l.user_id === user?.id)

  async function toggleLike(e) {
    e.stopPropagation()
    if (!user || liking) return
    setLiking(true)
    if (myLike) {
      await sb.from('review_likes').delete().eq('id', myLike.id)
      setLikes(prev => prev.filter(l => l.id !== myLike.id))
    } else {
      const { data } = await sb.from('review_likes')
        .insert({ entry_id: entryId, user_id: user.id })
        .select('id, user_id').single()
      if (data) setLikes(prev => [...prev, data])
    }
    setLiking(false)
  }
  const engageBtnStyle = (active) => ({
    display: 'flex', alignItems: 'center', gap: '0.3rem',
    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
    color: active ? '#C84B4B' : 'var(--rt-t3)',
    fontSize: '0.82rem', fontWeight: 500,
  })
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
      <button onClick={toggleLike} disabled={liking} style={engageBtnStyle(!!myLike)}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill={myLike ? '#C84B4B' : 'none'} stroke={myLike ? '#C84B4B' : 'currentColor'} strokeWidth="1.8">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
        <span>{likes.length > 0 ? likes.length : 'Like'}</span>
      </button>
      <button onClick={e => { e.stopPropagation(); onOpenThread() }} style={engageBtnStyle(false)}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <span>{commentCount > 0 ? commentCount : 'Comment'}</span>
      </button>
    </div>
  )
}

export default function Home({ onNavigate, onOpenChatModal, onViewFriendProfile }) {
  const { user } = useAuthContext()
  const { books, addBook, updateBook, deleteBook, findDuplicate } = useBooksContext()
  const { friends, feed, recs, loaded: socialLoaded, myDisplayName, myAvatarUrl, sendFriendRequest } = useSocialContext()
  const { chats, totalUnread, startOrOpenChat } = useChatContext()

  const [goal, setGoal]                     = useState(loadGoal)
  const [detailBook, setDetailBook]         = useState(null)
  const [activeReview, setActiveReview]     = useState(null) // review thread sheet
  const [detailLocation, setDetailLocation] = useState(null)
  const [finishBook, setFinishBook]         = useState(null)
  const [editBook, setEditBook]             = useState(null)
  const [addModal, setAddModal]             = useState(false)
  const [crCarouselIdx, setCrCarouselIdx]   = useState(0)
  const [toast, setToast]                   = useState(null)
  const [feedLimit, setFeedLimit]           = useState(10)
  const [pendingMoment, setPendingMoment]   = useState(null) // { book, page, total }
  const toastTimer                          = useRef(null)

  useEffect(() => {
    if (!toast) return
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(toastTimer.current)
  }, [toast])

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

  // Feed: moments pass through unfiltered; reviews deduplicate (prefer posted_review over finished)
  const reviewEvents = (() => {
    const moments = (feed || []).filter(ev =>
      friendIds.has(ev.user_id) && ev.event_type === 'book_moment'
    )
    const reviews = (feed || []).filter(ev =>
      friendIds.has(ev.user_id) &&
      (ev.event_type === 'posted_review' || ev.event_type === 'finished')
    )
    const seen = new Map()
    for (const ev of reviews) {
      const key = `${ev.user_id}__${ev.book_ol_key}`
      const existing = seen.get(key)
      if (!existing) { seen.set(key, ev); continue }
      if (ev.event_type === 'posted_review') seen.set(key, ev)
    }
    const deduped = [...seen.values()]
    return [...moments, ...deduped].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
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
          Hi {myDisplayName || 'there'},
        </h2>
      </div>

      {/* ── Reading goal card ── */}
      <div className="rt-stat-card rt-stat-goal" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="rt-stat-label">Reading goal {year}</div>
          <button onClick={() => onNavigate?.('stats')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '0.7rem', fontWeight: 600, color: 'var(--rt-amber)', letterSpacing: '0.01em' }}>View stats →</button>
        </div>
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
            <IcoOpenBook size={22} color="var(--rt-t3)" />
            <span>Nothing on the go — add a book to get started.</span>
          </div>
        ) : (
          <div>
            {/* Full-width snap carousel — each card fills the width, multi peeks next */}
            <div
              className="rt-cr-carousel"
              style={{ display: 'flex', gap: '0.75rem' }}
              onScroll={e => {
                const w = e.currentTarget.firstChild?.offsetWidth || e.currentTarget.offsetWidth
                if (w) setCrCarouselIdx(Math.round(e.currentTarget.scrollLeft / (w + 12)))
              }}
            >
              {reading.map(book => (
                <div key={book.id}
                  onClick={() => openDetail(book, 'home-reading')}
                  style={{
                    flexShrink: 0,
                    /* Single book: fill container. Multiple: show ~85% so next card peeks */
                    width: reading.length === 1 ? '100%' : '85%',
                    scrollSnapAlign: 'start',
                    background: 'var(--rt-white)', borderRadius: 'var(--rt-r3)',
                    border: '1px solid var(--rt-border)', padding: '0.9rem 1rem',
                    boxShadow: 'var(--rt-s1)', display: 'flex', gap: '0.85rem',
                    alignItems: 'center', cursor: 'pointer', boxSizing: 'border-box'
                  }}>
                  <div style={{ width: 64, height: 92, borderRadius: 6, overflow: 'hidden', flexShrink: 0, boxShadow: '0 2px 8px rgba(26,39,68,0.15)' }}>
                    <CoverImage coverId={book.coverId} olKey={book.olKey} title={book.title} size="M" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
      </div>
      
            {/* ── Notification strips ── */}
      {user && (
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <button onClick={() => onNavigate('chat')} className="rt-notif-strip-btn">
            <div className="rt-notif-strip-label">Messages</div>
            <div className="rt-notif-strip-val" style={{ color: totalUnread > 0 ? 'var(--rt-amber)' : 'var(--rt-t2)' }}>
              {totalUnread > 0 ? `${totalUnread} unread` : 'No new messages'}
            </div>
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
        <>
          <div className="rt-section-heading" style={{ marginBottom: '0.75rem' }}>Recently Read</div>
          <div className="rt-card" style={{ marginBottom: '1.25rem', padding: '1rem 1rem 0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.85rem', overflowX: 'auto', paddingBottom: '0.5rem', scrollbarWidth: 'none', msOverflowStyle: 'none' }} className="rt-recent-carousel">
            {[...read]
              .sort((a, b) => new Date(b.dateRead || b.added || 0) - new Date(a.dateRead || a.added || 0))
              .slice(0, 10)
              .map(book => (
                <div key={book.id} onClick={() => openDetail(book, 'mylist-history')} style={{ cursor: 'pointer', flexShrink: 0, width: 80 }}>
                  <div style={{ width: 80, height: 116, borderRadius: 6, overflow: 'hidden', boxShadow: '0 2px 8px rgba(26,39,68,0.13)' }}>
                    <CoverImage coverId={book.coverId} olKey={book.olKey} title={book.title} size="L" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <div style={{ fontSize: '0.6rem', color: 'var(--rt-t2)', marginTop: '0.35rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 80, lineHeight: 1.3, fontWeight: 500 }}>{book.title}</div>
                </div>
              ))}
          </div>
        </div>
        </>
      )}

      {/* ── Friend's Feed ── */}
      {user && (
        <div style={{ marginBottom: '1.25rem' }}>
          <div className="rt-section-heading" style={{ marginBottom: '0.85rem' }}>Friend's Feed</div>
          {!socialLoaded ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--rt-t3)', fontSize: '0.85rem' }}>Loading…</div>
          ) : reviewEvents.length === 0 ? (
            <div className="rt-feed-empty">
              <div className="rt-feed-empty-icon"><IcoOpenBook size={32} color="var(--rt-t3)" /></div>
              <p>{friends.length === 0 ? 'Add friends to see their posts here.' : 'Nothing from friends yet.'}</p>
            </div>
          ) : (
            <>
            {reviewEvents.slice(0, feedLimit).map(ev => {
              const profile     = ev.profiles || null
              const username    = profile?.username    || profile?.display_name || 'friend'
              const displayName = profile?.display_name || profile?.username    || 'friend'
              const avatarUrl   = profile?.avatar_url   || null
              const colour      = avatarColour(ev.user_id)
              const init        = avatarInitial(displayName)
              const rating      = ev.rating || 0
              const stars       = rating ? '★'.repeat(rating) + '☆'.repeat(5 - rating) : ''
              const reviewText  = ev.review_body || ''
              const coverId     = ev.cover_id || null
              const olKey       = ev.book_ol_key || null
              const isDnfEvent  = ev.status === 'dnf'
              const isSpoiler   = !!ev.spoiler_warning
              const dateStr     = ev.created_at ? new Date(ev.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''
              const cardStyle = { background: 'var(--rt-white)', border: '1px solid var(--rt-border)', borderRadius: 12, padding: '0.75rem', marginBottom: '0.65rem' }
              const coverEl = (
                <div style={{ width: 80, height: 116, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: 'var(--rt-surface)', boxShadow: '0 2px 8px rgba(26,39,68,0.13)' }}>
                  <CoverImage coverId={coverId} olKey={olKey} title={ev.book_title || ''} size="M" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              )
              const avatarEl = (
                <div style={{ width: 18, height: 18, borderRadius: '50%', background: colour, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.5rem', fontWeight: 700, color: '#fff', flexShrink: 0, overflow: 'hidden' }}>
                  {avatarUrl ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : init}
                </div>
              )
              const usernameEl = (
                <span
                  onClick={e => { e.stopPropagation(); onViewFriendProfile?.({ userId: ev.user_id, displayName, username, avatarUrl }) }}
                  style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--rt-t2)', cursor: onViewFriendProfile ? 'pointer' : 'default', textDecoration: onViewFriendProfile ? 'underline' : 'none', textUnderlineOffset: 2 }}>
                  {displayName}
                </span>
              )

              // ── Moment card ──────────────────────────────
              if (ev.event_type === 'book_moment' && ev.moment_id) {
                const isQuote  = ev.moment_type === 'quote'
                const barCol   = isQuote ? 'var(--rt-amber)' : 'var(--rt-teal)'
                const badgeBg  = isQuote ? 'var(--rt-amber-pale)' : '#e1f5ee'
                const badgeCol = isQuote ? 'var(--rt-amber-text)' : '#085041'
                const badgeTxt = isQuote ? 'Quote' : 'Reading update'
                const openThread = () => setActiveReview({ entryId: ev.moment_id, bookTitle: ev.book_title, bookAuthor: ev.book_author, coverId, olKey, reviewBody: ev.moment_body, rating: null, reviewedAt: ev.created_at, reviewer: { userId: ev.user_id, displayName, username, avatarUrl } })
                return (
                  <div key={ev.id} style={cardStyle}>
                    {/* Top row: badge · avatar username · date */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
                      <span style={{ background: badgeBg, color: badgeCol, borderRadius: 99, padding: '0.15em 0.55em', fontSize: '0.65rem', fontWeight: 700 }}>
                        {badgeTxt}{ev.page_ref ? ` · ${ev.page_ref}%` : ''}
                      </span>
                      <span style={{ fontSize: '0.65rem', color: 'var(--rt-t3)' }}>·</span>
                      {avatarEl}
                      {usernameEl}
                      <span style={{ fontSize: '0.65rem', color: 'var(--rt-t3)', marginLeft: 'auto' }}>{dateStr}</span>
                    </div>
                    {/* Book row: cover centred with meta */}
                    <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', marginBottom: '0.6rem' }}>
                      {coverEl}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.88rem', fontWeight: 700, color: 'var(--rt-navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '0.15rem' }}>{ev.book_title || ''}</div>
                        {ev.book_author && <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)', marginBottom: '0.5rem' }}>{ev.book_author}</div>}
                        <SpoilerBody isSpoiler={isSpoiler} isItalic={isQuote} barCol={barCol} onClick={openThread}>
                          {ev.moment_body}
                        </SpoilerBody>
                      </div>
                    </div>
                    <div style={{ height: '0.5px', background: 'var(--rt-border)', marginBottom: '0.5rem' }} />
                    <FeedEngagementBar entryId={ev.moment_id} user={user} onOpenThread={openThread} />
                  </div>
                )
              }

              // ── Review / DNF card ────────────────────────
              const feedBook = {
                id: ev.id, title: ev.book_title || 'Unknown book',
                author: ev.book_author || '', coverId, olKey,
                status: null, rating, reviewBody: reviewText,
                friendName: displayName, friendUserId: ev.user_id,
              }

              if (!reviewText && !isDnfEvent) return null

              const openReview = () => setActiveReview({ entryId: ev.id, bookTitle: ev.book_title, bookAuthor: ev.book_author, coverId, olKey, reviewBody: reviewText, rating, reviewedAt: ev.created_at, reviewer: { userId: ev.user_id, displayName, username, avatarUrl } })

              return (
                <div key={ev.id} style={cardStyle}>
                  {/* Top row: stars/dnf · avatar username · date */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
                    {isDnfEvent
                      ? <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', background: '#fee2e2', color: '#991b1b', borderRadius: 4, padding: '0.15em 0.5em' }}>Did not finish</span>
                      : stars && <span style={{ fontSize: '0.82rem', color: 'var(--rt-amber)', letterSpacing: '0.5px' }}>{stars}</span>
                    }
                    <span style={{ fontSize: '0.65rem', color: 'var(--rt-t3)' }}>·</span>
                    {avatarEl}
                    {usernameEl}
                    <span style={{ fontSize: '0.65rem', color: 'var(--rt-t3)', marginLeft: 'auto' }}>{dateStr}</span>
                  </div>
                  {/* Book row: cover centred with meta */}
                  <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', marginBottom: reviewText ? '0.6rem' : 0 }}
                    onClick={() => openDetail(feedBook, 'home-feed')}>
                    {coverEl}
                    <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
                      <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.88rem', fontWeight: 700, color: 'var(--rt-navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '0.15rem' }}>{ev.book_title || 'Unknown book'}</div>
                      {ev.book_author && <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)', marginBottom: '0.5rem' }}>{ev.book_author}</div>}
                      {reviewText && (
                        <SpoilerBody isSpoiler={isSpoiler} barCol="var(--rt-navy)" onClick={e => { e.stopPropagation(); openReview() }}>
                          {reviewText}
                        </SpoilerBody>
                      )}
                    </div>
                  </div>
                  {reviewText && (
                    <>
                      <div style={{ height: '0.5px', background: 'var(--rt-border)', marginBottom: '0.5rem' }} />
                      <FeedEngagementBar entryId={ev.id} user={user} onOpenThread={openReview} />
                    </>
                  )}
                </div>
              )
            })}
            {reviewEvents.length > feedLimit && (
              <button
                onClick={() => setFeedLimit(n => n + 10)}
                style={{ display: 'block', width: '100%', background: 'none', border: '1px solid var(--rt-border-md)', borderRadius: 99, padding: '0.55rem', fontSize: '0.82rem', color: 'var(--rt-t2)', cursor: 'pointer', marginTop: '0.25rem' }}
              >
                Load more
              </button>
            )}
            </>
          )}
        </div>
      )}

      {/* ── Modals ── */}
      {activeReview && (
        <ReviewThreadSheet
          review={activeReview}
          user={user}
          friends={friends}
          chats={chats}
          myAvatarUrl={myAvatarUrl}
          myDisplayName={myDisplayName}
          onClose={() => setActiveReview(null)}
          onAddToTBR={() => {
            const dup = findDuplicate(activeReview.bookTitle, activeReview.bookAuthor)
            if (dup) {
              const label = dup.status === 'tbr' ? 'your To Read list' : dup.status === 'reading' ? 'Currently Reading' : dup.status === 'read' ? 'your History' : 'your list'
              setToast(`"${dup.title}" is already in ${label}`)
              setActiveReview(null)
              return
            }
            addBook({ title: activeReview.bookTitle, author: activeReview.bookAuthor, status: 'tbr', olKey: activeReview.olKey, coverId: activeReview.coverId })
            setActiveReview(null)
            setToast(`Added "${activeReview.bookTitle}" to your list`)
          }}
          onStartChat={async () => {
            const r = activeReview
            setActiveReview(null)
            const chatId = await startOrOpenChat(r.olKey, r.bookTitle, r.bookAuthor, r.coverId, [r.reviewer.userId])
            if (chatId) onOpenChatModal(chatId, { title: r.bookTitle, author: r.bookAuthor, coverId: r.coverId, olKey: r.olKey })
          }}
          onViewChat={chatId => {
            const c = chats.find(x => x.id === chatId)
            if (c) onOpenChatModal(c, { title: activeReview.bookTitle })
            setActiveReview(null)
          }}
          onViewProfile={f => { setActiveReview(null); onViewFriendProfile?.(f) }}
          onAddFriend={f => sendFriendRequest(f.username || f.userId)}
        />
      )}
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
          onEdit={(mode) => { setEditBook({ ...detailBook, _initialMode: mode || 'view' }); setDetailBook(null) }}
          onRecommend={() => setDetailBook(null)}
          onAddToTBR={() => {
            const dup = findDuplicate(detailBook.title, detailBook.author)
            if (dup) {
              if (dup.status === 'tbr' || dup.status === 'reading') {
                const label = dup.status === 'tbr' ? 'your To Read list' : 'Currently Reading'
                alert(`"${dup.title}" is already in ${label}.`)
                return
              }
              if (!window.confirm(`You've already read "${dup.title}". Add it again as a reread?`)) return
            }
            addBook({ title: detailBook.title, author: detailBook.author, status: 'tbr', olKey: detailBook.olKey, coverId: detailBook.coverId })
            setDetailBook(null)
          }}
          onOpenChatModal={(chatId, book) => onOpenChatModal?.(chatId, book || detailBook)}
          onStartChat={() => onOpenChatModal?.(null, detailBook)}
          onViewChat={(chatId) => onOpenChatModal?.(chatId || findExistingChat(detailBook.olKey)?.id)}
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

      {finishBook && (
        <FinishModal
          book={finishBook}
          user={user}
          onClose={() => setFinishBook(null)}
          onSaved={changes => { const id = finishBook?.id; if (id) updateBook(id, changes); setFinishBook(null) }}
        />
      )}

      {editBook && (
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
          defaultStatus="reading"
          books={books}
          onAdd={async d => { await addBook(d); setAddModal(false) }}
          onClose={() => setAddModal(false)}
          user={user}
        />
      )}

      {/* ── Toast notification ── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '5rem', left: '50%', transform: 'translateX(-50%)',
          background: 'var(--rt-navy)', color: '#fff', borderRadius: 99,
          padding: '0.55rem 1.1rem', fontSize: '0.82rem', fontWeight: 600,
          boxShadow: '0 4px 16px rgba(0,0,0,0.25)', zIndex: 9999,
          whiteSpace: 'nowrap', pointerEvents: 'none',
          animation: 'rt-fadein 0.15s ease',
        }}>
          {toast}
        </div>
      )}

      {/* ── Moment composer — triggered from log progress ── */}
      {pendingMoment && (
        <MomentComposer
          user={user}
          books={books}
          preselectedBook={pendingMoment.book}
          prefilledType="update"
          prefilledPageRef={pendingMoment.pct || pendingMoment.page || null}
          onClose={() => setPendingMoment(null)}
          onPosted={() => { setPendingMoment(null); loadSocialData() }}
        />
      )}
    </div>
  )
}