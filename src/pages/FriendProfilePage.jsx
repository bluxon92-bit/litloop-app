import { useState, useEffect } from 'react'
import { sb } from '../lib/supabase'
import { avatarColour, avatarInitial, fmtDate } from '../lib/utils'
import CoverImage from '../components/books/CoverImage'
import BookDetailPanel from '../components/books/BookDetailPanel'
import ReviewThreadSheet from '../components/ReviewThreadSheet'
import ReportSheet from '../components/ReportSheet'
import { IcoOpenBook } from '../components/icons'
import { useSocialContext } from '../context/SocialContext'

// ── Small cover + title for favourites carousel ───────────────
function FavCover({ book }) {
  return (
    <div style={{ flexShrink: 0, width: 76, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ width: 76, height: 110, borderRadius: 8, overflow: 'hidden', background: 'var(--rt-surface)', boxShadow: '0 2px 8px rgba(26,39,68,0.15)' }}>
        <CoverImage coverId={book.coverId} olKey={book.olKey} coverUrl={book.coverUrl} title={book.title} size="M"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
      <div style={{ marginTop: '0.35rem', width: '100%', textAlign: 'center', fontSize: '0.65rem', fontWeight: 600, color: 'var(--rt-navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{book.title}</div>
    </div>
  )
}

// ── Section label ─────────────────────────────────────────────
function SLabel({ children }) {
  return (
    <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.6rem' }}>
      {children}
    </div>
  )
}

// ── Main FriendProfilePage ────────────────────────────────────
// ── Shared engagement bar (reused in both Home and FriendProfilePage) ──
function FeedEngagementBar({ entryId, user, onOpenThread }) {
  const [likes, setLikes]         = useState([])
  const [commentCount, setCommentCount] = useState(0)
  const [liking, setLiking]       = useState(false)

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

// ── Spoiler-aware body ───────────────────────────────────────
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

export default function FriendProfilePage({ friend, onBack, onOpenChatModal, chats, user, books: myBooks, onStartChat, onViewChat, onAddToTBR, onViewProfile, onAddFriend, myAvatarUrl, myDisplayName }) {
  const { friends, blockedIds, blockUser, unblockUser, submitReport } = useSocialContext()
  const [activeTab, setActiveTab]       = useState('reviews')
  const [moments, setMoments]           = useState(null)
  const [momentsLoading, setMomentsLoading] = useState(false)
  const [entries, setEntries]       = useState(null)
  const [profile, setProfile]       = useState(null)
  const [favBooks, setFavBooks]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [detailBook, setDetailBook] = useState(null)
  const [activeReview, setActiveReview] = useState(null)
  const [showHeroMenu, setShowHeroMenu] = useState(false)
  const [showReport, setShowReport]     = useState(false)
  const [blockConfirm, setBlockConfirm] = useState(false)
  const [blocked, setBlocked]           = useState(false)

  // Scroll to top when profile mounts
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

  // Sync blocked state from context
  useEffect(() => {
    setBlocked(blockedIds?.includes(friend?.userId) || false)
  }, [blockedIds, friend?.userId])

  useEffect(() => { if (friend?.userId) load() }, [friend?.userId])

  useEffect(() => {
    if (activeTab === 'moments' && moments === null && friend?.userId) loadMoments()
  }, [activeTab, friend?.userId])

  async function loadMoments() {
    setMomentsLoading(true)
    const { data, error } = await sb
      .from('feed_events')
      .select('id, event_type, book_ol_key, book_title, book_author, cover_id, moment_id, moment_type, moment_body, page_ref, spoiler_warning, created_at')
      .eq('user_id', friend.userId)
      .eq('event_type', 'book_moment')
      .order('created_at', { ascending: false })
      .limit(50)
    if (!error) setMoments(data || [])
    setMomentsLoading(false)
  }

  async function load() {
    setLoading(true); setError(null)
    try {
      // RPC is primary — it handles RLS and returns all statuses (reading, read, tbr etc.)
      const rpcRes = await sb.rpc('get_friend_reading_entries', { p_user_id: friend.userId })
      let finalEntries = []
      if (!rpcRes.error && Array.isArray(rpcRes.data)) {
        finalEntries = rpcRes.data
      }

      // Use SECURITY DEFINER RPC for profile name/avatar (bypasses RLS)
      const { data: profilesData } = await sb.rpc('get_profiles_by_ids', { user_ids: [friend.userId] })
      const profileBase = profilesData?.[0] || null

      // Try direct profiles fetch for bio + top_book_ids (RLS may block — silent fail)
      const { data: fullProfile } = await sb
        .from('profiles')
        .select('bio, top_book_ids')
        .eq('id', friend.userId)
        .single()

      const bio = fullProfile?.bio || null
      const topIds = fullProfile?.top_book_ids || []
      setProfile({ ...(profileBase || {}), bio, top_book_ids: topIds })

      // Map entries — review fields come from a separate direct query if RPC lacks them
      // Try to enrich with review data
      const { data: reviewData } = await sb
        .from('reading_entries')
        .select('status, rating, review_body, review_is_public, reviewed_at, date_finished, books(ol_key)')
        .eq('user_id', friend.userId)
        .eq('review_is_public', true)

      // Build a lookup by olKey for review enrichment
      const reviewMap = {}
      ;(reviewData || []).forEach(r => {
        const key = r.books?.ol_key
        if (key) reviewMap[key] = r
      })

      const enrichedEntries = finalEntries.map(e => {
        const olKey = e.books?.ol_key || e.ol_key || null
        const enriched = olKey ? reviewMap[olKey] : null
        return {
          id:          e.id,
          title:       e.books?.title    || e.title_manual  || '',
          author:      e.books?.author   || e.author_manual || '',
          coverId:     e.books?.cover_id || null,
          coverUrl:    e.books?.cover_url || null,
          olKey,
          status:      e.status,
          rating:      enriched?.rating      || e.rating      || null,
          reviewedAt:  enriched?.reviewed_at || enriched?.date_finished || null,
          reviewBody:  enriched?.review_is_public ? (enriched?.review_body || null) : null,
        }
      })
      setEntries(enrichedEntries)

      // top_book_ids stores reading_entries IDs — fetch directly to avoid RPC filtering them out
      if (topIds.length > 0) {
        const { data: favEntries } = await sb
          .from('reading_entries')
          .select('id, status, books(title, author, cover_id, ol_key, cover_url)')
          .in('id', topIds)
          .eq('user_id', friend.userId)
        if (favEntries?.length) {
          // Preserve the order from top_book_ids
          const byId = Object.fromEntries(favEntries.map(e => [e.id, e]))
          setFavBooks(
            topIds
              .map(id => byId[id])
              .filter(Boolean)
              .map(e => ({
                id:       e.id,
                title:    e.books?.title  || '',
                author:   e.books?.author || '',
                coverId:  e.books?.cover_id  || null,
                coverUrl: e.books?.cover_url || null,
                olKey:    e.books?.ol_key    || null,
              }))
          )
        }
      }
    } catch(e) {
      console.error('[FriendProfilePage] load error:', e)
      setError('Could not load profile.')
    }
    setLoading(false)
  }

  const readBooks    = entries?.filter(b => b.status === 'read')    || []
  const readingBooks = entries?.filter(b => b.status === 'reading') || []
  const reviews      = readBooks.filter(b => b.reviewBody)

  const colour = avatarColour(friend.userId)
  const init   = avatarInitial(friend.displayName)
  const avatarUrl = friend.avatarUrl || profile?.avatar_url || null

  function existingChat(olKey) {
    return olKey && chats ? chats.find(c => c.bookOlKey === olKey) : null
  }

  return (
    <>
      {/* ── Portalled overlays — outside page div so they're never clipped ── */}

      {activeReview && (
        <ReviewThreadSheet
          review={activeReview}
          user={user}
          friends={[]}
          chats={chats}
          myAvatarUrl={myAvatarUrl}
          myDisplayName={myDisplayName}
          onClose={() => setActiveReview(null)}
          onAddToTBR={() => { onAddToTBR?.({ title: activeReview.bookTitle, author: activeReview.bookAuthor, olKey: activeReview.olKey, coverId: activeReview.coverId }); setActiveReview(null) }}
          onStartChat={() => { onStartChat?.({ title: activeReview.bookTitle, olKey: activeReview.olKey, coverId: activeReview.coverId }); setActiveReview(null) }}
          onViewChat={chatId => { onViewChat?.(chatId); setActiveReview(null) }}
          onViewProfile={f => { setActiveReview(null); onViewProfile?.(f) }}
          onAddFriend={onAddFriend}
          submitReport={submitReport}
        />
      )}

      <ReportSheet
        open={showReport}
        onClose={() => setShowReport(false)}
        title={`Report ${friend.displayName}`}
        description="Help us understand what's wrong."
        onSubmit={async (reason, note) => {
          await submitReport({ reportedUserId: friend.userId, contentType: 'user', contentId: null, reason, note })
        }}
      />

      {blockConfirm && (
        <>
          <div className="rt-block-backdrop"
            onClick={e => { if (e.target === e.currentTarget) setBlockConfirm(false) }}>
          <div style={{ background: 'var(--rt-bg)', borderRadius: 16, padding: '1.5rem', width: '100%', maxWidth: 360, boxShadow: '0 16px 48px rgba(0,0,0,0.25)' }}>
            <div style={{ fontFamily: 'var(--rt-font-display)', fontWeight: 600, fontSize: '1rem', color: 'var(--rt-navy)', marginBottom: '0.5rem' }}>
              {blocked ? `Unblock ${friend.displayName}?` : `Block ${friend.displayName}?`}
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--rt-t3)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
              {blocked
                ? 'They will be able to see your content and message you again.'
                : "They won't be able to message you or see your content. They won't be notified."}
            </div>
            <div style={{ display: 'flex', gap: '0.65rem' }}>
              <button onClick={() => setBlockConfirm(false)}
                style={{ flex: 1, padding: '0.65rem', borderRadius: 'var(--rt-r3)', border: '1px solid var(--rt-border-md)', background: 'none', fontSize: '0.85rem', cursor: 'pointer', color: 'var(--rt-t2)' }}>
                Cancel
              </button>
              <button onClick={async () => {
                blocked ? await unblockUser(friend.userId) : await blockUser(friend.userId)
                setBlocked(v => !v)
                setBlockConfirm(false)
              }}
                style={{ flex: 1, padding: '0.65rem', borderRadius: 'var(--rt-r3)', border: 'none', background: blocked ? 'var(--rt-navy)' : '#dc2626', color: '#fff', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}>
                {blocked ? 'Unblock' : 'Block'}
              </button>
            </div>
          </div>
        </div>
        </>
      )}

    <div style={{ maxWidth: 640, margin: '0 auto', paddingBottom: '3rem' }} onClick={() => setShowHeroMenu(false)}>

      {/* BookDetailPanel overlay */}
      {detailBook && (
        <BookDetailPanel
          book={detailBook}
          location="home-feed"
          user={user}
          existingChatId={existingChat(detailBook.olKey)?.id || null}
          friendName={friend.displayName}
          onClose={() => setDetailBook(null)}
          onAddToTBR={() => {
            onAddToTBR?.({ title: detailBook.title, author: detailBook.author, olKey: detailBook.olKey, coverId: detailBook.coverId })
            setDetailBook(null)
          }}
          onMarkFinished={() => setDetailBook(null)}
          onStartReading={() => setDetailBook(null)}
          onEdit={() => setDetailBook(null)}
          onRecommend={() => setDetailBook(null)}
          onOpenChatModal={(chatId, book) => {
            setDetailBook(null)
            const c = chats?.find(x => x.id === chatId)
            if (c) onViewChat?.(c.id)
          }}
        />
      )}

      {/* ── Back breadcrumb ── */}
      <button
        onClick={onBack}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.4rem',
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--rt-t3)', fontSize: '0.82rem', fontWeight: 600,
          padding: '0.75rem 0', marginBottom: '0.25rem',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        {friend.displayName}
      </button>

      {/* ── Navy hero ── */}
      <div style={{
        background: 'linear-gradient(160deg, var(--rt-navy) 0%, #243A5E 100%)',
        padding: '1.5rem 1.25rem 1.4rem',
        borderRadius: 20,
        marginBottom: '1.25rem',
      }}>
        {/* Avatar + name row with ⋯ and add friend top-right */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.9rem', marginBottom: '0.75rem' }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%', background: colour,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--rt-font-display)', fontSize: '1.25rem', fontWeight: 600,
            color: '#fff', border: '2.5px solid rgba(255,255,255,0.2)',
            overflow: 'hidden', flexShrink: 0,
          }}>
            {avatarUrl
              ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : init
            }
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.15rem', fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>
              {friend.displayName}
            </div>
            {(friend.username || profile?.username) && (
              <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', marginTop: '0.15rem' }}>@{friend.username || profile?.username}</div>
            )}
          </div>
          {/* Top-right actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
            {onAddFriend && !friends.some(f => f.userId === friend.userId) && !blocked && (
              <button
                onClick={e => { e.stopPropagation(); onAddFriend(friend) }}
                style={{ background: 'var(--rt-amber)', border: 'none', borderRadius: 99, padding: '0.35rem 0.85rem', fontSize: '0.75rem', fontWeight: 700, color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >+ Add</button>
            )}
            <div style={{ position: 'relative' }}>
              <button
                onClick={e => { e.stopPropagation(); setShowHeroMenu(v => !v) }}
                style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', fontSize: '1.1rem' }}
              >⋯</button>
              {showHeroMenu && (
                <div
                  style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: 'var(--rt-white)', borderRadius: 'var(--rt-r3)', border: '1px solid var(--rt-border)', boxShadow: '0 8px 24px rgba(10,15,30,0.18)', zIndex: 50, minWidth: 170, overflow: 'hidden' }}
                  onClick={e => e.stopPropagation()}
                >
                  <button
                    onClick={() => { setShowHeroMenu(false); setShowReport(true) }}
                    style={{ width: '100%', padding: '0.75rem 1rem', background: 'none', border: 'none', textAlign: 'left', fontSize: '0.85rem', color: 'var(--rt-navy)', fontWeight: 500, cursor: 'pointer', borderBottom: '1px solid var(--rt-border)' }}
                  >Report {friend.displayName.split(' ')[0]}</button>
                  <button
                    onClick={() => { setShowHeroMenu(false); setBlockConfirm(true) }}
                    style={{ width: '100%', padding: '0.75rem 1rem', background: 'none', border: 'none', textAlign: 'left', fontSize: '0.85rem', color: '#dc2626', fontWeight: 500, cursor: 'pointer' }}
                  >{blocked ? 'Unblock' : 'Block'} {friend.displayName.split(' ')[0]}</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        {!loading && entries && (
          <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.9rem' }}>
            {[[readBooks.length, 'books read'], [readingBooks.length, 'reading now']].map(([n, l]) => (
              <div key={l}>
                <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.1rem', fontWeight: 600, color: 'var(--rt-amber-lt)' }}>{n}</div>
                <div style={{ fontSize: '0.57rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{l}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--rt-t3)', fontSize: '0.85rem' }}>Loading…</div>
      )}
      {error && (
        <div style={{ padding: '1rem', color: '#991b1b', fontSize: '0.85rem' }}>{error}</div>
      )}

      {!loading && !error && (
        <>
          {/* ── Currently reading ── */}
          {readingBooks.length > 0 && (
            <div className="rt-card" style={{ marginBottom: '1.1rem' }}>
              <SLabel>Currently reading</SLabel>
              {readingBooks.map((b, i) => {
                const chat = existingChat(b.olKey)
                return (
                  <div key={i} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', padding: i > 0 ? '0.6rem 0 0' : '0' }}>
                    <CoverImage coverId={b.coverId} olKey={b.olKey} coverUrl={b.coverUrl} title={b.title} size="M" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.9rem', fontWeight: 700, color: 'var(--rt-navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</div>
                      {b.author && <div style={{ fontSize: '0.75rem', color: 'var(--rt-t3)' }}>{b.author}</div>}
                    </div>
                    {b.olKey && (
                      <button
                        onClick={() => chat ? onViewChat?.(chat.id) : onStartChat?.(b)}
                        style={{ flexShrink: 0, background: chat ? 'var(--rt-navy)' : 'var(--rt-amber)', color: '#fff', border: 'none', borderRadius: 8, padding: '0.35rem 0.75rem', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >{chat ? 'View chat' : 'Start chat'}</button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Favourite books ── */}
          {favBooks.length > 0 && (
            <div className="rt-card" style={{ marginBottom: '1.1rem' }}>
              <SLabel>Favourite books</SLabel>
              <div style={{ display: 'flex', gap: '0.85rem', overflowX: 'auto', paddingBottom: '0.3rem', scrollbarWidth: 'none' }}>
                {favBooks.map((book, i) => <FavCover key={i} book={book} />)}
              </div>
            </div>
          )}

          {/* ── Tabs ── */}
          {(() => {
            const tabStyle = (active) => ({
              flex: 1, padding: '0.65rem 0', textAlign: 'center',
              fontSize: '0.82rem', fontWeight: 600,
              color: active ? 'var(--rt-navy)' : 'var(--rt-t3)',
              borderBottom: active ? '2px solid var(--rt-amber)' : '2px solid transparent',
              background: 'none', border: 'none',
              cursor: 'pointer', transition: 'color 0.15s',
            })
            return (
              <div style={{ display: 'flex', borderBottom: '1px solid var(--rt-border)', marginBottom: '1rem' }}>
                <button style={tabStyle(activeTab === 'reviews')} onClick={() => setActiveTab('reviews')}>Reviews</button>
                <button style={tabStyle(activeTab === 'moments')} onClick={() => setActiveTab('moments')}>Moments</button>
              </div>
            )
          })()}

          {/* ── Reviews tab ── */}
          {activeTab === 'reviews' && reviews.length > 0 && (
            <div style={{ marginBottom: '1.1rem' }}>
              {reviews.map((b, i) => {
                const stars = b.rating > 0 ? '★'.repeat(b.rating) + '☆'.repeat(5 - b.rating) : null
                const dateStr = b.reviewedAt ? fmtDate(b.reviewedAt) : null
                const openThread = () => setActiveReview({
                  entryId: b.entryId, bookTitle: b.title, bookAuthor: b.author,
                  coverId: b.coverId, olKey: b.olKey, reviewBody: b.reviewBody,
                  rating: b.rating, reviewedAt: b.reviewedAt,
                  reviewer: { userId: friend.userId, displayName: friend.displayName, avatarUrl: friend.avatarUrl },
                })
                return (
                  <div key={i} style={{ background: 'var(--rt-white)', border: '1px solid var(--rt-border)', borderRadius: 12, padding: '0.75rem', marginBottom: '0.65rem' }}>
                    {/* Top row: stars · date */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.6rem' }}>
                      {stars && <span style={{ fontSize: '0.82rem', color: 'var(--rt-amber)', letterSpacing: '0.5px' }}>{stars}</span>}
                      {dateStr && <span style={{ fontSize: '0.65rem', color: 'var(--rt-t3)', marginLeft: 'auto' }}>{dateStr}</span>}
                    </div>
                    {/* Book row: cover centred with meta */}
                    <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', marginBottom: '0.6rem' }}>
                      <div style={{ width: 80, height: 116, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: 'var(--rt-surface)', boxShadow: '0 2px 8px rgba(26,39,68,0.13)' }}>
                        <CoverImage coverId={b.coverId} olKey={b.olKey} coverUrl={b.coverUrl} title={b.title} size="M" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.88rem', fontWeight: 700, color: 'var(--rt-navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '0.15rem' }}>{b.title}</div>
                        {b.author && <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)', marginBottom: '0.5rem' }}>{b.author}</div>}
                        {b.reviewBody && (
                          <div onClick={openThread} style={{ borderLeft: '3px solid var(--rt-navy)', paddingLeft: '0.5rem', cursor: 'pointer' }}>
                            <p style={{ fontSize: '0.82rem', color: 'var(--rt-navy)', lineHeight: 1.6, margin: 0, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                              {b.reviewBody}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ height: '0.5px', background: 'var(--rt-border)', marginBottom: '0.5rem' }} />
                    <FeedEngagementBar entryId={b.entryId} user={user} onOpenThread={openThread} />
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Moments tab ── */}
          {activeTab === 'moments' && (
            momentsLoading ? (
              <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--rt-t3)', fontSize: '0.85rem' }}>Loading…</div>
            ) : !moments || moments.length === 0 ? (
              <div className="rt-card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>✨</div>
                <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--rt-navy)', marginBottom: '0.25rem' }}>No moments yet</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--rt-t3)' }}>{friend.displayName.split(' ')[0]} hasn't shared any moments yet.</div>
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
                const openThread = () => setActiveReview({ entryId: ev.moment_id, bookTitle: ev.book_title, bookAuthor: ev.book_author, coverId, olKey, reviewBody: ev.moment_body, rating: null, reviewedAt: ev.created_at, reviewer: { userId: friend.userId, displayName: friend.displayName, avatarUrl: friend.avatarUrl } })
                return (
                  <div key={ev.id} style={{ background: 'var(--rt-white)', border: '1px solid var(--rt-border)', borderRadius: 12, padding: '0.75rem', marginBottom: '0.65rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
                      <span style={{ background: badgeBg, color: badgeCol, borderRadius: 99, padding: '0.15em 0.55em', fontSize: '0.65rem', fontWeight: 700 }}>
                        {badgeTxt}{ev.page_ref ? ` · ${ev.page_ref}%` : ''}
                      </span>
                      <span style={{ fontSize: '0.65rem', color: 'var(--rt-t3)', marginLeft: 'auto' }}>{dateStr}</span>
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

          {/* Empty state — only show on reviews tab when nothing at all */}
          {activeTab === 'reviews' && readingBooks.length === 0 && reviews.length === 0 && favBooks.length === 0 && (
            <div className="rt-card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📚</div>
              <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--rt-navy)', marginBottom: '0.25rem' }}>No activity yet</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--rt-t3)' }}>{friend.displayName} hasn't logged any books yet.</div>
            </div>
          )}
        </>
      )}
    </div>
    </>
  )
}