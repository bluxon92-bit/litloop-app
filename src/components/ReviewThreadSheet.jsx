import { useState, useEffect, useRef } from 'react'
import { sb } from '../lib/supabase'
import { avatarColour, avatarInitial, fmtDate, timeAgo } from '../lib/utils'
import CoverImage from './books/CoverImage'
import BookDetailPanel from './books/BookDetailPanel'
import { ModalShell } from './books/BookSheet'

// ── Heart icon ────────────────────────────────────────────────
function HeartIcon({ filled, size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
      fill={filled ? '#C84B4B' : 'none'}
      stroke={filled ? '#C84B4B' : 'currentColor'}
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>
  )
}

// ── Avatar circle ─────────────────────────────────────────────
function Avatar({ userId, displayName, avatarUrl, size = 26 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: avatarColour(userId || 'x'),
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38 + 'px', fontWeight: 700, color: '#fff',
      flexShrink: 0, overflow: 'hidden',
    }}>
      {avatarUrl
        ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : avatarInitial(displayName || '?')
      }
    </div>
  )
}

export default function ReviewThreadSheet({
  review,        // { entryId, bookTitle, bookAuthor, coverId, olKey, reviewBody, rating, reviewedAt, reviewer }
  user,
  friends,
  chats,
  myAvatarUrl,
  myDisplayName,
  onClose,
  onAddToTBR,
  onStartChat,
  onViewChat,
  onViewProfile,
  onAddFriend,
}) {
  const [comments, setComments]         = useState([])
  const [reviewLikes, setReviewLikes]   = useState([])
  const [commentInput, setCommentInput] = useState('')
  const [sending, setSending]           = useState(false)
  const [showBookDetail, setShowBookDetail] = useState(false)
  const [likingReview, setLikingReview] = useState(false)
  const [likingComment, setLikingComment] = useState(null) // comment id being liked
  const commentsEndRef = useRef(null)
  const textareaRef    = useRef(null)

  const friendIds = new Set((friends || []).map(f => f.userId))

  const myReviewLike  = reviewLikes.find(l => l.user_id === user?.id)
  const reviewLikeCount = reviewLikes.length

  useEffect(() => {
    if (review?.entryId) {
      loadComments()
      loadReviewLikes()
    }
  }, [review?.entryId])

  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [comments])

  async function loadComments() {
    const { data } = await sb
      .from('review_comments')
      .select('id, user_id, body, created_at')
      .eq('entry_id', review.entryId)
      .order('created_at', { ascending: true })

    if (data && data.length > 0) {
      // Fetch profiles separately via RPC to avoid cross-schema join issues
      const userIds = [...new Set(data.map(c => c.user_id))]
      let profileMap = {}
      const { data: profiles } = await sb.rpc('get_profiles_by_ids', { user_ids: userIds })
      ;(profiles || []).forEach(p => { profileMap[p.id] = p })

      // Enrich with comment likes
      const ids = data.map(c => c.id)
      let likesMap = {}
      if (ids.length) {
        const { data: clikes } = await sb
          .from('comment_likes')
          .select('comment_id, user_id')
          .in('comment_id', ids)
        ;(clikes || []).forEach(l => {
          if (!likesMap[l.comment_id]) likesMap[l.comment_id] = []
          likesMap[l.comment_id].push(l)
        })
      }
      setComments(data.map(c => ({
        ...c,
        profiles: profileMap[c.user_id] || null,
        likes: likesMap[c.id] || []
      })))
    } else {
      setComments([])
    }
  }

  async function loadReviewLikes() {
    const { data } = await sb
      .from('review_likes')
      .select('id, user_id')
      .eq('entry_id', review.entryId)
    setReviewLikes(data || [])
  }

  async function toggleReviewLike() {
    if (!user || likingReview) return
    setLikingReview(true)
    if (myReviewLike) {
      // Unlike
      await sb.from('review_likes').delete().eq('id', myReviewLike.id)
      setReviewLikes(prev => prev.filter(l => l.id !== myReviewLike.id))
    } else {
      // Like
      const { data } = await sb.from('review_likes')
        .insert({ entry_id: review.entryId, user_id: user.id })
        .select('id, user_id').single()
      if (data) setReviewLikes(prev => [...prev, data])
      // Notify reviewer if not self
      if (review.reviewer?.userId && review.reviewer.userId !== user.id) {
        await sb.from('notifications').insert({
          user_id:    review.reviewer.userId,
          actor_id:   user.id,
          type:       'review_liked',
          entry_id:   review.entryId,
          book_title: review.bookTitle || null,
        })
      }
    }
    setLikingReview(false)
  }

  async function toggleCommentLike(comment) {
    if (!user || likingComment === comment.id) return
    setLikingComment(comment.id)
    const myLike = comment.likes.find(l => l.user_id === user.id)
    if (myLike) {
      await sb.from('comment_likes').delete().eq('comment_id', comment.id).eq('user_id', user.id)
      setComments(prev => prev.map(c =>
        c.id === comment.id ? { ...c, likes: c.likes.filter(l => l.user_id !== user.id) } : c
      ))
    } else {
      await sb.from('comment_likes').insert({ comment_id: comment.id, user_id: user.id })
      setComments(prev => prev.map(c =>
        c.id === comment.id ? { ...c, likes: [...c.likes, { user_id: user.id }] } : c
      ))
      // Notify comment author if not self
      if (comment.user_id !== user.id) {
        await sb.from('notifications').insert({
          user_id:    comment.user_id,
          actor_id:   user.id,
          type:       'comment_liked',
          entry_id:   review.entryId,
          comment_id: comment.id,
          book_title: review.bookTitle || null,
        })
      }
    }
    setLikingComment(null)
  }

  async function sendComment() {
    if (!commentInput.trim() || sending || !user) return
    setSending(true)
    const body = commentInput.trim()
    setCommentInput('')

    const { data } = await sb.from('review_comments')
      .insert({ entry_id: review.entryId, user_id: user.id, body })
      .select('id, user_id, body, created_at').single()

    if (data) {
      const myProfile = {
        display_name: myDisplayName || user.email?.split('@')[0] || 'Me',
        username: null,
        avatar_url: myAvatarUrl || null,
      }
      setComments(prev => [...prev, { ...data, likes: [], profiles: myProfile }])

      // Notify reviewer if I'm not the reviewer
      if (review.reviewer?.userId && review.reviewer.userId !== user.id) {
        await sb.from('notifications').insert({
          user_id:    review.reviewer.userId,
          actor_id:   user.id,
          type:       'review_commented',
          entry_id:   review.entryId,
          comment_id: data.id,
          book_title: review.bookTitle || null,
        })
      }

      // Notify all other thread participants (thread_activity)
      const participantIds = new Set(comments.map(c => c.user_id))
      participantIds.delete(user.id)
      participantIds.delete(review.reviewer?.userId) // already notified above
      if (participantIds.size > 0) {
        await sb.from('notifications').insert(
          [...participantIds].map(uid => ({
            user_id:    uid,
            actor_id:   user.id,
            type:       'thread_activity',
            entry_id:   review.entryId,
            comment_id: data.id,
            book_title: review.bookTitle || null,
          }))
        )
      }
    }
    setSending(false)
  }

  const existingChat = review.olKey
    ? (chats || []).find(c => c.bookOlKey === review.olKey)
    : null

  const stars = review.rating
    ? '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating)
    : null

  if (showBookDetail) {
    return (
      <BookDetailPanel
        book={{ title: review.bookTitle, author: review.bookAuthor, coverId: review.coverId, olKey: review.olKey, status: null }}
        location="home-feed"
        user={user}
        existingChatId={existingChat?.id || null}
        onClose={() => setShowBookDetail(false)}
        onAddToTBR={() => { onAddToTBR?.(); setShowBookDetail(false) }}
        onOpenChatModal={(chatId, book) => {
          setShowBookDetail(false)
          const c = (chats || []).find(x => x.id === chatId)
          if (c) onViewChat?.(c.id)
        }}
        onMarkFinished={() => setShowBookDetail(false)}
        onStartReading={() => setShowBookDetail(false)}
        onEdit={() => setShowBookDetail(false)}
        onRecommend={() => setShowBookDetail(false)}
      />
    )
  }

  return (
    <ModalShell onClose={onClose} maxWidth={520}>
      {/* ── Navy book header ── */}
      <div style={{
        background: 'linear-gradient(160deg, #111C35 0%, var(--rt-navy) 100%)',
        padding: '1rem 1rem 0.9rem',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'flex-start' }}>
          {/* Cover */}
          <div style={{ width: 52, height: 76, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: 'rgba(255,255,255,0.08)', boxShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>
            <CoverImage coverId={review.coverId} olKey={review.olKey} title={review.bookTitle} size="M"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          {/* Title + actions */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.95rem', fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '0.1rem' }}>
              {review.bookTitle}
            </div>
            {review.bookAuthor && (
              <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', marginBottom: '0.6rem' }}>
                by {review.bookAuthor}
              </div>
            )}
            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={onAddToTBR}
                style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.28rem 0.7rem', borderRadius: 99, border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                + To Read
              </button>
              <button onClick={() => existingChat ? onViewChat?.(existingChat.id) : onStartChat?.()}
                style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.28rem 0.7rem', borderRadius: 99, border: 'none', background: 'var(--rt-amber)', color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {existingChat ? 'View chat' : 'Start chat'}
              </button>
              <button onClick={() => setShowBookDetail(true)}
                style={{ fontSize: '0.7rem', fontWeight: 600, padding: '0.28rem 0', border: 'none', background: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', textDecoration: 'underline', whiteSpace: 'nowrap' }}>
                Book details ↓
              </button>
            </div>
          </div>
          {/* Close */}
          <button onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%', width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', fontSize: '0.95rem', flexShrink: 0 }}>
            ×
          </button>
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div style={{ overflowY: 'auto', flex: 1 }}>

        {/* ── Review block ── */}
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--rt-border)' }}>
          {/* Reviewer row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
            <Avatar
              userId={review.reviewer?.userId}
              displayName={review.reviewer?.displayName}
              avatarUrl={review.reviewer?.avatarUrl}
              size={28}
            />
            <button
              onClick={() => onViewProfile?.(review.reviewer)}
              style={{ background: 'none', border: 'none', padding: 0, cursor: onViewProfile ? 'pointer' : 'default', fontSize: '0.88rem', fontWeight: 700, color: 'var(--rt-navy)', textDecoration: onViewProfile ? 'underline' : 'none', textUnderlineOffset: 2 }}
            >
              {review.reviewer?.displayName || 'Friend'}
            </button>
            {stars && <span style={{ fontSize: '0.85rem', color: 'var(--rt-amber)', marginLeft: 'auto', letterSpacing: '1px' }}>{stars}</span>}
          </div>

          {/* Review text */}
          <div style={{ background: 'var(--rt-cream)', borderRadius: 'var(--rt-r3)', borderLeft: '3px solid var(--rt-amber)', padding: '0.65rem 0.85rem', marginBottom: '0.6rem' }}>
            <p style={{ fontSize: '0.88rem', color: 'var(--rt-navy)', lineHeight: 1.6, margin: 0 }}>
              {review.reviewBody}
            </p>
          </div>

          {/* Like row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              onClick={toggleReviewLike}
              disabled={likingReview}
              style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: myReviewLike ? '#C84B4B' : 'var(--rt-t3)' }}
            >
              <HeartIcon filled={!!myReviewLike} size={15} />
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: myReviewLike ? '#C84B4B' : 'var(--rt-t3)' }}>
                {reviewLikeCount > 0 ? reviewLikeCount : ''} {reviewLikeCount === 1 ? 'like' : reviewLikeCount > 1 ? 'likes' : 'Like'}
              </span>
            </button>
            {review.reviewedAt && (
              <span style={{ fontSize: '0.72rem', color: 'var(--rt-t3)', marginLeft: 'auto' }}>{fmtDate(review.reviewedAt)}</span>
            )}
          </div>
        </div>

        {/* ── Comments ── */}
        <div style={{ padding: '0.75rem 1rem' }}>
          {comments.length > 0 && (
            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.75rem' }}>
              {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
            </div>
          )}

          {comments.map(c => {
            const name       = c.profiles?.display_name || c.profiles?.username || 'Someone'
            const avUrl      = c.profiles?.avatar_url || null
            const isFriend   = friendIds.has(c.user_id)
            const isMe       = c.user_id === user?.id
            const myComLike  = c.likes.find(l => l.user_id === user?.id)
            const comLikeCount = c.likes.length

            return (
              <div key={c.id} style={{ display: 'flex', gap: '0.55rem', marginBottom: '1rem' }}>
                <Avatar userId={c.user_id} displayName={name} avatarUrl={avUrl} size={24} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Name row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.2rem', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => !isMe && onViewProfile?.({ userId: c.user_id, displayName: name, avatarUrl: avUrl })}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: (!isMe && onViewProfile) ? 'pointer' : 'default', fontSize: '0.82rem', fontWeight: 700, color: 'var(--rt-navy)', textDecoration: (!isMe && onViewProfile) ? 'underline' : 'none', textUnderlineOffset: 2 }}
                    >
                      {name}
                    </button>
                    {/* Add friend pill for non-friends */}
                    {!isFriend && !isMe && (
                      <button
                        onClick={() => onAddFriend?.({ userId: c.user_id, displayName: name, avatarUrl: avUrl })}
                        style={{ fontSize: '0.6rem', fontWeight: 700, background: 'var(--rt-surface)', border: '1px solid var(--rt-border-md)', borderRadius: 99, padding: '0.1rem 0.45rem', color: 'var(--rt-t2)', cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        + Add
                      </button>
                    )}
                    <span style={{ fontSize: '0.68rem', color: 'var(--rt-t3)', marginLeft: 'auto' }}>{timeAgo(c.created_at)}</span>
                  </div>
                  {/* Comment body */}
                  <p style={{ fontSize: '0.85rem', color: 'var(--rt-navy)', lineHeight: 1.5, margin: '0 0 0.3rem' }}>{c.body}</p>
                  {/* Comment like */}
                  <button
                    onClick={() => toggleCommentLike(c)}
                    disabled={likingComment === c.id}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: myComLike ? '#C84B4B' : 'var(--rt-t3)' }}
                  >
                    <HeartIcon filled={!!myComLike} size={12} />
                    {comLikeCount > 0 && (
                      <span style={{ fontSize: '0.7rem', color: myComLike ? '#C84B4B' : 'var(--rt-t3)' }}>{comLikeCount}</span>
                    )}
                  </button>
                </div>
              </div>
            )
          })}
          <div ref={commentsEndRef} />
        </div>
      </div>

      {/* ── Write comment ── */}
      <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--rt-border)', display: 'flex', gap: '0.55rem', alignItems: 'flex-end', flexShrink: 0 }}>
        <Avatar userId={user?.id} displayName={myDisplayName} avatarUrl={myAvatarUrl} size={28} />
        <div style={{ flex: 1, background: 'var(--rt-surface)', borderRadius: 18, border: '1px solid var(--rt-border-md)', padding: '0.45rem 0.85rem', display: 'flex', alignItems: 'center' }}>
          <textarea
            ref={textareaRef}
            rows={1}
            value={commentInput}
            onChange={e => {
              setCommentInput(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
            }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendComment() } }}
            placeholder="Add a comment…"
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', resize: 'none', fontFamily: 'var(--rt-font-body)', fontSize: '0.85rem', color: 'var(--rt-navy)', lineHeight: 1.4, maxHeight: 120, overflowY: 'auto' }}
          />
        </div>
        <button
          onClick={sendComment}
          disabled={!commentInput.trim() || sending}
          style={{ width: 32, height: 32, borderRadius: '50%', background: commentInput.trim() ? 'var(--rt-navy)' : 'var(--rt-surface)', border: 'none', cursor: commentInput.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.15s' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={commentInput.trim() ? '#fff' : 'var(--rt-t3)'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
    </ModalShell>
  )
}