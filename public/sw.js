// litloop cover image service worker
// Cache-first strategy for Supabase Storage cover images

const CACHE_NAME = 'litloop-covers-v1'

// Only cache requests to our Supabase Storage bucket
const COVER_ORIGIN = 'https://danknyhumorgkvidrdve.supabase.co'

self.addEventListener('install', event => {
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)

  // Only intercept GET requests to our Supabase Storage bucket
  if (
    event.request.method !== 'GET' ||
    url.origin !== COVER_ORIGIN ||
    !url.pathname.startsWith('/storage/v1/object/public/book-covers/')
  ) {
    return
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      // Cache-first: return cached version if available
      const cached = await cache.match(event.request)
      if (cached) return cached

      // Otherwise fetch from network and cache it
      try {
        const response = await fetch(event.request)
        if (response.ok) {
          cache.put(event.request, response.clone())
        }
        return response
      } catch {
        // Offline and not cached — return nothing (CoverImage handles fallback)
        return new Response('', { status: 503 })
      }
    })
  )
})

// Listen for a message from the app to clear the cache
self.addEventListener('message', event => {
  if (event.data?.type === 'CLEAR_COVER_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      event.ports[0]?.postMessage({ success: true })
    })
  }
})