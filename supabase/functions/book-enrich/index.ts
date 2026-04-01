// supabase/functions/book-enrich/index.ts
//
// Given an ISBN, fetches ol_key, cover_id, description, and first_publish_year
// from Open Library and writes them to the books table (matched by isbn or google_books_id).
// Called from useBooks.addBook after a Google Books result is added.
//
// POST body: { isbn, bookId }   — bookId is the books.id UUID just upserted

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { isbn, bookId } = await req.json()
    if (!isbn || !bookId) {
      return new Response(JSON.stringify({ error: 'isbn and bookId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── OL ISBN search ────────────────────────────────────────────
    const olRes = await fetch(
      `https://openlibrary.org/search.json?isbn=${isbn}&fields=key,cover_i,first_publish_year,description&limit=1`
    )
    if (!olRes.ok) {
      return new Response(JSON.stringify({ ok: false, reason: 'ol_unavailable' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const olJson = await olRes.json()
    const doc = olJson.docs?.[0]
    if (!doc) {
      return new Response(JSON.stringify({ ok: false, reason: 'not_found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const olKey   = doc.key     || null
    const coverId = doc.cover_i || null
    const firstPublishYear = doc.first_publish_year || null

    let description: string | null = null
    if (typeof doc.description === 'string') description = doc.description.slice(0, 1000)
    else if (doc.description?.value) description = doc.description.value.slice(0, 1000)

    // If no description in search result, fetch from works endpoint
    if (olKey && !description) {
      try {
        const worksId = olKey.replace('/works/', '')
        const wRes = await fetch(`https://openlibrary.org/works/${worksId}.json`)
        if (wRes.ok) {
          const wData = await wRes.json()
          if (typeof wData.description === 'string') description = wData.description.slice(0, 1000)
          else if (wData.description?.value) description = wData.description.value.slice(0, 1000)
        }
      } catch { /* continue without description */ }
    }

    // ── Write to books table ──────────────────────────────────────
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY)
    const update: Record<string, any> = {}
    if (olKey)             update.ol_key            = olKey
    if (coverId)           update.cover_id           = coverId
    if (firstPublishYear)  update.first_publish_year = firstPublishYear
    if (description)       update.description        = description

    if (Object.keys(update).length > 0) {
      const { error } = await sb.from('books').update(update).eq('id', bookId)
      if (error) console.error('[book-enrich] update error:', error)
    }

    return new Response(
      JSON.stringify({ ok: true, olKey, coverId, firstPublishYear, description }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('[book-enrich] error:', err)
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
