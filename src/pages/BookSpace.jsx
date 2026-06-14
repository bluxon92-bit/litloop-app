// src/pages/BookSpace.jsx
//
// The Book Space — a book's public forum page.
// Aggregates all public feed_events for a given ol_key.
// Entry points: BookSheet "Visit Space" link, Discover Spaces tab,
//               finish flow CTA, "+ Share Moment" pill in header.
//
// Props:
//   book       — { olKey, title, author, coverId, coverUrl }
//   user       — current auth user
//   onClose    — () => void
//   onOpenMomentComposer — (book) => void  triggers MomentComposer with book pre-selected

import { useState, useEffect, useRef } from 'react'
import { sb } from '../lib/supabase'
import { avatarColour, avatarInitial, timeAgo } from '../lib/utils'
import CoverImage from '../components/books/CoverImage'
import ReviewThreadSheet from '../components/ReviewThreadSheet'
import ReportSheet from '../components/ReportSheet'
import { ModalShell } from '../components/books/BookSheet'
import { useSocialContext } from '../context/SocialContext'
import { useChatContext } from '../context/ChatContext'

// ── Spoiler-aware post body (mirrors Feed.jsx) ─────────────────
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
        display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden',
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

// ── Post action sheet ──────────────────────────────────────────
function PostActionSheet({ open, onClose, onFlagSpoiler, onBlock, onReport, alreadyFlagged }) {
  if (!open) return null
  const itemStyle = {
    display: 'flex', alignItems: 'center', gap: '0.75rem',
    padding: '0.9rem 1.25rem', background: 'none', border: 'none',
    width: '100%', textAlign: 'left', cursor: 'pointer',
    fontSize: '0.88rem', fontWeight: 600, color: 'var(--rt-navy)',
    borderBottom: '1px solid var(--rt-border)',
  }
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(10,15,30,0.45)', zIndex: 600, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'var(--rt-white)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 520, paddingBottom: 'env(safe-area-inset-bottom, 0px)', overflow: 'hidden' }}>
        <div style={{ width: 36, height: 4, borderRadius: 99, background: 'var(--rt-border-md)', margin: '10px auto 4px' }} />
        <button style={itemStyle} onClick={() => { onFlagSpoiler(); onClose() }}>
          <span style={{ fontSize: '1rem' }}>⚠️</span>
          <div>
            <div>{alreadyFlagged ? 'Remove spoiler flag' : 'Flag as spoiler'}</div>
            <div style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--rt-t3)', marginTop: '0.1rem' }}>
              {alreadyFlagged ? 'Remove your spoiler flag' : 'Mark as containing unmarked spoilers'}
            </div>
          </div>
        </button>
        <button style={{ ...itemStyle, color: '#991b1b' }} onClick={() => { onBlock(); onClose() }}>
          <span style={{ fontSize: '1rem' }}>🚫</span>
          <div>
            <div>Block user</div>
            <div style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--rt-t3)', marginTop: '0.1rem' }}>Their posts won't appear in your feed or Spaces</div>
          </div>
        </button>
        <button style={{ ...itemStyle, borderBottom: 'none', color: '#991b1b' }} onClick={() => { onReport(); onClose() }}>
          <span style={{ fontSize: '1rem' }}>🚩</span>
          <div>
            <div>Report post</div>
            <div style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--rt-t3)', marginTop: '0.1rem' }}>Let us know if this breaks our guidelines</div>
          </div>
        </button>
        <button onClick={onClose} style={{ display: 'block', width: '100%', padding: '1rem', background: 'var(--rt-surface)', border: 'none', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 700, color: 'var(--rt-t2)', marginTop: '0.5rem' }}>
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Star display ───────────────────────────────────────────────
function Stars({ value, small = false }) {
  if (!value) return null
  const size = small ? '0.7rem' : '0.85rem'
  return (
    <span style={{ color: 'var(--rt-amber)', fontSize: size, letterSpacing: '0.5px' }}>
      {'★'.repeat(value)}{'☆'.repeat(5 - value)}
    </span>
  )
}

