import { useState, useEffect, useRef } from 'react'
import { sb } from '../lib/supabase'
import { useAuthContext } from '../context/AuthContext'
import { useSocialContext } from '../context/SocialContext'
import { useChatContext } from '../context/ChatContext'
import { useBooksContext } from '../context/BooksContext'
import { avatarColour, avatarInitial, timeAgo } from '../lib/utils'
import CoverImage from '../components/books/CoverImage'
import ReviewThreadSheet from '../components/ReviewThreadSheet'
import BookDetailPanel from '../components/books/BookDetailPanel'
import { ModalShell } from '../components/books/BookSheet'
import { uploadCoverToSupabase } from '../lib/coverCache'

// ── Background cover upgrader ──────────────────────────────────
// Runs after feed loads. For events missing cover_url but having coverId+olKey,
// uploads the OL cover to Supabase Storage and patches feed_events in the DB.
// Next time the feed loads, cover_url is populated — no storage.list needed.
const upgradedCoverIds = new Set() // session-level, avoid re-uploading

async function upgradeCovers(events) {
  const candidates = (events || []).filter(ev =>
    ev.cover_id && ev.book_ol_key && !ev.cover_url && !upgradedCoverIds.has(ev.cover_id)
  )
  // Process one at a time to avoid hammering storage
  for (const ev of candidates.slice(0, 5)) {
    upgradedCoverIds.add(ev.cover_id)
    try {
      const url = await uploadCoverToSupabase(ev.cover_id, ev.book_ol_key)
      if (url) {
        // Patch the feed_events row so future loads have cover_url
        await sb.from('feed_events')
          .update({ cover_url: url })
          .eq('cover_id', ev.cover_id)
          .is('cover_url', null)
        // Also invalidate the following cache so next load gets the updated URL
        clearCached('following')
      }
    } catch { /* ignore individual failures */ }
  }
}

// ── Persistent cache — survives page refresh and app restarts ──
// Stores feed data in localStorage with TTL.
// Falls back to in-memory if localStorage unavailable (private browsing).
const CACHE_TTL_MS     = 5 * 60 * 1000  // 5 minutes for cross-session
const CACHE_PREFIX     = 'litloop_feed_'

function readCache(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key)
    if (!raw) return null
    const { data, ts } = JSON.parse(raw)
    if (Date.now() - ts > CACHE_TTL_MS) { localStorage.removeItem(CACHE_PREFIX + key); return null }
    return data
  } catch { return null }
}

function writeCache(key, data) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, ts: Date.now() }))
  } catch (e) {
    // localStorage full or unavailable — fail silently
    if (e.name === 'QuotaExceededError') {
      // Clear old feed caches to make space
      try {
        ['following', 'recentlyActive', 'suggested'].forEach(k => localStorage.removeItem(CACHE_PREFIX + k))
        localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, ts: Date.now() }))
      } catch { /* ignore */ }
    }
  }
}

function invalidateCache(key) {
  try { localStorage.removeItem(CACHE_PREFIX + key) } catch { /* ignore */ }
}

// In-memory fallback for within-session use
const memCache = {
  following:      { data: null, ts: 0 },
  recentlyActive: { data: null, ts: 0 },
  suggested:      { data: null, ts: 0 },
}

function getCached(key) {
  // Try localStorage first (cross-session)
  const stored = readCache(key)
  if (stored) return stored
  // Fall back to memory cache (within-session)
  const mem = memCache[key]
  if (mem.data && (Date.now() - mem.ts) < CACHE_TTL_MS) return mem.data
  return null
}

function setCached(key, data) {
  memCache[key] = { data, ts: Date.now() }
  writeCache(key, data)
}

function clearCached(key) {
  memCache[key] = { data: null, ts: 0 }
  invalidateCache(key)
}

