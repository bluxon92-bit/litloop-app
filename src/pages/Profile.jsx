import { useState, useEffect, useRef } from 'react'
import { sb } from '../lib/supabase'
import { useBooksContext } from '../context/BooksContext'
import { useSocialContext } from '../context/SocialContext'
import { useAuthContext } from '../context/AuthContext'
import { fmtDate, avatarColour, avatarInitial } from '../lib/utils'
import { ModalShell } from '../components/books/BookSheet'
import BookSheet, { FinishModal } from '../components/books/BookSheet'
import CoverImage from '../components/books/CoverImage'
import BookDetailPanel from '../components/books/BookDetailPanel'
import ReviewThreadSheet from '../components/ReviewThreadSheet'
import MomentComposer from '../components/MomentComposer'
import { IcoOpenBook } from '../components/icons'

function CogIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  )
}

// ── Spoiler-aware body (mirrors Home.jsx) ─────────────────────
function SpoilerBody({ isSpoiler, isItalic, barCol = 'var(--rt-navy)', onClick, children }) {
  const [revealed, setRevealed] = useState(false)
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

// ── Engagement bar (likes + comments) ─────────────────────────
function FeedEngagementBar({ entryId, user, onOpenThread }) {
  const [likes, setLikes]           = useState([])
  const [commentCount, setCommentCount] = useState(0)
  const [liking, setLiking]         = useState(false)

  useEffect(() => {
    if (!entryId) return
    sb.from('review_likes').select('id, user_id').eq('entry_id', entryId)
      .then(({ data }) => setLikes(data || []))
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

  const btnStyle = (active) => ({
    display: 'flex', alignItems: 'center', gap: '0.3rem',
    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
    color: active ? '#C84B4B' : 'var(--rt-t3)', fontSize: '0.82rem', fontWeight: 500,
  })
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
      <button onClick={toggleLike} disabled={liking} style={btnStyle(!!myLike)}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill={myLike ? '#C84B4B' : 'none'} stroke={myLike ? '#C84B4B' : 'currentColor'} strokeWidth="1.8">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
        <span>{likes.length > 0 ? likes.length : 'Like'}</span>
      </button>
      <button onClick={e => { e.stopPropagation(); onOpenThread() }} style={btnStyle(false)}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <span>{commentCount > 0 ? commentCount : 'Comment'}</span>
      </button>
    </div>
  )
}

// ── ··· menu for own moments ──────────────────────────────────
function MomentMenu({ onEdit, onDelete }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])
  return (
    <div ref={ref} style={{ position: 'relative', marginLeft: 'auto' }}>
      <button onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--rt-t3)', fontSize: '1.1rem', padding: '0 0.25rem', lineHeight: 1 }}>
        ···
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: '100%', background: 'var(--rt-white)', border: '1px solid var(--rt-border)', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 50, minWidth: 120, overflow: 'hidden' }}>
          <button onClick={e => { e.stopPropagation(); setOpen(false); onEdit() }}
            style={{ display: 'block', width: '100%', padding: '0.6rem 1rem', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--rt-navy)', fontWeight: 500 }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--rt-surface)'}
            onMouseLeave={e => e.currentTarget.style.background = ''}>
            Edit
          </button>
          <button onClick={e => { e.stopPropagation(); setOpen(false); onDelete() }}
            style={{ display: 'block', width: '100%', padding: '0.6rem 1rem', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.82rem', color: '#dc2626', fontWeight: 500 }}
            onMouseEnter={e => e.currentTarget.style.background = '#fff5f5'}
            onMouseLeave={e => e.currentTarget.style.background = ''}>
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

export default function Profile({ onNavigate, onOpenChatModal }) {
  const { user } = useAuthContext()
  const { books, updateBook } = useBooksContext()
  const {
    myUsername, myDisplayName, myBio, myAvatarUrl, topBookIds,
    saveFavBooks, uploadAvatar
  } = useSocialContext()

  const [activeTab, setActiveTab]         = useState('reviews')
  const [moments, setMoments]             = useState(null)
  const [momentsLoading, setMomentsLoading] = useState(false)
  const [activeReview, setActiveReview]   = useState(null)
  const [editMoment, setEditMoment]       = useState(null)
  const [detailBook, setDetailBook]       = useState(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError]     = useState(null)
  const [detailLocation, setDetailLocation] = useState(null)
  const [favEditorOpen, setFavEditorOpen] = useState(false)
  const [favSelected, setFavSelected]     = useState([])
  const [editBook, setEditBook]           = useState(null)
  const [finishBook, setFinishBook]       = useState(null)

  const read    = books.filter(b => b.status === 'read')
  const reading = books.filter(b => b.status === 'reading')
    .sort((a, b) => new Date(b.dateStarted || b.added || 0) - new Date(a.dateStarted || a.added || 0))
  const reviews = [...read]
    .filter(b => b.reviewBody)
    .sort((a, b) => new Date(b.dateRead || b.added || 0) - new Date(a.dateRead || a.added || 0))
  const favBooks = topBookIds.map(id => books.find(b => b.id === id)).filter(Boolean)
  const displayName  = myDisplayName || myUsername || user?.email?.split('@')[0] || 'Reader'
  const avatarBg     = avatarColour(user?.id || 'x')
  const avatarLetter = avatarInitial(displayName)

  // Load moments when tab is first opened
  useEffect(() => {
    if (activeTab === 'moments' && moments === null && user) loadMoments()
  }, [activeTab, user])

  async function loadMoments() {
    setMomentsLoading(true)
    const { data, error } = await sb
      .from('feed_events')
      .select('id, event_type, book_ol_key, book_title, book_author, cover_id, moment_id, moment_type, moment_body, page_ref, spoiler_warning, created_at')
      .eq('user_id', user.id)
      .eq('event_type', 'book_moment')
      .order('created_at', { ascending: false })
      .limit(50)
    if (!error) setMoments(data || [])
    setMomentsLoading(false)
  }

  async function handleDeleteMoment(feedEventId, momentId) {
    if (!window.confirm('Delete this moment?')) return
    await sb.from('feed_events').delete().eq('id', feedEventId)
    if (momentId) await sb.from('review_likes').delete().eq('entry_id', momentId)
    setMoments(prev => prev.filter(m => m.id !== feedEventId))
  }

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarUploading(true); setAvatarError(null)
    const { error } = await uploadAvatar(file)
    if (error) setAvatarError(error)
    setAvatarUploading(false)
    e.target.value = ''
  }

  function openFavEditor() { setFavSelected([...topBookIds]); setFavEditorOpen(true) }
  function toggleFav(id) {
    setFavSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length >= 10 ? prev : [...prev, id])
  }
  async function handleSaveFavs() { await saveFavBooks(favSelected); setFavEditorOpen(false) }

  function BookCoverWithTitle({ book, onClick }) {
    return (
      <div onClick={onClick} style={{ cursor: 'pointer', textAlign: 'center', width: 62, flexShrink: 0 }}>
        <CoverImage coverId={book.coverId} olKey={book.olKey} title={book.title} size="M" />
        <div style={{ fontSize: '0.6rem', color: 'var(--rt-t2)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 80, lineHeight: 1.2, fontWeight: 500 }}>{book.title}</div>
      </div>
    )
  }

  const cardStyle = { background: 'var(--rt-white)', border: '1px solid var(--rt-border)', borderRadius: 12, padding: '0.75rem', marginBottom: '0.65rem' }
  const tabStyle = (active) => ({
    flex: 1, padding: '0.65rem 0', textAlign: 'center',
    fontSize: '0.82rem', fontWeight: 600,
    color: active ? 'var(--rt-navy)' : 'var(--rt-t3)',
    borderBottom: active ? '2px solid var(--rt-amber)' : '2px solid transparent',
    background: 'none', border: 'none',
    borderBottom: active ? '2px solid var(--rt-amber)' : '2px solid transparent',
    cursor: 'pointer', transition: 'color 0.15s',
  })

  return (
    <div className="rt-page" style={{ maxWidth: 760, margin: '0 auto' }}>

      <style>{`.avatar-label:hover .avatar-overlay { opacity: 1 !important }`}</style>

      {/* ── Navy hero ── */}
      <div style={{
        background: 'linear-gradient(160deg, var(--rt-navy) 0%, #243A5E 100%)',
        padding: '1.5rem 1.25rem 1.4rem',
        position: 'relative',
        marginBottom: '1.1rem',
        borderRadius: '20px',
      }}>
        <button onClick={() => onNavigate('account')}
          style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.7)', transition: 'background 0.15s' }}
          title="Account settings"
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.22)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}>
          <CogIcon />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
          <label className="avatar-label" style={{ cursor: 'pointer', flexShrink: 0, position: 'relative' }} title="Change photo">
            <input type="file" accept="image/*"
              style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer', zIndex: 1 }}
              onChange={handleAvatarChange} disabled={avatarUploading} />
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: avatarBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--rt-font-display)', fontSize: '1.4rem', fontWeight: 700, color: '#fff', border: '2.5px solid rgba(255,255,255,0.2)', overflow: 'hidden', position: 'relative' }}>
              {myAvatarUrl ? <img src={myAvatarUrl} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : avatarLetter}
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: avatarUploading ? 1 : 0, transition: 'opacity 0.15s', borderRadius: '50%' }} className="avatar-overlay">
                {avatarUploading
                  ? <div style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                  : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                }
              </div>
            </div>
            {avatarError && <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', fontSize: '0.6rem', color: '#fca5a5', whiteSpace: 'nowrap', marginTop: '0.25rem' }}>{avatarError}</div>}
          </label>
          <div>
            <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.15rem', fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>{displayName}</div>
            {myUsername && <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.55)', marginTop: '0.15rem' }}>@{myUsername}</div>}
            {myBio && <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.65)', marginTop: '0.35rem', lineHeight: 1.45 }}>{myBio}</div>}
          </div>
        </div>
      </div>

      {/* ── Currently reading ── */}
      {reading.length > 0 && (() => {
        const book = reading[0]
        return (
          <div className="rt-card" style={{ marginBottom: '1.1rem' }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-teal)', marginBottom: '0.6rem' }}>Currently reading</div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', cursor: 'pointer' }}
              onClick={() => { setDetailBook(book); setDetailLocation('mylist-reading') }}>
              <CoverImage coverId={book.coverId} olKey={book.olKey} title={book.title} size="M" />
              <div>
                <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.9rem', fontWeight: 700, color: 'var(--rt-navy)' }}>{book.title}</div>
                {book.author && <div style={{ fontSize: '0.75rem', color: 'var(--rt-t3)' }}>{book.author}</div>}
                {book.dateStarted && <div style={{ fontSize: '0.68rem', color: 'var(--rt-t3)', marginTop: 2 }}>Started {fmtDate(book.dateStarted)}</div>}
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Favourite books ── */}
      <div className="rt-card" style={{ marginBottom: '1.1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.9rem', fontWeight: 700, color: 'var(--rt-navy)' }}>Favourite books</div>
          <button onClick={openFavEditor} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--rt-amber)', fontWeight: 600 }}>Edit →</button>
        </div>
        {favBooks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1rem 0', color: 'var(--rt-t3)', fontSize: '0.82rem' }}>
            <span style={{ display: 'block', fontSize: '1.5rem', marginBottom: '0.4rem' }}>⭐</span>
            Pin up to 10 favourites.<br/>
            <button onClick={openFavEditor} style={{ marginTop: '0.5rem', background: 'none', border: 'none', color: 'var(--rt-amber)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>Choose books</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '0.85rem', overflowX: 'auto', paddingBottom: '0.3rem', scrollbarWidth: 'none' }}>
            {favBooks.map(book => (
              <BookCoverWithTitle key={book.id} book={book} onClick={() => { setDetailBook(book); setDetailLocation('mylist-history') }} />
            ))}
          </div>
        )}
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--rt-border)', marginBottom: '1rem' }}>
        <button style={tabStyle(activeTab === 'reviews')} onClick={() => setActiveTab('reviews')}>Reviews</button>
        <button style={tabStyle(activeTab === 'moments')} onClick={() => setActiveTab('moments')}>Moments</button>
      </div>

      <div style={{ paddingBottom: '2rem' }}>

        {/* ── Reviews tab ── */}
        {activeTab === 'reviews' && (
          reviews.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--rt-t3)', fontSize: '0.85rem' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📖</div>
              Your reviews will appear here once you finish a book and leave a review.
            </div>
          ) : (
            reviews.map(book => {
              const stars   = book.rating > 0 ? '★'.repeat(book.rating) + '☆'.repeat(5 - book.rating) : null
              const dateStr = book.dateRead ? fmtDate(book.dateRead) : null
              return (
                <div key={book.id} style={cardStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.6rem' }}>
                    {stars && <span style={{ fontSize: '0.82rem', color: 'var(--rt-amber)', letterSpacing: '0.5px' }}>{stars}</span>}
                    {dateStr && <span style={{ fontSize: '0.65rem', color: 'var(--rt-t3)', marginLeft: 'auto' }}>{dateStr}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', marginBottom: '0.6rem' }}
                    onClick={() => { setDetailBook(book); setDetailLocation('mylist-history') }} >
                    <div style={{ width: 80, height: 116, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: 'var(--rt-surface)', boxShadow: '0 2px 8px rgba(26,39,68,0.13)', cursor: 'pointer' }}>
                      <CoverImage coverId={book.coverId} olKey={book.olKey} title={book.title} size="M" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
                      <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.88rem', fontWeight: 700, color: 'var(--rt-navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '0.15rem' }}>{book.title}</div>
                      {book.author && <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)', marginBottom: '0.5rem' }}>{book.author}</div>}
                      {book.reviewBody && (
                        <SpoilerBody barCol="var(--rt-navy)" onClick={e => { e.stopPropagation(); setActiveReview({ entryId: book.id, bookTitle: book.title, bookAuthor: book.author, coverId: book.coverId, olKey: book.olKey, reviewBody: book.reviewBody, rating: book.rating, reviewedAt: book.dateRead, reviewer: { userId: user.id, displayName, avatarUrl: myAvatarUrl } }) }}>
                          {book.reviewBody}
                        </SpoilerBody>
                      )}
                    </div>
                  </div>
                  <div style={{ height: '0.5px', background: 'var(--rt-border)', marginBottom: '0.5rem' }} />
                  <FeedEngagementBar entryId={book.id} user={user} onOpenThread={() => setActiveReview({ entryId: book.id, bookTitle: book.title, bookAuthor: book.author, coverId: book.coverId, olKey: book.olKey, reviewBody: book.reviewBody, rating: book.rating, reviewedAt: book.dateRead, reviewer: { userId: user.id, displayName, avatarUrl: myAvatarUrl } })} />
                </div>
              )
            })
          )
        )}

        {/* ── Moments tab ── */}
        {activeTab === 'moments' && (
          momentsLoading ? (
            <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--rt-t3)', fontSize: '0.85rem' }}>Loading…</div>
          ) : !moments || moments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--rt-t3)', fontSize: '0.85rem' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✨</div>
              Share a quote or reading update from any book — it'll appear here.
            </div>
          ) : (
            moments.map(ev => {
              const isQuote  = ev.moment_type === 'quote'
              const barCol   = isQuote ? 'var(--rt-amber)' : 'var(--rt-teal)'
              const badgeBg  = isQuote ? 'var(--rt-amber-pale)' : '#e1f5ee'
              const badgeCol = isQuote ? 'var(--rt-amber-text)' : '#085041'
              const badgeTxt = isQuote ? 'Quote' : 'Reading update'
              const isSpoiler = !!ev.spoiler_warning
              const dateStr  = ev.created_at ? new Date(ev.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''
              const coverId  = ev.cover_id || null
              const olKey    = ev.book_ol_key || null
              const openThread = () => setActiveReview({ entryId: ev.moment_id, bookTitle: ev.book_title, bookAuthor: ev.book_author, coverId, olKey, reviewBody: ev.moment_body, rating: null, reviewedAt: ev.created_at, reviewer: { userId: user.id, displayName, avatarUrl: myAvatarUrl } })
              return (
                <div key={ev.id} style={cardStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
                    <span style={{ background: badgeBg, color: badgeCol, borderRadius: 99, padding: '0.15em 0.55em', fontSize: '0.65rem', fontWeight: 700 }}>
                      {badgeTxt}{ev.page_ref ? ` · ${ev.page_ref}%` : ''}
                    </span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--rt-t3)', marginLeft: 'auto' }}>{dateStr}</span>
                    <MomentMenu
                      onEdit={() => setEditMoment(ev)}
                      onDelete={() => handleDeleteMoment(ev.id, ev.moment_id)}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', marginBottom: '0.6rem' }}>
                    <div style={{ width: 80, height: 116, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: 'var(--rt-surface)', boxShadow: '0 2px 8px rgba(26,39,68,0.13)' }}>
                      <CoverImage coverId={coverId} olKey={olKey} title={ev.book_title || ''} size="M" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
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
            })
          )
        )}
      </div>

      {/* ── ReviewThreadSheet ── */}
      {activeReview && (
        <ReviewThreadSheet
          review={activeReview}
          user={user}
          friends={[]}
          chats={[]}
          myAvatarUrl={myAvatarUrl}
          myDisplayName={displayName}
          onClose={() => setActiveReview(null)}
          onAddToTBR={() => setActiveReview(null)}
          onStartChat={() => setActiveReview(null)}
          onViewChat={() => setActiveReview(null)}
          onViewProfile={() => setActiveReview(null)}
        />
      )}

      {/* ── Edit moment ── */}
      {editMoment && (
        <MomentComposer
          user={user}
          books={books}
          editMode={true}
          initialMoment={editMoment}
          onClose={() => setEditMoment(null)}
          onPosted={() => { setEditMoment(null); loadMoments() }}
        />
      )}

      {/* ── Book detail panel ── */}
      {detailBook && (
        <BookDetailPanel
          book={detailBook}
          location={detailLocation || (detailBook.status === 'reading' ? 'mylist-reading' : 'mylist-history')}
          user={user}
          onClose={() => setDetailBook(null)}
          onMarkFinished={() => { setFinishBook(detailBook); setDetailBook(null) }}
          onStartReading={() => { updateBook(detailBook.id, { status: 'reading', dateStarted: new Date().toISOString().split('T')[0] }); setDetailBook(null) }}
          onEdit={() => { setEditBook(detailBook); setDetailBook(null) }}
          onRecommend={() => setDetailBook(null)}
          onOpenChatModal={(chatId, book) => { onOpenChatModal?.(chatId, book || detailBook); setDetailBook(null) }}
          onStartChat={() => { setDetailBook(null); onOpenChatModal?.(null, detailBook) }}
          onViewChat={(chatId) => { setDetailBook(null); onOpenChatModal?.(chatId) }}
          onCoverUpdate={(id, coverId, olKey) => updateBook(id, { coverId, _olKey: olKey })}
        />
      )}

      {finishBook && (
        <FinishModal book={finishBook} user={user} onClose={() => setFinishBook(null)}
          onSaved={changes => { updateBook(finishBook.id, changes) }} />
      )}

      {editBook && !editBook._finishMode && (
        <BookSheet book={editBook} initialMode="edit" onClose={() => setEditBook(null)}
          onSaved={changes => { updateBook(editBook.id, changes); setEditBook(null) }}
          onDeleted={() => { setEditBook(null) }} user={user} />
      )}

      {/* ── Fav books editor ── */}
      {favEditorOpen && (
        <ModalShell onClose={() => setFavEditorOpen(false)} maxWidth={560}>
          <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--rt-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <div>
              <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1rem', fontWeight: 700, color: 'var(--rt-navy)' }}>Choose favourites</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)' }}>Pick up to 10 ({favSelected.length}/10)</div>
            </div>
            <button onClick={() => setFavEditorOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.3rem', color: 'var(--rt-t3)' }}>×</button>
          </div>
          <div style={{ overflowY: 'auto', flex: 1, padding: '0.75rem 1.25rem' }}>
            {read.map(book => {
              const selected = favSelected.includes(book.id)
              return (
                <div key={book.id} onClick={() => toggleFav(book.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0', borderBottom: '1px solid var(--rt-border)', cursor: 'pointer' }}>
                  <div style={{ width: 20, height: 20, borderRadius: 4, border: '2px solid', borderColor: selected ? 'var(--rt-amber)' : 'var(--rt-border-md)', background: selected ? 'var(--rt-amber)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {selected && <span style={{ color: '#fff', fontSize: '0.75rem', fontWeight: 700 }}>✓</span>}
                  </div>
                  <CoverImage coverId={book.coverId} olKey={book.olKey} title={book.title} size="S" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--rt-navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{book.title}</div>
                    {book.author && <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)' }}>{book.author}</div>}
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ padding: '0.85rem 1.25rem', borderTop: '1px solid var(--rt-border)', flexShrink: 0 }}>
            <button className="rt-submit-btn" style={{ width: '100%' }} onClick={handleSaveFavs}>Save favourites</button>
          </div>
        </ModalShell>
      )}
    </div>
  )
}