// ── Rating bar chart ───────────────────────────────────────────
function RatingBars({ summary }) {
  const max = Math.max(summary.stars_1, summary.stars_2, summary.stars_3, summary.stars_4, summary.stars_5, 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', flex: 1 }}>
      {[5,4,3,2,1].map(n => {
        const count = summary[`stars_${n}`] || 0
        const pct   = Math.round((count / max) * 100)
        return (
          <div key={n} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.6rem', color: 'var(--rt-t3)', width: 8, textAlign: 'right', flexShrink: 0 }}>{n}</span>
            <div style={{ flex: 1, height: 5, borderRadius: 99, background: 'var(--rt-border-md)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: 'var(--rt-amber)', borderRadius: 99, transition: 'width 0.4s ease' }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Individual Space post card ─────────────────────────────────
function SpacePostCard({ ev, user, myFlaggedIds, onOpenThread, onBlock, onReport, onFlagSpoiler }) {
  const [actionSheetOpen, setActionSheetOpen] = useState(false)
  const [localFlagCount, setLocalFlagCount]   = useState(ev._flagCount || 0)
  const [myFlagged, setMyFlagged]             = useState(myFlaggedIds?.has(ev.moment_id || ev.id) || false)
  const [likes, setLikes]                     = useState(ev._likeCount || 0)
  const [myLiked, setMyLiked]                 = useState(ev._myLiked || false)
  const [liking, setLiking]                   = useState(false)

  const p           = ev.profiles || {}
  const displayName = ev.display_name || p.display_name || p.username || 'Reader'
  const username    = ev.username || p.username || ''
  const avatarUrl   = ev.avatar_url || p.avatar_url || null
  const colour      = avatarColour(ev.user_id)
  const isQuote     = ev.moment_type === 'quote'
  const isReview    = ev.event_type === 'posted_review' || ev.event_type === 'finished'
  const body        = ev.moment_body || ev.review_body || ''
  const isSpoiler   = !!ev.spoiler_warning || localFlagCount >= 3
  const barCol      = isQuote ? 'var(--rt-amber)' : isReview ? 'var(--rt-navy)' : 'var(--rt-teal)'
  const eventId     = ev.moment_id || ev.id
  const dateStr     = ev.created_at
    ? new Date(ev.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : ''

  async function toggleLike(e) {
    e.stopPropagation()
    if (!user || liking) return
    setLiking(true)
    if (myLiked) {
      await sb.from('review_likes').delete().eq('entry_id', eventId).eq('user_id', user.id)
      setLikes(c => Math.max(0, c - 1))
      setMyLiked(false)
    } else {
      await sb.from('review_likes').insert({ entry_id: eventId, user_id: user.id })
      setLikes(c => c + 1)
      setMyLiked(true)
    }
    setLiking(false)
  }

  async function handleFlagSpoiler() {
    if (myFlagged) {
      await sb.from('post_flags').delete()
        .eq('flagged_by', user.id).eq('event_id', eventId).eq('flag_type', 'spoiler')
      setMyFlagged(false)
      setLocalFlagCount(c => Math.max(0, c - 1))
    } else {
      await sb.from('post_flags').insert({ flagged_by: user.id, event_id: eventId, flag_type: 'spoiler' })
      setMyFlagged(true)
      setLocalFlagCount(c => c + 1)
    }
    onFlagSpoiler?.()
  }

  const typeBadge = isReview
    ? { bg: 'var(--rt-amber-pale)', col: 'var(--rt-amber-text)', label: ev.rating ? `${ev.rating}★ Review` : 'Review' }
    : isQuote
    ? { bg: 'var(--rt-amber-pale)', col: 'var(--rt-amber-text)', label: 'Quote' }
    : { bg: '#e1f5ee', col: '#085041', label: ev.page_ref ? `Reading · ${ev.page_ref}%` : 'Reading update' }

  return (
    <div style={{ background: 'var(--rt-white)', border: '1px solid var(--rt-border)', borderRadius: 12, padding: '0.85rem', marginBottom: '0.65rem' }}>

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.65rem', flexWrap: 'wrap' }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: colour, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.62rem', fontWeight: 700, color: '#fff', overflow: 'hidden' }}>
          {avatarUrl ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : avatarInitial(displayName)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--rt-navy)' }}>{displayName}</span>
          {username && <span style={{ fontSize: '0.7rem', color: 'var(--rt-t3)', marginLeft: '0.3rem' }}>@{username}</span>}
        </div>
        <span style={{ fontSize: '0.65rem', color: 'var(--rt-t3)', flexShrink: 0 }}>{dateStr}</span>
        {user?.id !== ev.user_id && (
          <button
            onClick={e => { e.stopPropagation(); setActionSheetOpen(true) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--rt-t3)', fontSize: '1.1rem', padding: '0 0.1rem', lineHeight: 1, flexShrink: 0, letterSpacing: '0.05em' }}
          >⋯</button>
        )}
      </div>

      {/* Type badge + spoiler flag */}
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.55rem', flexWrap: 'wrap' }}>
        <span style={{ background: typeBadge.bg, color: typeBadge.col, borderRadius: 99, padding: '0.15em 0.55em', fontSize: '0.65rem', fontWeight: 700 }}>
          {typeBadge.label}
        </span>
        {localFlagCount >= 3 && (
          <span style={{ background: '#fef3c7', color: '#92400e', borderRadius: 99, padding: '0.15em 0.55em', fontSize: '0.62rem', fontWeight: 700 }}>
            ⚠ Spoiler flagged
          </span>
        )}
      </div>

      {/* Body */}
      {body ? (
        <SpoilerBody isSpoiler={isSpoiler} isItalic={isQuote} barCol={barCol} onClick={() => onOpenThread(ev)}>
          {body}
        </SpoilerBody>
      ) : null}

      {/* Engagement row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', marginTop: '0.65rem', paddingTop: '0.55rem', borderTop: '0.5px solid var(--rt-border)' }}>
        <button
          onClick={toggleLike}
          disabled={liking}
          style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: myLiked ? '#C84B4B' : 'var(--rt-t3)', fontSize: '0.82rem', fontWeight: 500 }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill={myLiked ? '#C84B4B' : 'none'} stroke={myLiked ? '#C84B4B' : 'currentColor'} strokeWidth="1.8">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
          <span>{likes > 0 ? likes : 'Like'}</span>
        </button>
        <button
          onClick={() => onOpenThread(ev)}
          style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--rt-t3)', fontSize: '0.82rem', fontWeight: 500 }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span>{ev._commentCount > 0 ? ev._commentCount : 'Comment'}</span>
        </button>
      </div>

      <PostActionSheet
        open={actionSheetOpen}
        onClose={() => setActionSheetOpen(false)}
        alreadyFlagged={myFlagged}
        onFlagSpoiler={handleFlagSpoiler}
        onBlock={() => onBlock?.(ev.user_id)}
        onReport={() => onReport?.({ userId: ev.user_id, contentType: 'feed_event', contentId: eventId })}
      />
    </div>
  )
}

// ── Main BookSpace component ───────────────────────────────────
export default function BookSpace({ book, user, onClose, onOpenMomentComposer }) {
  const { friends, submitReport, blockUser } = useSocialContext()
  const { chats, startOrOpenChat }           = useChatContext()

  const [posts, setPosts]               = useState([])
  const [loading, setLoading]           = useState(true)
  const [sort, setSort]                 = useState('hot')       // 'hot' | 'recent'
  const [ratingSummary, setRatingSummary] = useState(null)
  const [friendRatings, setFriendRatings] = useState([])
  const [postCount, setPostCount]       = useState(0)
  const [newSince, setNewSince]         = useState(0)
  const [headerCollapsed, setHeaderCollapsed] = useState(false)
  const [activeReview, setActiveReview] = useState(null)
  const [reportTarget, setReportTarget] = useState(null)
  const [toast, setToast]               = useState(null)
  const [myFlaggedIds, setMyFlaggedIds] = useState(new Set())
  const scrollRef = useRef(null)
  const toastTimer = useRef(null)

  const olKey = book?.olKey || book?.ol_key

  // ── On mount: upsert space_subscription + load last_visited_at ──
  useEffect(() => {
    if (!user || !olKey) return

    // Start loading posts immediately with lastVisited=null (no newSince badge yet).
    // In parallel, fetch the previous last_visited_at so we can patch newSince once known.
    // This avoids 2 sequential subscription round trips before any content fetches begin.
    loadAll(null)

    async function updateSubscription() {
      const { data: existing } = await sb
        .from('space_subscriptions')
        .select('last_visited_at')
        .eq('user_id', user.id)
        .eq('ol_key', olKey)
        .single()

      const lastVisited = existing?.last_visited_at || null

      await sb.from('space_subscriptions').upsert({
        user_id:         user.id,
        ol_key:          olKey,
        last_visited_at: new Date().toISOString(),
      }, { onConflict: 'user_id,ol_key' })

      // Patch newSince count now that we know the real last_visited_at
      if (lastVisited) {
        setPosts(prev => {
          const newCount = prev.filter(ev => new Date(ev.created_at) > new Date(lastVisited)).length
          setNewSince(newCount)
          return prev
        })
      }
    }

    updateSubscription()
  }, [user?.id, olKey])

  // ── Load everything ────────────────────────────────────────
  async function loadAll(lastVisited) {
    if (!olKey) return
    setLoading(true)
    await Promise.all([
      loadPosts(lastVisited),
      loadRatingSummary(),
      loadFriendRatings(),
      loadMyFlags(),
    ])
    setLoading(false)
  }

  async function loadPosts(lastVisited) {
    const { data } = await sb
      .from('feed_events')
      .select('id, user_id, event_type, book_ol_key, book_title, book_author, cover_id, cover_url, review_body, rating, moment_id, moment_type, moment_body, page_ref, spoiler_warning, visibility, created_at')
      .eq('book_ol_key', olKey)
      .eq('visibility', 'public')
      .in('event_type', ['posted_review', 'finished', 'book_moment'])
      .order('created_at', { ascending: false })
      .limit(100)

    if (!data) { setPosts([]); setPostCount(0); return }

    // Enrich with profiles
    const userIds = [...new Set(data.map(e => e.user_id))]
    let profileMap = {}
    if (userIds.length) {
      const { data: profiles } = await sb
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', userIds)
      ;(profiles || []).forEach(p => { profileMap[p.id] = p })
    }

    // Enrich with like counts + comment counts + flag counts
    const eventIds = data.map(e => e.moment_id || e.id).filter(Boolean)
    let likeMap = {}, commentMap = {}, flagMap = {}, myLikeSet = new Set()

    if (eventIds.length) {
      const [likesRes, commentsRes, flagsRes, myLikesRes] = await Promise.all([
        sb.from('review_likes').select('entry_id').in('entry_id', eventIds),
        sb.from('review_comments').select('entry_id').in('entry_id', eventIds),
        sb.from('post_flags').select('event_id').eq('flag_type', 'spoiler').in('event_id', eventIds),
        user ? sb.from('review_likes').select('entry_id').in('entry_id', eventIds).eq('user_id', user.id) : { data: [] },
      ])
      ;(likesRes.data || []).forEach(r => { likeMap[r.entry_id] = (likeMap[r.entry_id] || 0) + 1 })
      ;(commentsRes.data || []).forEach(r => { commentMap[r.entry_id] = (commentMap[r.entry_id] || 0) + 1 })
      ;(flagsRes.data || []).forEach(r => { flagMap[r.event_id] = (flagMap[r.event_id] || 0) + 1 })
      ;(myLikesRes.data || []).forEach(r => myLikeSet.add(r.entry_id))
    }

    const enriched = data.map(ev => {
      const eid = ev.moment_id || ev.id
      const p   = profileMap[ev.user_id] || {}
      return {
        ...ev,
        display_name:   p.display_name || null,
        username:       p.username     || null,
        avatar_url:     p.avatar_url   || null,
        _likeCount:     likeMap[eid]     || 0,
        _commentCount:  commentMap[eid]  || 0,
        _flagCount:     flagMap[eid]     || 0,
        _myLiked:       myLikeSet.has(eid),
        _heat: (() => {
          const ageDays = (Date.now() - new Date(ev.created_at)) / 86400000
          const decay   = Math.max(0.1, 1 / (1 + ageDays / 7))
          return ((likeMap[eid] || 0) * 2 + (commentMap[eid] || 0) * 3) * decay
        })(),
      }
    })

    // Deduplicate: for same user+book, prefer posted_review over finished
    const moments = enriched.filter(ev => ev.event_type === 'book_moment')
    const reviews = enriched.filter(ev => ev.event_type === 'posted_review' || ev.event_type === 'finished')
    const seen = new Map()
    for (const ev of reviews) {
      const key = ev.user_id
      const existing = seen.get(key)
      if (!existing || ev.event_type === 'posted_review') seen.set(key, ev)
    }
    const deduped = [...moments, ...seen.values()]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

    // Count new since last visit
    if (lastVisited) {
      const newCount = deduped.filter(ev => new Date(ev.created_at) > new Date(lastVisited)).length
      setNewSince(newCount)
    }

    setPostCount(deduped.length)
    setPosts(deduped)
  }

  async function loadRatingSummary() {
    const { data } = await sb
      .from('book_rating_summary')
      .select('avg_rating, rating_count, stars_1, stars_2, stars_3, stars_4, stars_5')
      .eq('ol_key', olKey)
      .single()
    setRatingSummary(data || null)
  }

  async function loadFriendRatings() {
    if (!friends?.length || !olKey) return
    const friendIds = friends.map(f => f.userId)

    // Join through books table to filter by ol_key
    const { data: entries } = await sb
      .from('reading_entries')
      .select('user_id, rating, books!inner(ol_key)')
      .in('user_id', friendIds)
      .not('rating', 'is', null)
      .eq('books.ol_key', olKey)

    if (!entries?.length) { setFriendRatings([]); return }

    const enriched = entries.map(e => {
      const friend = friends.find(f => f.userId === e.user_id)
      return {
        userId:      e.user_id,
        rating:      e.rating,
        displayName: friend?.displayName || 'Friend',
        avatarUrl:   friend?.avatarUrl   || null,
      }
    }).filter(e => e.rating)

    setFriendRatings(enriched)
  }

  async function loadMyFlags() {
    if (!user) return
    const { data } = await sb
      .from('post_flags')
      .select('event_id')
      .eq('flagged_by', user.id)
      .eq('flag_type', 'spoiler')
    setMyFlaggedIds(new Set((data || []).map(f => f.event_id)))
  }

  // ── Sort posts ─────────────────────────────────────────────
  const sortedPosts = [...posts].sort((a, b) =>
    sort === 'hot'
      ? b._heat - a._heat
      : new Date(b.created_at) - new Date(a.created_at)
  )

  // ── Scroll collapse ────────────────────────────────────────
  function handleScroll(e) {
    setHeaderCollapsed(e.target.scrollTop > 100)
  }

  // ── Toast helper ───────────────────────────────────────────
  function showToast(msg) {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2500)
  }

  // ── Block handler ──────────────────────────────────────────
  async function handleBlock(userId) {
    await blockUser(userId)
    setPosts(prev => prev.filter(ev => ev.user_id !== userId))
    showToast('User blocked')
  }

  // ── Open thread ────────────────────────────────────────────
  function openThread(ev) {
    const displayName = ev.display_name || 'Reader'
    const username    = ev.username || ''
    const avatarUrl   = ev.avatar_url || null
    setActiveReview({
      entryId:    ev.moment_id || ev.id,
      bookTitle:  book.title  || '',
      bookAuthor: book.author || '',
      coverId:    book.coverId || null,
      coverUrl:   book.coverUrl || null,
      olKey,
      reviewBody: ev.moment_body || ev.review_body || '',
      rating:     ev.rating || null,
      reviewedAt: ev.created_at,
      reviewer:   { userId: ev.user_id, displayName, username, avatarUrl },
    })
  }

  const coverSrc = book.coverUrl
    || (book.coverId ? `https://covers.openlibrary.org/b/id/${book.coverId}-M.jpg` : null)
    || (olKey ? `https://covers.openlibrary.org/b/olid/${(olKey).replace('/works/', '')}-M.jpg` : null)

  // ── Empty state ────────────────────────────────────────────
  const isEmpty = !loading && posts.length === 0

  return (
    <>
      <style>{`
        .space-page {
          position: fixed; inset: 0; z-index: 450;
          background: var(--rt-cream);
          display: flex; flex-direction: column;
          overflow: hidden;
        }
        .space-scroll {
          flex: 1; overflow-y: auto;
          -webkit-overflow-scrolling: touch;
        }
        .space-header-full {
          background: var(--rt-navy);
          padding: 0;
          transition: all 0.25s ease;
          flex-shrink: 0;
          position: relative;
        }
        .space-header-collapsed {
          background: var(--rt-navy);
          padding: 0;
          flex-shrink: 0;
        }
      `}</style>

      <div className="space-page">

        {/* ── Header ── */}
        <div className={headerCollapsed ? 'space-header-collapsed' : 'space-header-full'}>

          {/* Safe area + back row */}
          <div style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingLeft: '1rem', paddingRight: '1rem', paddingBottom: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', height: 48 }}>
              <button
                onClick={onClose}
                style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', flexShrink: 0 }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' }}>Space</div>
                <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.92rem', fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {book.title}
                </div>
              </div>
              {/* + Share Moment pill */}
              <button
                onClick={() => onOpenMomentComposer?.(book)}
                style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'var(--rt-amber)', border: 'none', borderRadius: 99, padding: '0.35rem 0.85rem', cursor: 'pointer', color: '#fff', fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap' }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Share Moment
              </button>
            </div>
          </div>

          {/* Expanded content — book info + rating */}
          {!headerCollapsed && (
            <div style={{ padding: '0.75rem 1rem 1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'flex-start' }}>
                {/* Cover — only render if we have a src */}
                {coverSrc && (
                  <div style={{ width: 52, height: 76, borderRadius: 6, overflow: 'hidden', flexShrink: 0, boxShadow: '0 3px 12px rgba(0,0,0,0.4)', background: 'rgba(255,255,255,0.08)' }}>
                    <img src={coverSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {book.author && (
                    <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', marginBottom: '0.4rem' }}>{book.author}</div>
                  )}
                  {/* Rating summary */}
                  {ratingSummary && ratingSummary.rating_count > 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.5rem' }}>
                      <div>
                        <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.6rem', fontWeight: 700, color: '#fff', lineHeight: 1 }}>
                          {ratingSummary.avg_rating}
                        </div>
                        <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.5)', marginTop: '0.1rem' }}>
                          {ratingSummary.rating_count} rating{ratingSummary.rating_count !== 1 ? 's' : ''}
                        </div>
                      </div>
                      <RatingBars summary={ratingSummary} />
                    </div>
                  ) : null}
                  {/* Friend ratings */}
                  {friendRatings.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                      <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)' }}>Friends:</span>
                      {friendRatings.slice(0, 4).map((fr, i) => (
                        <span key={i} style={{ fontSize: '0.65rem', background: 'rgba(255,255,255,0.12)', color: '#fff', borderRadius: 99, padding: '0.1em 0.5em', fontWeight: 600 }}>
                          {fr.displayName.split(' ')[0]} · {fr.rating}★
                        </span>
                      ))}
                    </div>
                  )}
                  {/* Post count + new since */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.35rem' }}>
                    <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)' }}>
                      {postCount} post{postCount !== 1 ? 's' : ''} in this Space
                    </span>
                    {newSince > 0 && (
                      <span style={{ fontSize: '0.68rem', background: 'var(--rt-amber)', color: '#fff', borderRadius: 99, padding: '0.1em 0.55em', fontWeight: 700 }}>
                        {newSince} new since your last visit
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Sort toggle ── */}
        <div style={{ padding: '0.65rem 1rem', borderBottom: '1px solid var(--rt-border)', background: 'var(--rt-white)', display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginRight: '0.25rem' }}>Sort</span>
          {[{ id: 'hot', label: '🔥 Most engaged' }, { id: 'recent', label: '🕐 Recent' }].map(s => (
            <button
              key={s.id}
              onClick={() => setSort(s.id)}
              style={{ padding: '0.25rem 0.75rem', borderRadius: 99, fontSize: '0.75rem', fontWeight: 600, border: `1.5px solid ${sort === s.id ? 'var(--rt-navy)' : 'var(--rt-border-md)'}`, background: sort === s.id ? 'var(--rt-navy)' : 'var(--rt-white)', color: sort === s.id ? '#fff' : 'var(--rt-t2)', cursor: 'pointer', transition: 'all 0.15s' }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* ── Scrollable content ── */}
        <div className="space-scroll" onScroll={handleScroll} ref={scrollRef}>
          <div style={{ padding: '0.85rem 1rem 5rem', maxWidth: 760, margin: '0 auto' }}>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--rt-t3)', fontSize: '0.85rem' }}>Loading Space…</div>
            ) : isEmpty ? (
              <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📖</div>
                <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1rem', fontWeight: 700, color: 'var(--rt-navy)', marginBottom: '0.4rem' }}>
                  No posts yet
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--rt-t3)', lineHeight: 1.6, marginBottom: '1.25rem' }}>
                  Be the first to share a moment, quote, or review about {book.title}.
                </div>
                <button
                  onClick={() => onOpenMomentComposer?.(book)}
                  style={{ background: 'var(--rt-amber)', color: '#fff', border: 'none', borderRadius: 99, padding: '0.65rem 1.5rem', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}
                >
                  + Share a moment
                </button>
              </div>
            ) : (
              sortedPosts.map(ev => (
                <SpacePostCard
                  key={ev.moment_id || ev.id}
                  ev={ev}
                  user={user}
                  myFlaggedIds={myFlaggedIds}
                  onOpenThread={openThread}
                  onBlock={handleBlock}
                  onReport={target => setReportTarget(target)}
                  onFlagSpoiler={() => {}}
                />
              ))
            )}
          </div>
        </div>

        {/* ── ReviewThreadSheet ── */}
        {activeReview && (
          <ReviewThreadSheet
            review={activeReview}
            user={user}
            friends={friends}
            chats={chats}
            myAvatarUrl={null}
            myDisplayName={null}
            onClose={() => setActiveReview(null)}
            onAddToTBR={() => setActiveReview(null)}
            onStartChat={async () => {
              const r = activeReview
              setActiveReview(null)
              await startOrOpenChat(r.olKey, r.bookTitle, r.bookAuthor, r.coverId, [r.reviewer.userId])
            }}
            onViewChat={() => setActiveReview(null)}
            onViewProfile={() => setActiveReview(null)}
            onAddFriend={() => {}}
            submitReport={submitReport}
          />
        )}

        {/* ── ReportSheet ── */}
        <ReportSheet
          open={!!reportTarget}
          onClose={() => setReportTarget(null)}
          title="Report content"
          description="Help us understand what's wrong."
          onSubmit={async (reason, note) => {
            await submitReport({ ...reportTarget, reason, note })
          }}
        />

        {/* ── Toast ── */}
        {toast && (
          <div style={{ position: 'fixed', bottom: '5rem', left: '50%', transform: 'translateX(-50%)', background: 'var(--rt-navy)', color: '#fff', borderRadius: 99, padding: '0.55rem 1.1rem', fontSize: '0.82rem', fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.25)', zIndex: 9999, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
            {toast}
          </div>
        )}
      </div>
    </>
  )
}