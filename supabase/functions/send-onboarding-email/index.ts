import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const TEMPLATES = {
  1:  '9f3b5cfd-6b4c-4851-a526-a84c96339a00',
  3:  '3ea8e1e9-45dd-4d50-b837-5f8763ad83b0',
  5:  'a70ea2ab-ab9b-4ebe-94e0-bfc037239c0b',
  7:  'f460cf17-c0cf-4cb1-90b6-f321e0cb95af',
}

const SUBJECTS = {
  1:  'Welcome to LitLoop 📖',
  3:  'Your reading life, all in one place',
  5:  'Reading is better with friends',
  7:  'Your book club, without the faff',
}

serve(async (req) => {
  try {
    const { day, user_id, email, first_name } = await req.json()

    if (!day || !TEMPLATES[day]) {
      return new Response(JSON.stringify({ error: `Invalid day: ${day}` }), { status: 400 })
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // If email not passed directly, look up from auth.users
    let recipientEmail = email
    let recipientFirstName = first_name || 'Reader'

    if (!recipientEmail && user_id) {
      const { data: { user }, error } = await sb.auth.admin.getUserById(user_id)
      if (error || !user) {
        return new Response(JSON.stringify({ error: 'User not found' }), { status: 404 })
      }
      recipientEmail = user.email
      // Try to get first name from profiles
      const { data: profile } = await sb
        .from('profiles')
        .select('first_name, display_name')
        .eq('id', user_id)
        .single()
      recipientFirstName = profile?.first_name || profile?.display_name || 'Reader'
    }

    if (!recipientEmail) {
      return new Response(JSON.stringify({ error: 'No email address' }), { status: 400 })
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Ben at LitLoop <hello@litloop.co>',
        to: [recipientEmail],
        subject: SUBJECTS[day],
        template: {
          id: TEMPLATES[day],
          variables: {
            first_name: recipientFirstName,
          },
        },
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      console.error(`[send-onboarding-email] Resend error (day ${day}):`, data)
      return new Response(JSON.stringify({ error: data }), { status: 500 })
    }

    // Record that this email was sent so cron doesn't resend it
    await sb.from('onboarding_emails').insert({ user_id, day })

    console.log(`[send-onboarding-email] Day ${day} sent to ${recipientEmail}`)
    return new Response(JSON.stringify({ success: true, id: data.id }), { status: 200 })

  } catch (err) {
    console.error('[send-onboarding-email] Error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})