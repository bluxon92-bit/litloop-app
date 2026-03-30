// supabase/functions/send-push/index.ts
//
// Sends FCM push notifications to native iOS/Android devices.
// Called from Postgres triggers via pg_net.
//
// Required secrets (set via Supabase dashboard → Edge Functions → Secrets):
//   FIREBASE_PROJECT_ID   — e.g. litloop-4840f
//   FIREBASE_CLIENT_EMAIL — service account email
//   FIREBASE_PRIVATE_KEY  — service account private key (with \n as literal newlines)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL        = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FIREBASE_PROJECT_ID  = Deno.env.get('FIREBASE_PROJECT_ID')!
const FIREBASE_CLIENT_EMAIL = Deno.env.get('FIREBASE_CLIENT_EMAIL')!
const FIREBASE_PRIVATE_KEY  = Deno.env.get('FIREBASE_PRIVATE_KEY')!.replace(/\\n/g, '\n')

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// ── JWT for FCM HTTP v1 ───────────────────────────────────────

async function getAccessToken(): Promise<string> {
  const now   = Math.floor(Date.now() / 1000)
  const claim = {
    iss:   FIREBASE_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud:   'https://oauth2.googleapis.com/token',
    exp:   now + 3600,
    iat:   now,
  }

  // Encode JWT header + claim
  const encode = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const header    = encode({ alg: 'RS256', typ: 'JWT' })
  const payload   = encode(claim)
  const unsigned  = `${header}.${payload}`

  // Import private key
  const keyData = FIREBASE_PRIVATE_KEY
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')

  const binaryKey = Uint8Array.from(atob(keyData), c => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  // Sign
  const encoder   = new TextEncoder()
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, encoder.encode(unsigned))
  const sigB64    = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const jwt = `${unsigned}.${sigB64}`

  // Exchange for access token
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })
  const data = await res.json()
  return data.access_token
}

// ── Send a single FCM message ─────────────────────────────────

async function sendFcmMessage(token: string, title: string, body: string, data: Record<string, string>) {
  const accessToken = await getAccessToken()

  const message = {
    message: {
      token,
      notification: { title, body },
      data,
      apns: {
        payload: { aps: { sound: 'default', badge: 1 } },
      },
      android: {
        priority: 'high',
        notification: { sound: 'default' },
      },
    },
  }

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/messages:send`,
    {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(message),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    console.error('FCM send error:', err)
    return { ok: false, error: err }
  }
  return { ok: true }
}

// ── Get FCM tokens for a user ─────────────────────────────────

async function getTokensForUser(userId: string): Promise<string[]> {
  const { data } = await sb
    .from('fcm_tokens')
    .select('token')
    .eq('user_id', userId)
  return (data || []).map((r: { token: string }) => r.token)
}

// ── Main handler ──────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const payload = await req.json()
    const {
      type,           // 'chat' | 'comment' | 'like' | 'friend_request' | 'friend_accepted' | 'recommendation'
      recipient_id,   // user to notify
      actor_name,     // display name of person who triggered the action
      chat_id,
      entry_id,
      book_title,
      book_author,
      book_ol_key,
      cover_id,
      message,
      from_user_id,
    } = payload

    if (!recipient_id || !type) {
      return new Response(JSON.stringify({ error: 'Missing recipient_id or type' }), { status: 400 })
    }

    // Check notification preferences
    const { data: profile } = await sb
      .from('profiles')
      .select('notification_prefs')
      .eq('id', recipient_id)
      .single()

    const prefs = profile?.notification_prefs || {}

    // Map type to pref key
    const prefMap: Record<string, string> = {
      chat:            'messages',
      comment:         'review_comments',
      like:            'review_comments',
      friend_request:  'friend_requests',
      friend_accepted: 'friend_requests',
      recommendation:  'recommendations',
    }
    const prefKey = prefMap[type]
    if (prefKey && prefs[prefKey] === false) {
      return new Response(JSON.stringify({ skipped: 'user_preference' }), { status: 200 })
    }

    // Build notification content
    let title = 'LitLoop'
    let body  = ''
    const data: Record<string, string> = { type }

    if (type === 'chat') {
      title = actor_name || 'New message'
      body  = message || 'Sent you a message'
      data.chatId = chat_id || ''
    } else if (type === 'comment') {
      title = actor_name || 'New comment'
      body  = `Commented on your review of ${book_title || 'a book'}`
      data.entryId   = entry_id || ''
      data.bookTitle = book_title || ''
      data.actorName = actor_name || ''
    } else if (type === 'like') {
      title = actor_name || 'New like'
      body  = `Liked your review of ${book_title || 'a book'}`
      data.entryId   = entry_id || ''
      data.bookTitle = book_title || ''
      data.actorName = actor_name || ''
    } else if (type === 'friend_request') {
      title = actor_name || 'Friend request'
      body  = `${actor_name || 'Someone'} wants to be your reading friend`
      data.actorName = actor_name || ''
    } else if (type === 'friend_accepted') {
      title = actor_name || 'Friend request accepted'
      body  = `${actor_name || 'Someone'} accepted your friend request`
      data.friendUserId = from_user_id || ''
      data.actorName    = actor_name || ''
    } else if (type === 'recommendation') {
      title = actor_name || 'Book recommendation'
      body  = `Recommended ${book_title || 'a book'} for you`
      data.bookOlKey  = book_ol_key  || ''
      data.bookTitle  = book_title   || ''
      data.bookAuthor = book_author  || ''
      data.coverId    = cover_id     || ''
      data.message    = message      || ''
      data.fromUserId = from_user_id || ''
      data.actorName  = actor_name   || ''
    }

    // Get device tokens and send
    const tokens = await getTokensForUser(recipient_id)
    if (tokens.length === 0) {
      return new Response(JSON.stringify({ skipped: 'no_tokens' }), { status: 200 })
    }

    const results = await Promise.all(tokens.map(token => sendFcmMessage(token, title, body, data)))
    const sent    = results.filter(r => r.ok).length

    return new Response(JSON.stringify({ sent, total: tokens.length }), { status: 200 })
  } catch (err) {
    console.error('send-push error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})
