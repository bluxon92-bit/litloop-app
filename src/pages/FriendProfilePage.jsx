import { useState, useEffect } from 'react'
import { sb } from '../lib/supabase'
import { avatarColour, avatarInitial, fmtDate } from '../lib/utils'
import CoverImage from '../components/books/CoverImage'
import BookDetailPanel from '../components/books/BookDetailPanel'
import ReviewThreadSheet from '../components/ReviewThreadSheet'
import { IcoOpenBook } from '../components/icons'

// ── Small cover + title for favourites carousel ───────────────
function FavCover({ book }) {
  return (
    <div style={{ flexShrink: 0, width: 76, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ width: 76, height: 110, borderRadius: 8, overflow: 'hidden', background: 'var(--rt-surface)', boxShadow: '0 2px 8px rgba(26,39,68,0.15)' }}>
        <CoverImage coverId={book.coverId} olKey={book.olKey} title={book.title} size="M"
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

export default function FriendProfilePage({ friend, onBack, onOpenChatModal, chats, user, books: myBooks, onStartChat, onViewChat, onAddToTBR, onViewProfile, onAddFriend, myAvatarUrl, myDisplayName }) {
  const [entries, setEntries]       = useState(null)
  const [profile, setProfile]       = useState(null)
  const [favBooks, setFavBooks]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [detailBook, setDetailBook] = useState(null)
  const [activeReview, setActiveReview] = useState(null)

  useEffect(() => { if (friend?.userId) load() }, [friend?.userId])

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
          .select('id, status, books(title, author, cover_id, ol_key)')
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
                id:      e.id,
                title:   e.books?.title  || '',
                author:  e.books?.author || '',
                coverId: e.books?.cover_id || null,
                olKey:   e.books?.ol_key   || null,
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
    <div style={{ maxWidth: 640, margin: '0 auto', paddingBottom: '3rem' }}>

      {/* ReviewThreadSheet overlay */}
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
        />
      )}

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
        {/* Avatar + name row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', marginBottom: '0.75rem' }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%', background: colour,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--rt-font-display)', fontSize: '1.4rem', fontWeight: 700,
            color: '#fff', border: '2.5px solid rgba(255,255,255,0.2)',
            overflow: 'hidden', flexShrink: 0,
          }}>
            {avatarUrl
              ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : init
            }
          </div>
          <div>
            <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.15rem', fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>
              {friend.displayName}
            </div>
            {(friend.username || profile?.username) && (
              <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', marginTop: '0.15rem' }}>@{friend.username || profile?.username}</div>
            )}
          </div>
        </div>

        {profile?.bio && (
          <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.65)', marginBottom: '0.75rem', lineHeight: 1.45 }}>{profile.bio}</div>
        )}

        {/* Add friend button — shown when not already friends */}
        {onAddFriend && !friend.friendshipId && (
          <button
            onClick={() => onAddFriend(friend)}
            style={{ marginTop: '0.5rem', background: 'var(--rt-amber)', border: 'none', borderRadius: 99, padding: '0.4rem 1rem', fontSize: '0.78rem', fontWeight: 700, color: '#fff', cursor: 'pointer' }}
          >
            + Add friend
          </button>
        )}

        {/* Stats */}
        {!loading && entries && (
          <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.9rem' }}>
            {[[readBooks.length, 'books read'], [readingBooks.length, 'reading now']].map(([n, l]) => (
              <div key={l}>
                <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.2rem', fontWeight: 700, color: 'var(--rt-amber-lt)' }}>{n}</div>
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
                    <CoverImage coverId={b.coverId} olKey={b.olKey} title={b.title} size="M" />
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

          {/* ── Reviews ── */}
          {reviews.length > 0 && (
            <div style={{ marginBottom: '1.1rem' }}>
              <SLabel style={{ marginBottom: '0.75rem' }}>{friend.displayName.split(' ')[0]}'s reviews</SLabel>
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
                        <CoverImage coverId={b.coverId} olKey={b.olKey} title={b.title} size="M" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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

          {/* Empty state */}
          {readingBooks.length === 0 && reviews.length === 0 && favBooks.length === 0 && (
            <div className="rt-card" style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--rt-t3)', fontSize: '0.85rem' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📚</div>
              {friend.displayName} hasn't logged any books yet.
            </div>
          )}
        </>
      )}
    </div>
  )
}