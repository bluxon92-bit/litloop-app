import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const AUDIENCE_ID = '46335ec4-bba2-47ee-aa4b-d716e30aca04'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

serve(async (req) => {
  try {
    const payload = await req.json()
    const record = payload.record

    if (!record?.email) {
      return new Response(JSON.stringify({ error: 'No email in payload' }), { status: 400 })
    }

    const email = record.email
    const firstName = record.raw_user_meta_data?.first_name ||
                      record.raw_user_meta_data?.name?.split(' ')?.[0] ||
                      ''

    console.log(`[add-to-resend] Adding contact: ${email}`)

    // Add to Resend audience
    const res = await fetch(`https://api.resend.com/audiences/${AUDIENCE_ID}/contacts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        first_name: firstName,
        unsubscribed: false,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      console.error('[add-to-resend] Resend error:', data)
      return new Response(JSON.stringify({ error: data }), { status: 500 })
    }

    console.log(`[add-to-resend] Contact added: ${email}`)

    // Fire Day 1 welcome email immediately
    console.log(`[add-to-resend] Triggering Day 1 email for user: ${record.id}`)
    const emailRes = await fetch(`${SUPABASE_URL}/functions/v1/send-onboarding-email`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        day: 1,
        user_id: record.id,
        email,
        name: firstName || 'Reader',
      }),
    })

    const emailData = await emailRes.json()
    if (!emailRes.ok) {
      console.error('[add-to-resend] Day 1 email error:', emailData)
    } else {
      console.log('[add-to-resend] Day 1 email sent successfully')
    }

    return new Response(JSON.stringify({ success: true, contact: data }), { status: 200 })

  } catch (err) {
    console.error('[add-to-resend] Error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})