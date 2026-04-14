import { useState, useEffect, useRef } from 'react'
import { uploadCoverToSupabase, uploadGoogleCoverToSupabase } from '../../lib/coverCache'

const gradients = [
  'linear-gradient(135deg, #1a2744 0%, #2A6E69 100%)',
  'linear-gradient(135deg, #c8891a 0%, #b43a3a 100%)',
  'linear-gradient(135deg, #2A6E69 0%, #5c6bc0 100%)',
  'linear-gradient(135deg, #7b3fa0 0%, #1a2744 100%)',
  'linear-gradient(135deg, #2e7d52 0%, #5c6bc0 100%)',
  'linear-gradient(135deg, #b43a3a 0%, #7a5c2e 100%)',
]

// Session-level cache: coverId → resolved Supabase URL
// Prevents re-uploading/re-fetching the same cover across components
const resolvedUrlCache = {}

export default function CoverImage({ coverId, olKey, coverUrl, googleBooksId, title, size = 'M', style = {}, onCoverUrlResolved, priority = false, lazy = false }) {
  const sizes = { S: [38, 54], M: [56, 82], L: [80, 116] }
  const [w, h] = sizes[size] || sizes.M

  const gradientIndex = (title || '').charCodeAt(0) % gradients.length
  const initial = (title || '?').charAt(0).toUpperCase()

  // Initialise immediately with the best available URL so there's no loading flash:
  // 1. Supabase coverUrl (best — cached by service worker)
  // 2. OL URL built from coverId (instant, may be slow on bad connection)
  // 3. null → gradient placeholder
  function bestInitialUrl() {
    if (coverUrl) return coverUrl
    if (coverId) return `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`
    return null
  }

  const [resolvedUrl, setResolvedUrl] = useState(bestInitialUrl)
  const [failed, setFailed] = useState(false)
  const upgrading = useRef(false)

  useEffect(() => {
    // Always use coverUrl from DB if available
    if (coverUrl) {
      setResolvedUrl(coverUrl)
      setFailed(false)
      return
    }

    // Show OL URL immediately so there's no placeholder flash
    if (coverId) {
      setResolvedUrl(`https://covers.openlibrary.org/b/id/${coverId}-M.jpg`)
      setFailed(false)
    }

    // Silently upgrade OL cover to Supabase Storage in the background
    if (coverId && olKey && !upgrading.current) {
      const cacheKey = `${coverId}__${olKey}`
      if (resolvedUrlCache[cacheKey]) {
        setResolvedUrl(resolvedUrlCache[cacheKey])
        onCoverUrlResolved?.(resolvedUrlCache[cacheKey])
        return
      }
      upgrading.current = true
      uploadCoverToSupabase(coverId, olKey).then(url => {
        if (url) {
          resolvedUrlCache[cacheKey] = url
          setResolvedUrl(url)
          onCoverUrlResolved?.(url)
        }
        upgrading.current = false
      })
      return
    }

    // Google Books fallback: no OL data, upload Google Books cover to Supabase
    if (!coverId && !olKey && googleBooksId && !upgrading.current) {
      const cacheKey = `google__${googleBooksId}`
      if (resolvedUrlCache[cacheKey]) {
        setResolvedUrl(resolvedUrlCache[cacheKey])
        onCoverUrlResolved?.(resolvedUrlCache[cacheKey])
        return
      }
      // We need the raw Google Books thumbnail URL to upload it.
      // At this point the book was added with coverUrl from Google Books but
      // enrichment hasn't run yet or failed. Try to fetch it from the DB.
      upgrading.current = true
      import('../../lib/supabase').then(({ sb }) => {
        sb.from('books').select('cover_url').eq('google_books_id', googleBooksId).single()
          .then(({ data }) => {
            if (data?.cover_url) {
              resolvedUrlCache[cacheKey] = data.cover_url
              setResolvedUrl(data.cover_url)
              onCoverUrlResolved?.(data.cover_url)
            }
            upgrading.current = false
          })
      }).catch(() => { upgrading.current = false })
    }
  }, [coverUrl, coverId, olKey, googleBooksId])

  const baseStyle = {
    width: w,
    height: h,
    borderRadius: 6,
    flexShrink: 0,
    boxShadow: '0 2px 8px rgba(26,39,68,0.15)',
    ...style,
  }

  const placeholder = (
    <div style={{
      ...baseStyle,
      background: gradients[gradientIndex],
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'rgba(255,255,255,0.8)',
      fontSize: w * 0.4,
      fontFamily: 'var(--rt-font-display)',
      fontWeight: 700,
    }}>
      {initial}
    </div>
  )

  if (!resolvedUrl || failed) return placeholder

  return (
    <img
      src={resolvedUrl}
      alt={title}
      width={w}
      height={h}
      fetchpriority={priority ? 'high' : 'auto'}
      loading={lazy ? 'lazy' : 'eager'}
      style={{ ...baseStyle, objectFit: 'cover' }}
      onError={() => setFailed(true)}
    />
  )
}