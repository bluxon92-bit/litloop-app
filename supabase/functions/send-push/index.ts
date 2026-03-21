// supabase/functions/send-push/index.ts
//
// Deploy with:
//   supabase functions deploy send-push
//
// Required secrets (set in Supabase Dashboard → Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY
//   VAPID_PRIVATE_KEY
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const VAPID_PUBLIC_KEY  = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// ── VAPID JWT signing (Web Push spec) ────────────────────────
async function buildVapidAuthHeader(endpoint: string): Promise<string> {
  const origin = new URL(endpoint).origin
  const exp    = Math.floor(Date.now() / 1000) + 12 * 3600 // 12h

  const header  = { typ: 'JWT', alg: 'ES256' }
  const payload = { aud: origin, exp, sub: 'mailto:hello@litloop.app' }

  const enc = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const unsigned = `${enc(header)}.${enc(payload)}`

  // Import the VAPID private key (base64url-encoded raw EC private key)
  const rawKey = Uint8Array.from(
    atob(VAPID_PRIVATE_KEY.replace(/-/g, '+').replace(/_/g, '/')),
    c => c.charCodeAt(0)
  )

  const cryptoKey = await crypto.subtle.importKey(
    'raw', rawKey,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign']
  )

  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    new TextEncoder().encode(unsigned)
  )

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  return `vapid t=${unsigned}.${sigB64},k=${VAPID_PUBLIC_KEY}`
}

// ── Build notification content from type ─────────────────────
interface NotifPayload {
  userId:     string
  type:       string
  bookTitle?: string
  entryId?:   string
  commentId?: string
  actorId?:   string
  actorName?: string
}

function buildNotificationContent(p: NotifPayload): { title: string; body: string; url: string } {
  const book   = p.bookTitle ? `"${p.bookTitle}"` : 'a book'
  const actor  = p.actorName || 'Someone'

  switch (p.type) {
    case 'review_comment':
    case 'review_commented':
      return { title: 'New comment', body: `${actor} commented on your review of ${book}`, url: '/' }
    case 'review_like':
    case 'review_liked':
      return { title: 'Review liked', body: `${actor} liked your review of ${book}`, url: '/' }
    case 'comment_liked':
      return { title: 'Comment liked', body: `${actor} liked your comment`, url: '/' }
    case 'thread_activity':
      return { title: 'New reply', body: `${actor} replied in a thread you're in`, url: '/' }
    case 'friend_request':
      return { title: 'Friend request', body: `${actor} wants to be friends`, url: '/chat' }  // renamed below
    case 'friend_accepted':
      return { title: 'New friend!', body: `${actor} accepted your friend request`, url: '/' }
    case 'book_recommendation':
      return { title: 'Book recommendation', body: `${actor} recommended ${book}`, url: '/discover' }
    case 'co_reading_started':
    case 'co_reading_joined':
      return { title: 'Reading buddy', body: `${actor} is also reading ${book}`, url: '/' }
    default:
      return { title: 'LitLoop', body: 'You have a new notification', url: '/' }
  }
}

// ── Map type → pref key ───────────────────────────────────────
function prefKeyForType(type: string): string {
  if (['review_comment','review_commented','review_like','review_liked',
       'comment_liked','thread_activity'].includes(type)) return 'review_comments'
  if (['friend_request','friend_accepted'].includes(type))  return 'friend_requests'
  if (['book_recommendation'].includes(type))               return 'recommendations'
  return 'messages'
}

// ── Send a single push message ────────────────────────────────
async function sendPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: string
): Promise<{ ok: boolean; status?: number; expired?: boolean }> {
  const vapid = await buildVapidAuthHeader(subscription.endpoint)

  // Encode payload
  const encoder  = new TextEncoder()
  const bodyBytes = encoder.encode(payload)

  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': vapid,
      'Content-Type':  'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL': '86400',
    },
    body: bodyBytes,
  })

  // 410 Gone / 404 = subscription expired, should be deleted
  const expired = res.status === 410 || res.status === 404
  return { ok: res.ok, status: res.status, expired }
}

// ── Main handler ──────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  let body: NotifPayload
  try {
    body = await req.json()
  } catch {
    return new Response('Bad JSON', { status: 400 })
  }

  const { userId, type } = body
  if (!userId || !type) {
    return new Response('Missing userId or type', { status: 400 })
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // ── 1. Fetch actor name if we have actorId ────────────────
  let actorName = body.actorName || null
  if (body.actorId && !actorName) {
    const { data: profile } = await sb
      .from('profiles')
      .select('display_name, username')
      .eq('id', body.actorId)
      .single()
    actorName = profile?.display_name || profile?.username || null
  }

  // ── 2. Check user's notification prefs ───────────────────
  const { data: profile } = await sb
    .from('profiles')
    .select('notification_prefs')
    .eq('id', userId)
    .single()

  const prefs: Record<string, boolean> = profile?.notification_prefs ?? {
    messages: true, friend_requests: true, recommendations: true, review_comments: true
  }

  const prefKey = prefKeyForType(type)
  if (prefs[prefKey] === false) {
    return new Response(JSON.stringify({ skipped: true, reason: 'user pref off' }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // ── 3. Fetch all subscriptions for this user ──────────────
  const { data: subscriptions } = await sb
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)

  if (!subscriptions?.length) {
    return new Response(JSON.stringify({ skipped: true, reason: 'no subscriptions' }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // ── 4. Build notification payload ────────────────────────
  const content   = buildNotificationContent({ ...body, actorName: actorName || undefined })
  const pushPayload = JSON.stringify({
    title: content.title,
    body:  content.body,
    url:   content.url,
    icon:  '/litloop-icon-192.png',
    badge: '/litloop-icon-192.png',
    tag:   type,              // groups same-type notifications on Android
    data:  {
      url:       content.url,
      type,
      entryId:   body.entryId   || null,
      commentId: body.commentId || null,
    }
  })

  // ── 5. Send to all devices, clean up expired ──────────────
  const expiredIds: string[] = []
  let sent = 0

  await Promise.all(subscriptions.map(async (sub) => {
    const result = await sendPush(sub, pushPayload)
    if (result.expired) {
      expiredIds.push(sub.id)
    } else if (result.ok) {
      sent++
      // Update last_used_at
      await sb.from('push_subscriptions')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', sub.id)
    }
  }))

  // Delete expired subscriptions
  if (expiredIds.length) {
    await sb.from('push_subscriptions').delete().in('id', expiredIds)
  }

  return new Response(
    JSON.stringify({ sent, expired: expiredIds.length }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
