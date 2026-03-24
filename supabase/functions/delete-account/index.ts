// supabase/functions/delete-account/index.ts
//
// Permanently removes or anonymises all data for the calling user,
// then deletes their auth account.
//
// ANONYMISED (user_id nulled out, content preserved):
//   reading_entries, feed_events, review_comments, review_likes,
//   comment_likes, chat_messages (content replaced with [deleted])
//
// PURGED COMPLETELY:
//   profiles, friendships, book_recommendations, notifications,
//   push_subscriptions, editorial_dismissals, club_members,
//   chat_participants, avatar from storage, auth.users row
//
// books rows are left entirely untouched — they are shared catalogue
// records keyed by ol_key / google_books_id, not user-owned.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY    = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ── 1. Verify caller is authenticated ─────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    })
    const { data: { user }, error: authError } = await anonClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorised' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const uid = user.id
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // ── 2. ANONYMISE — null out user_id, keep the content ─────────────────

    // Reading entries: keep status, rating, review, progress — detach owner
    await admin
      .from('reading_entries')
      .update({ user_id: null })
      .eq('user_id', uid)

    // Feed events: keep book/review content for public review pages
    await admin
      .from('feed_events')
      .update({ user_id: null })
      .eq('user_id', uid)

    // Review comments: null user_id — display layer shows "Deleted user"
    // for any comment where user_id is null
    await admin
      .from('review_comments')
      .update({ user_id: null })
      .eq('user_id', uid)

    // Likes: null user_id to preserve counts without identifying the person
    await admin
      .from('review_likes')
      .update({ user_id: null })
      .eq('user_id', uid)

    await admin
      .from('comment_likes')
      .update({ user_id: null })
      .eq('user_id', uid)

    // Chat messages: blank content and detach sender — thread preserved
    // for the other participant
    await admin
      .from('chat_messages')
      .update({ sender_id: null, content: '[deleted]' })
      .eq('sender_id', uid)

    // ── 3. PURGE — delete completely ──────────────────────────────────────

    // Remove from chats (participant record only, messages handled above)
    await admin
      .from('chat_participants')
      .delete()
      .eq('user_id', uid)

    // Remove from clubs
    await admin
      .from('club_members')
      .delete()
      .eq('user_id', uid)

    // Recommendations (sent or received)
    await admin
      .from('book_recommendations')
      .delete()
      .or(`from_user_id.eq.${uid},to_user_id.eq.${uid}`)

    // Friendships (either side)
    await admin
      .from('friendships')
      .delete()
      .or(`requester_id.eq.${uid},addressee_id.eq.${uid}`)

    // Notifications received by this user
    await admin
      .from('notifications')
      .delete()
      .eq('user_id', uid)

    // Push subscriptions
    await admin
      .from('push_subscriptions')
      .delete()
      .eq('user_id', uid)

    // Editorial dismissals
    await admin
      .from('editorial_dismissals')
      .delete()
      .eq('user_id', uid)

    // Avatar from storage
    await admin.storage
      .from('profile-images')
      .remove([`${uid}/avatar.jpg`])

    // Profile row — after all FK-dependent deletes
    await admin
      .from('profiles')
      .delete()
      .eq('id', uid)

    // ── 4. Delete auth user — must be last ────────────────────────────────
    const { error: deleteError } = await admin.auth.admin.deleteUser(uid)
    if (deleteError) {
      console.error('[delete-account] auth.admin.deleteUser failed:', deleteError)
      return new Response(
        JSON.stringify({ error: 'Failed to delete auth account: ' + deleteError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('[delete-account] unexpected error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