// ── User profile sheet (for non-friend public profiles) ───────
function UserProfileSheet({ userId, user, followingIds, onFollowChange, onClose }) {
  const [profile, setProfile]   = useState(null)
  const [posts, setPosts]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [followerCount, setFollowerCount] = useState(null)

  useEffect(() => {
    if (!userId) return
    setLoading(true)
    Promise.all([
      sb.from('profiles').select('id, username, display_name, avatar_url, bio').eq('id', userId).single(),
      sb.from('feed_events')
        .select('id, event_type, book_ol_key, book_title, book_author, cover_id, cover_url, review_body, rating, moment_type, moment_body, spoiler_warning, created_at')
        .eq('user_id', userId)
        .eq('visibility', 'public')
        .in('event_type', ['posted_review', 'finished', 'book_moment'])
        .order('created_at', { ascending: false })
        .limit(10),
      sb.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', userId),
    ]).then(([profileRes, postsRes, followerRes]) => {
      setProfile(profileRes.data)
      // Deduplicate posts
      const raw = postsRes.data || []
      const moments = raw.filter(e => e.event_type === 'book_moment')
      const reviews = raw.filter(e => e.event_type === 'posted_review' || e.event_type === 'finished')
      const seen = new Map()
      for (const ev of reviews) {
        const key = ev.book_ol_key || ev.book_title
        if (!seen.has(key) || ev.event_type === 'posted_review') seen.set(key, ev)
      }
      setPosts([...moments, ...seen.values()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)))
      setFollowerCount(followerRes.count || 0)
      setLoading(false)
    })
  }, [userId])

  if (!userId) return null
  const isFollowing = followingIds.has(userId)
  const colour      = avatarColour(userId)

  return (
    <ModalShell onClose={onClose} maxWidth={520}>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--rt-t3)', fontSize: '0.85rem' }}>Loading…</div>
        ) : !profile ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--rt-t3)' }}>Profile not found.</div>
        ) : (
          <>
            {/* Hero */}
            <div style={{ background: 'var(--rt-navy)', padding: '1.5rem 1.25rem 1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '0.75rem' }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: colour, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', fontWeight: 700, color: '#fff', overflow: 'hidden', border: '2px solid rgba(255,255,255,0.2)' }}>
                  {profile.avatar_url ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : avatarInitial(profile.display_name || profile.username)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1rem', fontWeight: 700, color: '#fff' }}>{profile.display_name || profile.username}</div>
                  {profile.username && <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', marginTop: '0.1rem' }}>@{profile.username}</div>}
                </div>
                {userId !== user?.id && (
                  <FollowButton userId={userId} initialFollowing={isFollowing} onFollowChange={following => { onFollowChange(userId, following); setFollowerCount(c => c + (following ? 1 : -1)) }} />
                )}
              </div>
              {profile.bio && <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.7)', lineHeight: 1.5, marginBottom: '0.75rem' }}>{profile.bio}</div>}
              <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)' }}>{followerCount} follower{followerCount !== 1 ? 's' : ''}</div>
            </div>

            {/* Recent posts */}
            <div style={{ padding: '1rem' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.75rem' }}>Recent posts</div>
              {posts.length === 0 ? (
                <div style={{ fontSize: '0.82rem', color: 'var(--rt-t3)', padding: '0.5rem 0' }}>No public posts yet.</div>
              ) : posts.map(ev => {
                const rating = ev.rating || 0
                const stars  = rating ? '★'.repeat(rating) + '☆'.repeat(5 - rating) : ''
                const text   = ev.review_body || ev.moment_body || ''
                const dateStr = ev.created_at ? new Date(ev.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''
                return (
                  <div key={ev.id} style={{ display: 'flex', gap: '0.65rem', alignItems: 'flex-start', padding: '0.65rem 0', borderBottom: '0.5px solid var(--rt-border)' }}>
                    {(ev.cover_url || ev.cover_id) && (
                      <div style={{ width: 40, height: 58, borderRadius: 4, overflow: 'hidden', flexShrink: 0, background: 'var(--rt-surface)' }}>
                        <CoverImage coverId={ev.cover_id} olKey={null} coverUrl={ev.cover_url} title={ev.book_title || ''} size="S" lazy={true} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                        {stars && <span style={{ fontSize: '0.75rem', color: 'var(--rt-amber)' }}>{stars}</span>}
                        <span style={{ fontSize: '0.65rem', color: 'var(--rt-t3)', marginLeft: 'auto' }}>{dateStr}</span>
                      </div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--rt-navy)', marginBottom: '0.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.book_title}</div>
                      {text && <div style={{ fontSize: '0.78rem', color: 'var(--rt-t2)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{text}</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </ModalShell>
  )
}

// ── Spoiler-aware body ─────────────────────────────────────────
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

// ── Engagement bar ─────────────────────────────────────────────
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

// ── Follow button ──────────────────────────────────────────────
function FollowButton({ userId, initialFollowing, onFollowChange }) {
  const [following, setFollowing] = useState(initialFollowing)
  const [loading, setLoading]     = useState(false)

  async function toggle(e) {
    e.stopPropagation()
    if (loading) return
    setLoading(true)
    const fn = following ? 'unfollow_user' : 'follow_user'
    const { error } = await sb.rpc(fn, { p_following_id: userId })
    if (!error) {
      setFollowing(f => !f)
      onFollowChange?.(!following)
    }
    setLoading(false)
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      style={{
        padding: '0.3rem 0.85rem', borderRadius: 99, fontSize: '0.75rem', fontWeight: 700,
        border: following ? '1.5px solid var(--rt-border-md)' : '1.5px solid var(--rt-navy)',
        background: following ? 'var(--rt-white)' : 'var(--rt-navy)',
        color: following ? 'var(--rt-t2)' : '#fff',
        cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1,
        transition: 'all 0.15s', whiteSpace: 'nowrap', flexShrink: 0,
      }}
    >
      {loading ? '…' : following ? 'Following' : 'Follow'}
    </button>
  )
}

// ── Suggested reader card ──────────────────────────────────────
function SuggestedCard({ person, onFollowed, onOpenProfile }) {
  const colour = avatarColour(person.user_id)
  const init   = avatarInitial(person.display_name || person.username)
  const signalLabel = {
    five_star_match: '★ Same taste',
    reading_now:     '📖 Reading now',
    just_finished:   '✓ Just finished',
  }[person.signal] || ''

  return (
    <div style={{
      background: 'var(--rt-white)', border: '1px solid var(--rt-border)',
      borderRadius: 12, padding: '0.85rem 1rem',
      display: 'flex', alignItems: 'center', gap: '0.75rem',
      marginBottom: '0.6rem',
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: '50%', background: colour, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '1rem', fontWeight: 700, color: '#fff', overflow: 'hidden',
      }}>
        {person.avatar_url
          ? <img src={person.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : init}
      </div>
      <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => onOpenProfile?.(person.user_id)}>
        <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.88rem', fontWeight: 700, color: 'var(--rt-navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {person.display_name || person.username}
        </div>
        {person.username && (
          <div style={{ fontSize: '0.7rem', color: 'var(--rt-t3)' }}>@{person.username}</div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
          {signalLabel && (
            <span style={{ fontSize: '0.65rem', color: 'var(--rt-teal)', fontWeight: 600 }}>{signalLabel}</span>
          )}
          {person.signal_book && (
            <span style={{ fontSize: '0.65rem', color: 'var(--rt-t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
              {person.signal_book}
            </span>
          )}
          {person.books_in_common > 0 && (
            <span style={{ fontSize: '0.65rem', color: 'var(--rt-t3)' }}>· {person.books_in_common} books in common</span>
          )}
        </div>
      </div>
      <FollowButton userId={person.user_id} initialFollowing={false} onFollowChange={onFollowed} />
    </div>
  )
}

// ── Feed card ──────────────────────────────────────────────────
function FeedCard({ ev, user, isFriend, isFollowing, onOpenThread, onOpenDetail, onFollowChange, onOpenProfile }) {
  // Profile data may be:
  // - top-level fields (from public_reading_events view)
  // - nested under ev.profiles (from SocialContext friends feed)
  const p           = ev.profiles || {}
  const displayName = ev.display_name || p.display_name || p.username || 'Reader'
  const username    = ev.username    || p.username    || ''
  const avatarUrl   = ev.avatar_url  || p.avatar_url  || null
  const colour      = avatarColour(ev.user_id)
  const init        = avatarInitial(displayName)
  const coverId     = ev.cover_id    || null
  const olKey       = ev.book_ol_key || null
  const coverUrl    = ev.cover_url   || null
  const hasCover    = coverId || olKey || coverUrl
  const rating      = ev.rating      || 0
  const stars       = rating ? '★'.repeat(rating) + '☆'.repeat(5 - rating) : ''
  const reviewText  = ev.review_body || ''
  const isSpoiler   = !!ev.spoiler_warning
  const dateStr     = ev.created_at
    ? new Date(ev.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : ''

  const cardStyle = {
    background: 'var(--rt-white)', border: '1px solid var(--rt-border)',
    borderRadius: 12, padding: '0.75rem', marginBottom: '0.65rem',
  }

  const avatarEl = (
    <div style={{ width: 26, height: 26, borderRadius: '50%', background: colour, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 700, color: '#fff', flexShrink: 0, overflow: 'hidden' }}>
      {avatarUrl ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : init}
    </div>
  )

  const relationshipBadge = !isFriend && !isFollowing
    ? <span style={{ fontSize: '0.6rem', background: 'var(--rt-surface)', color: 'var(--rt-t3)', borderRadius: 99, padding: '0.1em 0.5em', fontWeight: 600 }}>Suggested</span>
    : !isFriend
    ? <span style={{ fontSize: '0.6rem', background: '#e1f5ee', color: '#085041', borderRadius: 99, padding: '0.1em 0.5em', fontWeight: 600 }}>Following</span>
    : null

  // Pass olKey=null to prevent CoverImage from triggering uploadCoverToSupabase
  // which calls storage.list() — expensive and causes 40s LCP on feed pages.
  // Feed cards show covers for reference only; upgrading happens on book detail pages.
  const coverEl = hasCover ? (
    <div style={{ width: 56, height: 82, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: 'var(--rt-surface)', boxShadow: '0 2px 8px rgba(26,39,68,0.13)' }}>
      <CoverImage coverId={coverId} olKey={null} coverUrl={coverUrl} title={ev.book_title || ''} size="M" lazy={true} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </div>
  ) : (
    <div style={{ width: 56, height: 82, borderRadius: 6, flexShrink: 0, background: 'var(--rt-surface)' }} />
  )

  // ── Moment / Quote card ──────────────────────────────────────
  if (ev.event_type === 'book_moment' && ev.moment_id) {
    const isQuote  = ev.moment_type === 'quote'
    const barCol   = isQuote ? 'var(--rt-amber)' : 'var(--rt-teal)'
    const badgeBg  = isQuote ? 'var(--rt-amber-pale)' : '#e1f5ee'
    const badgeCol = isQuote ? 'var(--rt-amber-text)' : '#085041'
    const badgeTxt = isQuote ? 'Quote' : 'Reading update'
    return (
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
          {avatarEl}
          <span onClick={() => onOpenProfile?.(ev.user_id)} style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--rt-navy)', cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'transparent' }} onMouseEnter={e => e.target.style.textDecorationColor='var(--rt-navy)'} onMouseLeave={e => e.target.style.textDecorationColor='transparent'}>{displayName}</span>
          {username && <span style={{ fontSize: '0.7rem', color: 'var(--rt-t3)' }}>@{username}</span>}
          {relationshipBadge}
          <span style={{ fontSize: '0.65rem', color: 'var(--rt-t3)', marginLeft: 'auto' }}>{dateStr}</span>
          {!isFriend && (
            <FollowButton userId={ev.user_id} initialFollowing={isFollowing} onFollowChange={following => onFollowChange?.(ev.user_id, following)} />
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginBottom: '0.5rem' }}>
          <span style={{ background: badgeBg, color: badgeCol, borderRadius: 99, padding: '0.15em 0.55em', fontSize: '0.65rem', fontWeight: 700 }}>
            {badgeTxt}{ev.page_ref ? ` · ${ev.page_ref}%` : ''}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', marginBottom: '0.6rem' }}>
          {coverEl}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.88rem', fontWeight: 700, color: 'var(--rt-navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '0.15rem' }}>{ev.book_title || ''}</div>
            {ev.book_author && <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)', marginBottom: '0.4rem' }}>{ev.book_author}</div>}
            <SpoilerBody isSpoiler={isSpoiler} isItalic={isQuote} barCol={barCol} onClick={() => onOpenThread(ev)}>
              {ev.moment_body}
            </SpoilerBody>
          </div>
        </div>
        <div style={{ height: '0.5px', background: 'var(--rt-border)', marginBottom: '0.5rem' }} />
        <FeedEngagementBar entryId={ev.moment_id} user={user} onOpenThread={() => onOpenThread(ev)} />
      </div>
    )
  }

  // ── Review card ──────────────────────────────────────────────
  if (!reviewText) return null
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
        {avatarEl}
        <span onClick={() => onOpenProfile?.(ev.user_id)} style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--rt-navy)', cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'transparent' }} onMouseEnter={e => e.target.style.textDecorationColor='var(--rt-navy)'} onMouseLeave={e => e.target.style.textDecorationColor='transparent'}>{displayName}</span>
        {username && <span style={{ fontSize: '0.7rem', color: 'var(--rt-t3)' }}>@{username}</span>}
        {relationshipBadge}
        <span style={{ fontSize: '0.65rem', color: 'var(--rt-t3)', marginLeft: 'auto' }}>{dateStr}</span>
        {!isFriend && (
          <FollowButton userId={ev.user_id} initialFollowing={isFollowing} onFollowChange={following => onFollowChange?.(ev.user_id, following)} />
        )}
      </div>
      {stars && <div style={{ fontSize: '0.82rem', color: 'var(--rt-amber)', letterSpacing: '0.5px', marginBottom: '0.5rem' }}>{stars}</div>}
      <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', marginBottom: '0.6rem' }}
        onClick={() => onOpenDetail({ id: ev.id, title: ev.book_title, author: ev.book_author, coverId, coverUrl, olKey })}>
        {coverEl}
        <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
          <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.88rem', fontWeight: 700, color: 'var(--rt-navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '0.15rem' }}>{ev.book_title || ''}</div>
          {ev.book_author && <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)', marginBottom: '0.4rem' }}>{ev.book_author}</div>}
          <SpoilerBody isSpoiler={isSpoiler} barCol="var(--rt-navy)" onClick={e => { e.stopPropagation(); onOpenThread(ev) }}>
            {reviewText}
          </SpoilerBody>
        </div>
      </div>
      <div style={{ height: '0.5px', background: 'var(--rt-border)', marginBottom: '0.5rem' }} />
      <FeedEngagementBar entryId={ev.id} user={user} onOpenThread={() => onOpenThread(ev)} />
    </div>
  )
}

// ── Search results dropdown ────────────────────────────────────
function SearchDropdown({ results, onSelectUser, onSelectBook, onClose }) {
  if (!results) return null
  const { users = [], books = [] } = results
  if (!users.length && !books.length) return (
    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--rt-white)', border: '1px solid var(--rt-border)', borderRadius: 'var(--rt-r3)', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 200, padding: '1rem', textAlign: 'center', fontSize: '0.82rem', color: 'var(--rt-t3)' }}>
      No results
    </div>
  )
  return (
    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--rt-white)', border: '1px solid var(--rt-border)', borderRadius: 'var(--rt-r3)', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 200, maxHeight: 320, overflowY: 'auto' }}>
      {users.length > 0 && (
        <>
          <div style={{ padding: '0.4rem 0.85rem', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--rt-t3)', textTransform: 'uppercase', borderBottom: '1px solid var(--rt-border)' }}>People</div>
          {users.map(u => (
            <div key={u.id} onClick={() => { onSelectUser(u); onClose() }}
              style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.6rem 0.85rem', cursor: 'pointer', borderBottom: '1px solid var(--rt-border)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--rt-surface)'}
              onMouseLeave={e => e.currentTarget.style.background = ''}
            >
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: avatarColour(u.id), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, color: '#fff', flexShrink: 0, overflow: 'hidden' }}>
                {u.avatar_url ? <img src={u.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : avatarInitial(u.display_name || u.username)}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--rt-navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.display_name || u.username}</div>
                {u.username && <div style={{ fontSize: '0.7rem', color: 'var(--rt-t3)' }}>@{u.username}</div>}
              </div>
            </div>
          ))}
        </>
      )}
      {books.length > 0 && (
        <>
          <div style={{ padding: '0.4rem 0.85rem', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--rt-t3)', textTransform: 'uppercase', borderBottom: '1px solid var(--rt-border)' }}>Books</div>
          {books.map(b => (
            <div key={b.id} onClick={() => { onSelectBook(b); onClose() }}
              style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.6rem 0.85rem', cursor: 'pointer', borderBottom: '0.5px solid var(--rt-border)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--rt-surface)'}
              onMouseLeave={e => e.currentTarget.style.background = ''}
            >
              <div style={{ width: 28, height: 42, borderRadius: 4, overflow: 'hidden', flexShrink: 0, background: 'var(--rt-surface)' }}>
                {(b.cover_id || b.ol_key || b.cover_url) && (
                  <CoverImage coverId={b.cover_id} olKey={b.ol_key} coverUrl={b.cover_url} title={b.title} size="S" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                )}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--rt-navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</div>
                {b.author && <div style={{ fontSize: '0.7rem', color: 'var(--rt-t3)' }}>{b.author}</div>}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

// ── Main Feed page ─────────────────────────────────────────────
export default function Feed({ onNavigate, onOpenChatModal }) {
  const { user }                          = useAuthContext()
  const { myDisplayName, myAvatarUrl, myBio, myUsername, friends, feed, blockedIds } = useSocialContext()
  const { chats, startOrOpenChat }        = useChatContext()
  const { books, addBook, findDuplicate } = useBooksContext()

  // ── State ──────────────────────────────────────────────────
  const [feedFilter, setFeedFilter]         = useState('all')
  const [friendFeed, setFriendFeed]         = useState([])
  const [followingFeed, setFollowingFeed]   = useState([])
  const [suggested, setSuggested]           = useState(null)
  const [recentlyActive, setRecentlyActive] = useState(null)
  const [recentlyActiveLoading, setRecentlyActiveLoading] = useState(false)
  const [followingIds, setFollowingIds]     = useState(new Set())
  const [loading, setLoading]               = useState(true)
  const [activeReview, setActiveReview]     = useState(null)
  const [detailBook, setDetailBook]         = useState(null)
  const [searchQuery, setSearchQuery]       = useState('')
  const [searchResults, setSearchResults]   = useState(null)
  const [searchFocused, setSearchFocused]   = useState(false)
  const [collapsed, setCollapsed]           = useState(false)
  const [toast, setToast]                   = useState(null)
  const [viewingProfile, setViewingProfile] = useState(null) // userId

  const searchRef    = useRef(null)
  const toastTimer   = useRef(null)
  const searchTimer  = useRef(null)

  // ── Toast ──────────────────────────────────────────────────
  useEffect(() => {
    if (!toast) return
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(toastTimer.current)
  }, [toast])

  // ── Load following list ────────────────────────────────────
  useEffect(() => {
    if (!user) return
    sb.from('follows')
      .select('following_id')
      .eq('follower_id', user.id)
      .then(({ data }) => {
        setFollowingIds(new Set((data || []).map(r => r.following_id)))
      })
  }, [user])

  // ── Load feeds ─────────────────────────────────────────────
  useEffect(() => {
    if (!user) return
    loadFeeds()
  }, [user])

  async function loadFeeds() {
    setLoading(true)
    const blocked   = new Set(blockedIds || [])
    const friendIds = new Set((friends || []).map(f => f.userId))

    // Friends feed — from SocialContext, already in memory, set immediately
    const ff = (feed || []).filter(ev =>
      friendIds.has(ev.user_id) && !blocked.has(ev.user_id) &&
      (ev.event_type === 'book_moment' || ev.event_type === 'posted_review' || ev.event_type === 'finished')
    )
    const seen = new Map()
    const reviews = ff.filter(ev => ev.event_type === 'posted_review' || ev.event_type === 'finished')
    for (const ev of reviews) {
      const key = `${ev.user_id}__${ev.book_ol_key}`
      const existing = seen.get(key)
      if (!existing || ev.event_type === 'posted_review') seen.set(key, ev)
    }
    const moments = ff.filter(ev => ev.event_type === 'book_moment')
    const friendFeedData = [...moments, ...seen.values()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    setFriendFeed(friendFeedData)
    // Show friend feed immediately — don't wait for following feed
    setLoading(false)

    // Following feed — use cache if fresh, otherwise fetch
    const cachedFollowing = getCached('following'); if (cachedFollowing) {
      setFollowingFeed(cachedFollowing)
      return
    }

    const { data: followData } = await sb
      .from('public_reading_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50) // reduced from 100

    const followFiltered = (followData || [])
      .filter(ev => !blocked.has(ev.user_id) && !friendIds.has(ev.user_id))

    const followMoments = followFiltered.filter(ev => ev.event_type === 'book_moment')
    const followReviews = followFiltered.filter(ev => ev.event_type === 'posted_review' || ev.event_type === 'finished')
    const followSeen = new Map()
    for (const ev of followReviews) {
      const key = `${ev.user_id}__${ev.book_ol_key}`
      const existing = followSeen.get(key)
      if (!existing || ev.event_type === 'posted_review') followSeen.set(key, ev)
    }
    const result = [...followMoments, ...followSeen.values()]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    setCached('following', result)
    setFollowingFeed(result)

    // Background: upgrade any feed events missing cover_url
    // Runs after render so it never blocks the UI
    setTimeout(() => upgradeCovers(result), 2000)
  }

  // ── Load suggested readers + recently active in parallel ──
  useEffect(() => {
    if (!user || feedFilter !== 'suggested') return
    if (suggested !== null && recentlyActive !== null) return
    if (suggested === null) loadSuggested()
    if (recentlyActive === null) loadRecentlyActive()
  }, [feedFilter, user])

  async function loadSuggested() {
    const cachedSuggested = getCached('suggested'); if (cachedSuggested) { setSuggested(cachedSuggested); return }
    const { data } = await sb.rpc('get_suggested_readers', { p_limit: 10 })
    const result = data || []
    setCached('suggested', result)
    setSuggested(result)
  }

  async function loadRecentlyActive() {
    const cachedRecent = getCached('recentlyActive'); if (cachedRecent) { setRecentlyActive(cachedRecent); setRecentlyActiveLoading(false); return }
    setRecentlyActiveLoading(true)

    const friendIds = new Set((friends || []).map(f => f.userId))
    const blocked   = new Set(blockedIds || [])

    // Run follows fetch and feed_events fetch in parallel
    const [followResult, feedResult] = await Promise.all([
      sb.from('follows').select('following_id').eq('follower_id', user.id),
      sb.from('feed_events')
        .select('id, user_id, event_type, book_ol_key, book_title, book_author, cover_id, cover_url, review_body, rating, moment_id, moment_type, moment_body, page_ref, spoiler_warning, visibility, created_at')
        .eq('visibility', 'public')
        .neq('user_id', user.id)
        .in('event_type', ['posted_review', 'finished', 'book_moment'])
        .order('created_at', { ascending: false })
        .limit(50), // reduced from 100
    ])

    const followingSet = new Set((followResult.data || []).map(r => r.following_id))

    const filtered = (feedResult.data || []).filter(ev =>
      !friendIds.has(ev.user_id) &&
      !followingSet.has(ev.user_id) &&
      !blocked.has(ev.user_id) &&
      ev.moment_type !== 'note'
    )

    // Enrich with profile data in a single batch query
    const uniqueUserIds = [...new Set(filtered.map(ev => ev.user_id))]
    let profileMap = {}
    if (uniqueUserIds.length > 0) {
      const { data: profiles } = await sb
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', uniqueUserIds)
      ;(profiles || []).forEach(p => { profileMap[p.id] = p })
    }

    // Attach profiles to events
    const withProfiles = filtered.map(ev => ({
      ...ev,
      display_name: profileMap[ev.user_id]?.display_name || null,
      username:     profileMap[ev.user_id]?.username     || null,
      avatar_url:   profileMap[ev.user_id]?.avatar_url   || null,
    }))

    // Deduplicate: prefer posted_review over finished for same user+book
    const moments = withProfiles.filter(ev => ev.event_type === 'book_moment')
    const reviews = withProfiles.filter(ev => ev.event_type === 'posted_review' || ev.event_type === 'finished')
    const seen = new Map()
    for (const ev of reviews) {
      const key = `${ev.user_id}__${ev.book_ol_key}`
      const existing = seen.get(key)
      if (!existing || ev.event_type === 'posted_review') seen.set(key, ev)
    }
    const deduped = [...moments, ...seen.values()]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

    setCached('recentlyActive', deduped)
    setRecentlyActive(deduped)
    setRecentlyActiveLoading(false)
  }

  // ── Scroll collapse — listen on window (AppShell scrolls the root) ──
  useEffect(() => {
    function handleScroll() {
      setCollapsed(window.scrollY > 80)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // ── Search ─────────────────────────────────────────────────
  function handleSearchChange(e) {
    const q = e.target.value
    setSearchQuery(q)
    clearTimeout(searchTimer.current)
    if (!q.trim()) { setSearchResults(null); return }
    searchTimer.current = setTimeout(() => runSearch(q.trim()), 300)
  }

  async function runSearch(q) {
    const lower = q.toLowerCase()
    // People search — profiles table
    const { data: users } = await sb
      .from('profiles')
      .select('id, username, display_name, avatar_url, bio')
      .or(`username.ilike.%${lower}%,display_name.ilike.%${lower}%`)
      .neq('id', user.id)
      .limit(5)
    // Book search — books catalogue
    const { data: books } = await sb
      .from('books')
      .select('id, title, author, cover_id, cover_url, ol_key')
      .or(`title.ilike.%${lower}%,author.ilike.%${lower}%`)
      .limit(4)
    setSearchResults({ users: users || [], books: books || [] })
  }

  // ── Follow change handler ──────────────────────────────────
  function handleFollowChange(userId, nowFollowing) {
    setFollowingIds(prev => {
      const next = new Set(prev)
      if (nowFollowing) next.add(userId)
      else next.delete(userId)
      return next
    })
    // Invalidate caches so next load reflects the new follow state
    clearCached('following')
    clearCached('recentlyActive')
    if (nowFollowing) loadFeeds()
    setRecentlyActive(null)
  }

  // ── Open review thread ─────────────────────────────────────
  function openThread(ev) {
    const displayName = ev.display_name || ev.profiles?.display_name || 'Reader'
    const username    = ev.username    || ev.profiles?.username    || ''
    const avatarUrl   = ev.avatar_url  || ev.profiles?.avatar_url  || null
    setActiveReview({
      entryId:    ev.moment_id || ev.id,
      bookTitle:  ev.book_title  || '',
      bookAuthor: ev.book_author || '',
      coverId:    ev.cover_id    || null,
      coverUrl:   ev.cover_url   || null,
      olKey:      ev.book_ol_key || null,
      reviewBody: ev.moment_body || ev.review_body || '',
      rating:     ev.rating      || null,
      reviewedAt: ev.created_at,
      reviewer:   { userId: ev.user_id, displayName, username, avatarUrl },
    })
  }

  // ── Computed feed for current filter ──────────────────────
  const friendIds    = new Set((friends || []).map(f => f.userId))
  const allFeedItems = (() => {
    if (feedFilter === 'friends')   return friendFeed
    if (feedFilter === 'following') return followingFeed
    if (feedFilter === 'suggested') return []
    // All: merge friends + non-friend following, deduplicate by event id
    const seenIds = new Set()
    const combined = [
      ...friendFeed.map(ev => ({ ...ev, _tier: 'friend' })),
      ...followingFeed.filter(ev => !friendIds.has(ev.user_id)).map(ev => ({ ...ev, _tier: 'following' })),
    ].filter(ev => {
      if (seenIds.has(ev.id)) return false
      seenIds.add(ev.id)
      return true
    })
    return combined.sort((a, b) => {
      const timeDiff = new Date(b.created_at) - new Date(a.created_at)
      // Within 24h, friends float to top
      if (Math.abs(timeDiff) < 86400000) {
        if (a._tier === 'friend' && b._tier !== 'friend') return -1
        if (b._tier === 'friend' && a._tier !== 'friend') return 1
      }
      return timeDiff
    })
  })()

  // ── Styles ─────────────────────────────────────────────────
  const avatarBg     = avatarColour(user?.id || 'x')
  const avatarLetter = avatarInitial(myDisplayName || myUsername || '')
  const displayName  = myDisplayName || myUsername || 'Reader'

  const FILTERS = [
    { id: 'all',       label: 'All'       },
    { id: 'friends',   label: 'Friends'   },
    { id: 'following', label: 'Following' },
    { id: 'suggested', label: 'Suggested' },
  ]
  const pillStyle = (active) => ({
    padding: '0.3rem 0.85rem', borderRadius: 99, fontSize: '0.75rem', fontWeight: 600,
    border: `1.5px solid ${active ? 'var(--rt-navy)' : 'var(--rt-border-md)'}`,
    background: active ? 'var(--rt-navy)' : 'var(--rt-white)',
    color: active ? '#fff' : 'var(--rt-t2)',
    cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s', flexShrink: 0,
  })

  return (
    <div
      className="rt-page"
      style={{ maxWidth: 760, margin: '0 auto', position: 'relative' }}
    >

      {/* ── Fixed header ── */}
      <style>{`
        .feed-fixed-header {
          left: 50%;
        }
        @media (min-width: 768px) {
          .feed-fixed-header {
            left: calc(50% + 110px);
          }
        }
      `}</style>
      <div className="feed-fixed-header" style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 0px) + 56px)',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: 760,
        zIndex: 50,
        background: 'var(--rt-cream)',
        paddingLeft: 'var(--rt-page-px, 1rem)',
        paddingRight: 'var(--rt-page-px, 1rem)',
        paddingTop: '0.5rem',
        paddingBottom: '0.5rem',
        boxSizing: 'border-box',
        borderBottom: '1px solid var(--rt-border)',
        transition: 'all 0.25s ease',
      }}>

        {/* Top row — transitions between expanded/collapsed */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: collapsed ? '0.5rem' : '0.6rem', transition: 'margin-bottom 0.25s ease' }}>

          {/* Avatar — only shown when expanded */}
          {!collapsed && (
            <div style={{
              width: 48, height: 48,
              borderRadius: '50%', background: avatarBg, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.1rem', fontWeight: 700, color: '#fff',
              overflow: 'hidden', border: '2px solid rgba(255,255,255,0.6)',
            }}>
              {myAvatarUrl
                ? <img src={myAvatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : avatarLetter}
            </div>
          )}

          {/* Name/bio — collapses into search bar */}
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
            {/* Expanded: name + username + bio */}
            <div style={{ opacity: collapsed ? 0 : 1, height: collapsed ? 0 : 'auto', overflow: 'hidden', transition: 'opacity 0.2s ease, height 0.25s ease', pointerEvents: collapsed ? 'none' : 'auto' }}>
              <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1rem', fontWeight: 700, color: 'var(--rt-navy)', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</div>
              {myUsername && <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)' }}>@{myUsername}</div>}
              {myBio && <div style={{ fontSize: '0.8rem', color: 'var(--rt-t2)', marginTop: '0.25rem', lineHeight: 1.4,
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{myBio}</div>}
            </div>

            {/* Collapsed: search bar takes full width */}
            <div style={{ opacity: collapsed ? 1 : 0, height: collapsed ? 'auto' : 0, overflow: 'hidden', transition: 'opacity 0.2s ease, height 0.25s ease', pointerEvents: collapsed ? 'auto' : 'none' }}
              ref={searchRef}>
              <div style={{ position: 'relative' }}>
                <input
                  className="rt-input"
                  style={{ width: '100%', boxSizing: 'border-box', paddingLeft: '2rem' }}
                  placeholder="Search people or books…"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                />
                <svg style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--rt-t3)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                {searchFocused && <SearchDropdown results={searchResults} onSelectUser={() => {}} onSelectBook={() => {}} onClose={() => { setSearchQuery(''); setSearchResults(null) }} />}
              </div>
            </div>
          </div>

          {/* Settings cog — always visible */}
          <button
            onClick={() => onNavigate('account')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--rt-t3)', padding: '0.25rem', flexShrink: 0 }}
            title="Settings"
          >
            <svg width={collapsed ? 18 : 20} height={collapsed ? 18 : 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'width 0.2s, height 0.2s' }}>
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>

        {/* Search bar — expanded state only */}
        <div style={{ opacity: collapsed ? 0 : 1, height: collapsed ? 0 : 'auto', overflow: 'hidden', transition: 'opacity 0.2s ease, height 0.25s ease', pointerEvents: collapsed ? 'none' : 'auto', marginBottom: collapsed ? 0 : '0.65rem' }}
          ref={collapsed ? null : searchRef}>
          <div style={{ position: 'relative' }}>
            <input
              className="rt-input"
              style={{ width: '100%', boxSizing: 'border-box', paddingLeft: '2rem' }}
              placeholder="Search people or books…"
              value={searchQuery}
              onChange={handleSearchChange}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
            />
            <svg style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--rt-t3)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            {searchFocused && !collapsed && <SearchDropdown results={searchResults} onSelectUser={() => {}} onSelectBook={() => {}} onClose={() => { setSearchQuery(''); setSearchResults(null) }} />}
          </div>
        </div>

        {/* Filter pills — always visible */}
        <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', scrollbarWidth: 'none' }}>
          {FILTERS.map(f => (
            <button key={f.id} onClick={() => setFeedFilter(f.id)} style={pillStyle(feedFilter === f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Feed content ── pushes below fixed header */}
      <div style={{ paddingTop: collapsed ? '120px' : '200px', paddingBottom: '4rem', transition: 'padding-top 0.2s' }}>

        {/* Suggested — people cards, not a post feed */}
        {feedFilter === 'suggested' && (
          suggested === null ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--rt-t3)', fontSize: '0.85rem' }}>Loading…</div>
          ) : (
            <>
              {/* Suggested readers based on taste */}
              {suggested.length > 0 && (
                <>
                  <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.5rem' }}>
                    Based on your taste
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)', marginBottom: '0.85rem', lineHeight: 1.5 }}>
                    Readers with similar books, ratings, and reading history.
                  </div>
                  {suggested.map(p => (
                    <SuggestedCard key={p.user_id} person={p} onFollowed={() => handleFollowChange(p.user_id, true)} onOpenProfile={userId => setViewingProfile(userId)} />
                  ))}
                </>
              )}

              {/* Recently active — always shown, deprioritised when suggestions exist */}
              <div style={{ marginTop: suggested.length > 0 ? '1.5rem' : 0 }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.5rem' }}>
                  Recently active readers
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)', marginBottom: '0.85rem', lineHeight: 1.5 }}>
                  {suggested.length === 0
                    ? 'Rate and review more books to get personalised suggestions. In the meantime, explore what others are reading.'
                    : 'Other readers active on Litloop.'}
                </div>
                {recentlyActiveLoading || recentlyActive === null ? (
                  <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--rt-t3)', fontSize: '0.82rem' }}>Loading…</div>
                ) : recentlyActive.length === 0 ? (
                  <div style={{ fontSize: '0.82rem', color: 'var(--rt-t3)', padding: '1rem 0' }}>No recent activity yet.</div>
                ) : (
                  recentlyActive.map(ev => (
                    <FeedCard
                      key={ev.id}
                      ev={ev}
                      user={user}
                      isFriend={false}
                      isFollowing={followingIds.has(ev.user_id)}
                      onOpenThread={openThread}
                      onOpenDetail={book => setDetailBook(book)}
                      onFollowChange={handleFollowChange}
                      onOpenProfile={userId => setViewingProfile(userId)}
                    />
                  ))
                )}
              </div>
            </>
          )
        )}

        {/* All / Friends / Following — post feed */}
        {feedFilter !== 'suggested' && (
          loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--rt-t3)', fontSize: '0.85rem' }}>Loading…</div>
          ) : allFeedItems.length === 0 ? (
            <div className="rt-card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📖</div>
              <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--rt-navy)', marginBottom: '0.25rem' }}>
                {feedFilter === 'friends'   ? 'No posts from friends yet'
                 : feedFilter === 'following' ? 'No posts from people you follow yet'
                 : 'Nothing in your feed yet'}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--rt-t3)', lineHeight: 1.5 }}>
                {feedFilter === 'following' || feedFilter === 'all'
                  ? <><button onClick={() => setFeedFilter('suggested')} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--rt-amber)', fontWeight: 600, fontSize: 'inherit', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}>Find readers to follow</button> to see their posts here.</>
                  : 'Your friends haven\'t posted yet. Once they do, their reviews and moments will appear here.'}
              </div>
            </div>
          ) : (
            allFeedItems.map(ev => (
              <FeedCard
                key={ev.id}
                ev={ev}
                user={user}
                isFriend={friendIds.has(ev.user_id)}
                isFollowing={followingIds.has(ev.user_id)}
                onOpenThread={openThread}
                onOpenDetail={book => setDetailBook(book)}
                onFollowChange={handleFollowChange}
                onOpenProfile={userId => setViewingProfile(userId)}
              />
            ))
          )
        )}
      </div>

      {/* ── User profile sheet ── */}
      {viewingProfile && (
        <UserProfileSheet
          userId={viewingProfile}
          user={user}
          followingIds={followingIds}
          onFollowChange={handleFollowChange}
          onClose={() => setViewingProfile(null)}
        />
      )}

      {/* ── ReviewThreadSheet ── */}
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
              const label = dup.status === 'tbr' ? 'your To Read list' : dup.status === 'reading' ? 'Currently Reading' : 'your list'
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
            if (chatId) onOpenChatModal?.(chatId, { title: r.bookTitle, author: r.bookAuthor, coverId: r.coverId, olKey: r.olKey })
          }}
          onViewChat={chatId => {
            const c = chats.find(x => x.id === chatId)
            if (c) onOpenChatModal?.(c, { title: activeReview.bookTitle })
            setActiveReview(null)
          }}
          onViewProfile={() => setActiveReview(null)}
          onAddFriend={() => {}}
          submitReport={() => {}}
        />
      )}

      {/* ── BookDetailPanel ── */}
      {detailBook && (
        <BookDetailPanel
          book={detailBook}
          location="home-feed"
          user={user}
          existingChatId={chats?.find(c => c.bookOlKey === detailBook.olKey)?.id || null}
          onClose={() => setDetailBook(null)}
          onMarkFinished={() => setDetailBook(null)}
          onStartReading={() => setDetailBook(null)}
          onEdit={() => setDetailBook(null)}
          onRecommend={() => setDetailBook(null)}
          onAddToTBR={() => {
            addBook({ title: detailBook.title, author: detailBook.author, status: 'tbr', olKey: detailBook.olKey, coverId: detailBook.coverId })
            setDetailBook(null)
            setToast(`Added "${detailBook.title}" to your list`)
          }}
          onOpenChatModal={(chatId, book) => { onOpenChatModal?.(chatId, book || detailBook); setDetailBook(null) }}
          onStartChat={() => { onOpenChatModal?.(null, detailBook); setDetailBook(null) }}
          onViewChat={chatId => { onOpenChatModal?.(chatId); setDetailBook(null) }}
          onCoverUpdate={() => {}}
        />
      )}

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '5rem', left: '50%', transform: 'translateX(-50%)',
          background: 'var(--rt-navy)', color: '#fff', borderRadius: 99,
          padding: '0.55rem 1.1rem', fontSize: '0.82rem', fontWeight: 600,
          boxShadow: '0 4px 16px rgba(0,0,0,0.25)', zIndex: 9999,
          whiteSpace: 'nowrap', pointerEvents: 'none',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}
