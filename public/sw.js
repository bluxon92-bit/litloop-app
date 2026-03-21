// LitLoop Service Worker
// Handles: cover image caching + Web Push notifications

const CACHE_NAME  = 'litloop-covers-v1'
const MAX_AGE_MS  = 30 * 24 * 60 * 60 * 1000 // 30 days

const COVER_ORIGINS = [
  'https://danknyhumorgkvidrdve.supabase.co/storage/v1/object/public/book-covers',
  'https://danknyhumorgkvidrdve.supabase.co/storage/v1/object/public/profile-images',
  'https://covers.openlibrary.org/b/',
]

function isCoverRequest(url) {
  return COVER_ORIGINS.some(origin => url.startsWith(origin))
}

// ── Lifecycle ─────────────────────────────────────────────────
self.addEventListener('install',  () => self.skipWaiting())
self.addEventListener('activate', e  => e.waitUntil(self.clients.claim()))

// ── Fetch — Cache-First for covers ───────────────────────────
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return
  if (!isCoverRequest(e.request.url)) return

  e.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(e.request)
      if (cached) {
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
      try {
        const response = await fetch(e.request)
        if (response.ok) cache.put(e.request, response.clone())
        return response
      } catch {
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

// ── Push — display incoming notifications ─────────────────────
self.addEventListener('push', e => {
  if (!e.data) return

  let payload
  try {
    payload = e.data.json()
  } catch {
    payload = { title: 'LitLoop', body: e.data.text(), url: '/' }
  }

  const title   = payload.title || 'LitLoop'
  const options = {
    body:     payload.body  || '',
    icon:     payload.icon  || '/litloop-icon-192.png',
    badge:    payload.badge || '/litloop-icon-192.png',
    tag:      payload.tag   || 'litloop-general',
    renotify: false,
    data:     payload.data  || { url: payload.url || '/' },
    vibrate:  [100, 50, 100],
  }

  e.waitUntil(self.registration.showNotification(title, options))
})

// ── Notification click — open/focus the app ───────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close()

  const url = e.notification.data?.url || '/'

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus()
          client.postMessage({ type: 'NOTIFICATION_CLICK', url, data: e.notification.data })
          return
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(self.location.origin + url)
      }
    })
  )
})

// ── Message — cache control ───────────────────────────────────
self.addEventListener('message', e => {
  if (e.data === 'CLEAR_COVERS') {
    caches.delete(CACHE_NAME).then(() => {
      e.ports[0]?.postMessage('cleared')
    })
  }
})
