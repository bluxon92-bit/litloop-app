import { useState, useEffect, useCallback, useRef } from 'react'
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
    .replace(/\s*\([^)]*#\d[^)]*\)/g, '')  // strip Goodreads series: (Series, #N)
    .replace(/[:\u2014\u2013].*/u, '')        // strip subtitles after : or —
    .trim()
}

const FEED_CACHE_KEY = 'litloop_feed_v1'

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

export function useLitLoopPicks({ userId, books = [], preferredMoods = [] }) {
  const [allBooks, setAllBooks]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [dismissedKeys, setDismissedKeys] = useState(new Set())
  const [activeMood, setActiveMood]   = useState(null)

  // Restore from session cache immediately — avoids reload flicker
  const _cached = readFeedCache()
  const [feed, setFeed]             = useState(_cached?.userId === userId ? (_cached.feed || []) : [])
  const [coverCache, setCoverCache] = useState(_cached?.userId === userId ? (_cached.coverCache || {}) : {})
  const sessionHit = useRef(_cached?.userId === userId && (_cached?.feed?.length > 0))

  // Books already in user's library (any status)
  const libraryKeys = new Set(
    books.map(b => b.olKey).filter(Boolean)
  )
  const libraryTitles = new Set(
    books.map(b => (b.title || '').toLowerCase()).filter(Boolean)
  )

  function isInLibrary(book) {
    if (book.ol_key && libraryKeys.has(book.ol_key)) return true
    if (book.title && libraryTitles.has(book.title.toLowerCase())) return true
    return false
  }

  // Load all editorial books + user's dismissals (skip if session cache hit)
  useEffect(() => {
    if (!userId) return
    if (sessionHit.current) { setLoading(false); return }
    async function load() {
      setLoading(true)
      const [booksRes, dismissRes] = await Promise.all([
        sb.from('editorial_books').select('*').eq('active', true),
        sb.from('editorial_dismissals')
          .select('book_ol_key, dismissed_at')
          .eq('user_id', userId)
      ])

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      const recentDismissals = new Set(
        (dismissRes.data || [])
          .filter(d => new Date(d.dismissed_at) > thirtyDaysAgo)
          .map(d => d.book_ol_key)
      )

      setDismissedKeys(recentDismissals)
      setAllBooks(booksRes.data || [])
      setLoading(false)
    }
    load()
  }, [userId])

  // Build the 10-book feed whenever allBooks, library, or dismissals change
  const buildFeed = useCallback(() => {
    if (!allBooks.length) return

    const eligible = allBooks.filter(b =>
      !isInLibrary(b) && !dismissedKeys.has(b.ol_key)
    )

    let result = []

    if (activeMood) {
      // Filtered mode — show all eligible books in that mood, shuffled
      result = shuffle(eligible.filter(b => b.mood_id === activeMood))
    } else if (!preferredMoods.length) {
      // No preferences — random 10 from everything
      result = shuffle(eligible).slice(0, 10)
    } else {
      // Weighted: 7 from preferred moods, 3 from outside
      const preferred  = shuffle(eligible.filter(b => preferredMoods.includes(b.mood_id)))
      const outside    = shuffle(eligible.filter(b => !preferredMoods.includes(b.mood_id)))
      const picks      = preferred.slice(0, 7)
      const wildcards  = outside.slice(0, 3).map(b => ({ ...b, _wildcard: true }))
      // Interleave wildcards naturally rather than all at end
      result = shuffle([...picks, ...wildcards])
    }

    const finalFeed = result.slice(0, activeMood ? result.length : 10)
    setFeed(finalFeed)
    // Persist to session cache so re-visits don't re-fetch
    writeFeedCache(userId, finalFeed, coverCache, activeMood)

    // Lazy-fetch missing covers sequentially to avoid hammering OL API
    const needsCovers = result
      .slice(0, activeMood ? result.length : 10)
      .filter(book => !book.cover_id && book.ol_key && !coverCache[book.ol_key])
    if (needsCovers.length) fetchCoversSequentially(needsCovers)
  }, [allBooks, dismissedKeys, preferredMoods, activeMood, libraryKeys.size])

  useEffect(() => { buildFeed() }, [buildFeed])

  // Sequential fetcher — waits between each request to avoid OL rate limiting
  async function fetchCoversSequentially(books) {
    for (const book of books) {
      await fetchCover(book)
      await new Promise(r => setTimeout(r, 300)) // 300ms gap between requests
    }
  }

  async function fetchCover(book) {
    try {
      const cleanTitle = cleanBookTitle(book?.title || '')
      const cleanAuthor = book.author ? book.author.split(',')[0].split(' ').pop() : ''
      const JUNK = ['sparknotes', 'cliffsnotes', 'study guide', 'summary', 'analysis', 'gradesaver', 'bookrags', 'litcharts']
      const strategies = [
        cleanAuthor ? `title=${encodeURIComponent(cleanTitle)}&author=${encodeURIComponent(cleanAuthor)}&type=work` : null,
        `title=${encodeURIComponent(cleanTitle)}&type=work`,
        `q=${encodeURIComponent(cleanTitle + (cleanAuthor ? ' ' + cleanAuthor : ''))}&type=work`,
      ].filter(Boolean)
      let coverId = null
      for (const params of strategies) {
        const res = await fetch(`https://openlibrary.org/search.json?${params}&fields=cover_i,title&limit=5`)
        const data = await res.json()
        const doc = (data.docs || []).find(d => d.cover_i && !JUNK.some(k => (d.title||'').toLowerCase().includes(k)))
        coverId = doc?.cover_i || null
        if (coverId) break
      }
      if (coverId) {
        setCoverCache(prev => {
          const next = { ...prev, [book.ol_key]: coverId }
          // Keep session cache covers up to date
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
        // Persist to DB so future users get it instantly
        sb.from('editorial_books')
          .update({ cover_id: coverId })
          .eq('ol_key', book.ol_key)
          .then(() => {})
      }
    } catch {}
  }

  async function dismissBook(olKey) {
    if (!userId || !olKey) return
    setDismissedKeys(prev => new Set([...prev, olKey]))
    setFeed(prev => prev.filter(b => b.ol_key !== olKey))
    await sb.from('editorial_dismissals')
      .upsert({ user_id: userId, book_ol_key: olKey, dismissed_at: new Date().toISOString() })
  }

  function getCoverForBook(book) {
    return book.cover_id || coverCache[book.ol_key] || null
  }

  function shuffleAndClear() {
    sessionHit.current = false
    try { sessionStorage.removeItem(FEED_CACHE_KEY) } catch {}
    buildFeed()
  }

  function setActiveMoodAndClear(mood) {
    sessionHit.current = false
    try { sessionStorage.removeItem(FEED_CACHE_KEY) } catch {}
    setActiveMood(mood)
  }

  return {
    feed,
    loading,
    moods: MOODS,
    activeMood,
    setActiveMood: setActiveMoodAndClear,
    dismissBook,
    shuffleFeed: shuffleAndClear,
    getCoverForBook,
  }
}