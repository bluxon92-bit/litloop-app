import { useState, useEffect, useRef, useCallback } from 'react'
import { sb } from '../lib/supabase'

const MOODS = [
  { id: 'unputdownable',  label: 'Unputdownable' },
  { id: 'dark-and-twisty', label: 'Dark & Twisty' },
  { id: 'feel-everything', label: 'Feel Everything' },
  { id: 'pure-joy',       label: 'Pure Joy' },
  { id: 'big-and-epic',   label: 'Big & Epic' },
  { id: 'heart-and-soul', label: 'Heart & Soul' },
  { id: 'mind-bending',   label: 'Mind-Bending' },
  { id: 'expand-your-mind', label: 'Expand Your Mind' },
  { id: 'classics',       label: 'The Classics' },
]

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function cleanBookTitle(title) {
  return (title || '')
    .replace(/\s*\([^)]*#\d[^)]*\)/g, '')
    .replace(/[:\u2014\u2013].*/u, '')
    .trim()
}

const FEED_CACHE_KEY = 'litloop_feed_v1'
// Separate key for the raw editorial data (books + dismissals) — long-lived
const DATA_CACHE_KEY = 'litloop_data_v1'
const DATA_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

function readFeedCache() {
  try {
    const raw = sessionStorage.getItem(FEED_CACHE_KEY)
    if (!raw) return null
    const { feed, coverCache, userId: cachedUid, activeMood } = JSON.parse(raw)
    return { feed, coverCache, userId: cachedUid, activeMood }
  } catch { return null }
}

function writeFeedCache(userId, feed, coverCache, activeMood) {
  try {
    sessionStorage.setItem(FEED_CACHE_KEY, JSON.stringify({ userId, feed, coverCache, activeMood }))
  } catch {}
}

function readDataCache(userId) {
  try {
    const raw = localStorage.getItem(DATA_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed.userId !== userId) return null
    if (Date.now() - parsed.fetchedAt > DATA_TTL_MS) return null
    return parsed
  } catch { return null }
}

function writeDataCache(userId, allBooks, dismissals) {
  try {
    localStorage.setItem(DATA_CACHE_KEY, JSON.stringify({ userId, allBooks, dismissals, fetchedAt: Date.now() }))
  } catch {}
}

function invalidateDataCache() {
  try { localStorage.removeItem(DATA_CACHE_KEY) } catch {}
}

export function useLitLoopPicks({ userId, books = [], preferredMoods = [] }) {
  const [allBooks, setAllBooks]           = useState([])
  const [dismissedKeys, setDismissedKeys] = useState(new Set())
  const [loading, setLoading]             = useState(true)
  const [activeMood, setActiveMood]       = useState(null)

  // Restore feed from session cache immediately — avoids reload flicker
  const _cached = readFeedCache()
  const [feed, setFeed]             = useState(_cached?.userId === userId ? (_cached.feed || []) : [])
  const [coverCache, setCoverCache] = useState(_cached?.userId === userId ? (_cached.coverCache || {}) : {})

  // Track whether we have a valid session feed so we skip the rebuild on initial mount
  const hasFeedRef = useRef(_cached?.userId === userId && (_cached?.feed?.length > 0))

  // Stable ref to coverCache for use inside async functions without stale closure
  const coverCacheRef = useRef(coverCache)
  useEffect(() => { coverCacheRef.current = coverCache }, [coverCache])

  // Build a stable set of library keys from the books prop — only recompute when
  // the actual key list changes, not on every books array reference change.
  const libraryKeyString = books.map(b => b.olKey).filter(Boolean).sort().join(',')
  const libraryTitleString = books.map(b => (b.title || '').toLowerCase()).filter(Boolean).sort().join(',')

  const libraryKeys   = useRef(new Set())
  const libraryTitles = useRef(new Set())
  useEffect(() => {
    libraryKeys.current   = new Set(books.map(b => b.olKey).filter(Boolean))
    libraryTitles.current = new Set(books.map(b => (b.title || '').toLowerCase()).filter(Boolean))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryKeyString, libraryTitleString])

  function isInLibrary(book) {
    if (book.ol_key && libraryKeys.current.has(book.ol_key)) return true
    if (book.title && libraryTitles.current.has(book.title.toLowerCase())) return true
    return false
  }

  // ── Load editorial data (books + dismissals) ──────────────────
  // Uses a 30-day localStorage cache so we don't hit Supabase on every tab visit.
  useEffect(() => {
    if (!userId) return

    // If we already have session feed, show it immediately and load data silently
    // to ensure state is populated for shuffle/filter actions
    const dataCache = readDataCache(userId)
    if (dataCache) {
      const thirtyDaysAgo = new Date(Date.now() - DATA_TTL_MS)
      const recentDismissals = new Set(
        (dataCache.dismissals || [])
          .filter(d => new Date(d.dismissed_at) > thirtyDaysAgo)
          .map(d => d.book_ol_key)
      )
      setAllBooks(dataCache.allBooks || [])
      setDismissedKeys(recentDismissals)
      setLoading(false)
      return
    }

    // No valid cache — fetch from Supabase
    async function load() {
      setLoading(true)
      const [booksRes, dismissRes] = await Promise.all([
        sb.from('editorial_books').select('*').eq('active', true),
        sb.from('editorial_dismissals')
          .select('book_ol_key, dismissed_at')
          .eq('user_id', userId)
      ])

      const dismissals = dismissRes.data || []
      const thirtyDaysAgo = new Date(Date.now() - DATA_TTL_MS)
      const recentDismissals = new Set(
        dismissals
          .filter(d => new Date(d.dismissed_at) > thirtyDaysAgo)
          .map(d => d.book_ol_key)
      )

      const fetchedBooks = booksRes.data || []
      setAllBooks(fetchedBooks)
      setDismissedKeys(recentDismissals)
      writeDataCache(userId, fetchedBooks, dismissals)
      setLoading(false)
    }
    load()
  }, [userId])

  // ── Build feed ────────────────────────────────────────────────
  // Only runs when allBooks loads or when explicitly triggered (shuffle/filter).
  // Does NOT run on every books-prop change to prevent reshuffling on tab visits.
  const buildFeedFromState = useCallback((overrideMood, forceRebuild = false) => {
    if (!allBooks.length) return

    // On initial mount, if we already have a session-cached feed, skip the rebuild
    if (hasFeedRef.current && !forceRebuild) {
      hasFeedRef.current = false // allow future rebuilds (e.g. after dismiss/add)
      return
    }

    const mood = overrideMood !== undefined ? overrideMood : activeMood

    const eligible = allBooks.filter(b => !isInLibrary(b) && !dismissedKeys.has(b.ol_key))

    let result = []
    if (mood) {
      result = shuffle(eligible.filter(b => b.mood_id === mood))
    } else if (!preferredMoods.length) {
      result = shuffle(eligible).slice(0, 10)
    } else {
      const preferred = shuffle(eligible.filter(b => preferredMoods.includes(b.mood_id)))
      const outside   = shuffle(eligible.filter(b => !preferredMoods.includes(b.mood_id)))
      const picks     = preferred.slice(0, 7)
      const wildcards = outside.slice(0, 3).map(b => ({ ...b, _wildcard: true }))
      result = shuffle([...picks, ...wildcards])
    }

    const finalFeed = result.slice(0, mood ? result.length : 10)
    setFeed(finalFeed)
    writeFeedCache(userId, finalFeed, coverCacheRef.current, mood)

    const needsCovers = finalFeed.filter(
      book => !book.cover_id && book.ol_key && !coverCacheRef.current[book.ol_key]
    )
    if (needsCovers.length) fetchCoversSequentially(needsCovers)
  // allBooks and dismissedKeys are stable references set from load; preferredMoods rarely changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allBooks, dismissedKeys, preferredMoods, userId])

  // Run a feed build whenever allBooks finishes loading (first load or cache expiry)
  useEffect(() => {
    if (allBooks.length) buildFeedFromState(undefined, false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allBooks])

  // ── Cover fetching ────────────────────────────────────────────
  async function fetchCoversSequentially(bookList) {
    for (const book of bookList) {
      await fetchCover(book)
      await new Promise(r => setTimeout(r, 300))
    }
  }

  async function fetchCover(book) {
    try {
      const cleanTitle  = cleanBookTitle(book?.title || '')
      const cleanAuthor = book.author ? book.author.split(',')[0].split(' ').pop() : ''
      const JUNK = ['sparknotes', 'cliffsnotes', 'study guide', 'summary', 'analysis', 'gradesaver', 'bookrags', 'litcharts']
      const strategies = [
        cleanAuthor ? `title=${encodeURIComponent(cleanTitle)}&author=${encodeURIComponent(cleanAuthor)}&type=work` : null,
        `title=${encodeURIComponent(cleanTitle)}&type=work`,
        `q=${encodeURIComponent(cleanTitle + (cleanAuthor ? ' ' + cleanAuthor : ''))}&type=work`,
      ].filter(Boolean)
      let coverId = null
      for (const params of strategies) {
        const res  = await fetch(`https://openlibrary.org/search.json?${params}&fields=cover_i,title&limit=5`)
        const data = await res.json()
        const doc  = (data.docs || []).find(d => d.cover_i && !JUNK.some(k => (d.title || '').toLowerCase().includes(k)))
        coverId = doc?.cover_i || null
        if (coverId) break
      }
      if (coverId) {
        setCoverCache(prev => {
          const next = { ...prev, [book.ol_key]: coverId }
          coverCacheRef.current = next
          try {
            const raw = sessionStorage.getItem(FEED_CACHE_KEY)
            if (raw) {
              const cached = JSON.parse(raw)
              cached.coverCache = next
              sessionStorage.setItem(FEED_CACHE_KEY, JSON.stringify(cached))
            }
          } catch {}
          return next
        })
      }
    } catch {}
  }

  // ── Public actions ────────────────────────────────────────────
  async function dismissBook(olKey) {
    if (!userId || !olKey) return
    setDismissedKeys(prev => new Set([...prev, olKey]))
    setFeed(prev => prev.filter(b => b.ol_key !== olKey))
    // Invalidate data cache so dismissals are re-fetched next time
    invalidateDataCache()
    await sb.from('editorial_dismissals')
      .upsert({ user_id: userId, book_ol_key: olKey, dismissed_at: new Date().toISOString() })
  }

  function getCoverForBook(book) {
    return book.cover_id || coverCache[book.ol_key] || null
  }

  function shuffleFeed() {
    // Clear session feed cache and force a fresh shuffle
    try { sessionStorage.removeItem(FEED_CACHE_KEY) } catch {}
    hasFeedRef.current = false
    buildFeedFromState(activeMood, true)
  }

  function setActiveMoodAndRebuild(mood) {
    // Clear session cache, update mood state, and immediately build with new mood
    try { sessionStorage.removeItem(FEED_CACHE_KEY) } catch {}
    hasFeedRef.current = false
    setActiveMood(mood)
    buildFeedFromState(mood, true)
  }

  return {
    feed,
    loading,
    moods: MOODS,
    activeMood,
    setActiveMood: setActiveMoodAndRebuild,
    dismissBook,
    shuffleFeed,
    getCoverForBook,
  }
}
