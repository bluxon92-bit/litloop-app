// Supabase Edge Function: recommendations
// Rate limiting:
//   - First generation: always allowed
//   - First refresh:    always allowed
//   - Further refreshes: once per week

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { prompt } = await req.json()
    if (!prompt) throw new Error('No prompt provided')

    // ── Auth ──────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const sb = createClient(supabaseUrl, supabaseKey)

    // Extract user from JWT
    const jwt = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await sb.auth.getUser(jwt)
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── Rate limit check ──────────────────────────────────────
    const { data: profile } = await sb
      .from('profiles')
      .select('ai_picks')
      .eq('id', user.id)
      .single()

    const picks = profile?.ai_picks || null
    const savedAt      = picks?.savedAt      ? new Date(picks.savedAt)  : null
    const refreshCount = picks?.refreshCount ?? 0
    const hasExisting  = picks?.recs?.length > 0

    if (hasExisting && savedAt) {
      const msSinceLast = Date.now() - savedAt.getTime()

      // First refresh (refreshCount === 0): always allowed regardless of time
      // Subsequent refreshes: once per week
      if (refreshCount >= 1 && msSinceLast < ONE_WEEK_MS) {
        const msRemaining   = ONE_WEEK_MS - msSinceLast
        const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000))
        return new Response(
          JSON.stringify({
            error: `You can refresh your picks once a week. Try again in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}.`,
            rateLimited: true,
            nextAllowedAt: new Date(savedAt.getTime() + ONE_WEEK_MS).toISOString(),
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // ── Increment refreshCount before calling API ─────────────
    // We write this now so a user can't spam concurrent requests
    // to race past the rate limit check
    const newRefreshCount = hasExisting ? refreshCount + 1 : 0
    await sb.from('profiles').update({
      ai_picks: {
        ...(picks || {}),
        refreshCount: newRefreshCount,
        savedAt: new Date().toISOString(),
      }
    }).eq('id', user.id)

    // ── Call Anthropic ────────────────────────────────────────
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(`Anthropic API error ${res.status}: ${errData?.error?.message || res.statusText}`);
    }

    const data = await res.json();
    const text = data.content?.find((c: any) => c.type === 'text')?.text || '';

    if (!text) throw new Error('Empty content from Anthropic API');

    return new Response(
      JSON.stringify({ text, refreshCount: newRefreshCount }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
});
