// LitLoop Service Worker — Cache-First for book covers
// Caches cover images from both Supabase Storage and Open Library

const CACHE_NAME = 'litloop-covers-v1'
const MAX_AGE_MS  = 30 * 24 * 60 * 60 * 1000 // 30 days

const COVER_ORIGINS = [
  'https://danknyhumorgkvidrdve.supabase.co/storage/v1/object/public/book-covers',
  'https://danknyhumorgkvidrdve.supabase.co/storage/v1/object/public/profile-images',
  'https://covers.openlibrary.org/b/',
]

function isCoverRequest(url) {
  return COVER_ORIGINS.some(origin => url.startsWith(origin))
}

// ── Install — skip waiting so new SW activates immediately
self.addEventListener('install', () => self.skipWaiting())

// ── Activate — claim all clients
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

// ── Fetch — Cache-First for covers, Network-only for everything else
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return
  if (!isCoverRequest(e.request.url)) return

  e.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      // 1. Check cache first
      const cached = await cache.match(e.request)
      if (cached) {
        // Refresh in background if older than 30 days
        const dateHeader = cached.headers.get('date')
        if (dateHeader) {
          const age = Date.now() - new Date(dateHeader).getTime()
          if (age > MAX_AGE_MS) {
            fetch(e.request).then(res => {
              if (res.ok) cache.put(e.request, res.clone())
            }).catch(() => {})
          }
        }
        return cached
      }

      // 2. Fetch from network and cache
      try {
        const response = await fetch(e.request)
        if (response.ok) {
          cache.put(e.request, response.clone())
        }
        return response
      } catch {
        // Network failed and no cache — return transparent 1x1 pixel
        return new Response(
          new Uint8Array([
            0x47,0x49,0x46,0x38,0x39,0x61,0x01,0x00,0x01,0x00,
            0x80,0x00,0x00,0xff,0xff,0xff,0x00,0x00,0x00,0x21,
            0xf9,0x04,0x00,0x00,0x00,0x00,0x00,0x2c,0x00,0x00,
            0x00,0x00,0x01,0x00,0x01,0x00,0x00,0x02,0x02,0x44,
            0x01,0x00,0x3b
          ]).buffer,
          { headers: { 'Content-Type': 'image/gif' } }
        )
      }
    })
  )
})

// ── Message — clear cache on demand
self.addEventListener('message', e => {
  if (e.data === 'CLEAR_COVERS') {
    caches.delete(CACHE_NAME).then(() => {
      e.ports[0]?.postMessage('cleared')
    })
  }
})