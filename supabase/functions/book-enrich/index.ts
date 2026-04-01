// supabase/functions/book-enrich/index.ts
//
// Given a bookId (books.id) plus isbn/title/author, fetches ol_key, cover_id,
// description, and first_publish_year from Open Library and writes them to the
// books row. Search order: ISBN → title+author fallback.
//
// POST body: { bookId, isbn?, title?, author? }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

async function searchOLByISBN(isbn: string) {
  const res = await fetch(
    `https://openlibrary.org/search.json?isbn=${isbn}&fields=key,cover_i,first_publish_year,description&limit=1`
  )
  if (!res.ok) return null
  const json = await res.json()
  return json.docs?.[0] || null
}

async function searchOLByTitle(title: string, author?: string) {
  const q = author
    ? `title=${encodeURIComponent(title)}&author=${encodeURIComponent(author.split(',')[0].trim())}`
    : `title=${encodeURIComponent(title)}`
  const res = await fetch(
    `https://openlibrary.org/search.json?${q}&fields=key,cover_i,first_publish_year,description&limit=3&language=eng`
  )
  if (!res.ok) return null
  const json = await res.json()
  if (!json.docs?.length) return null
  // Pick closest title match
  const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()
  const nt = norm(title)
  return json.docs.find((d: any) => norm(d.title || '') === nt)
      || json.docs.find((d: any) => norm(d.title || '').startsWith(nt.split(' ')[0]))
      || json.docs[0]
}

async function getDescription(olKey: string): Promise<string | null> {
  try {
    const worksId = olKey.replace('/works/', '')
    const res = await fetch(`https://openlibrary.org/works/${worksId}.json`)
    if (!res.ok) return null
    const data = await res.json()
    if (typeof data.description === 'string') return data.description.slice(0, 1000)
    if (data.description?.value) return data.description.value.slice(0, 1000)
    return null
  } catch { return null }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { bookId, isbn, title, author } = await req.json()

    if (!bookId) {
      return new Response(JSON.stringify({ ok: false, error: 'bookId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── Search OL: ISBN first, title/author fallback ──────────────────────────
    let doc: any = null

    if (isbn) {
      console.log('[book-enrich] trying ISBN:', isbn)
      doc = await searchOLByISBN(isbn)
      console.log('[book-enrich] ISBN result:', doc ? 'found' : 'not found')
    }

    if (!doc && title) {
      console.log('[book-enrich] falling back to title/author:', title, author)
      doc = await searchOLByTitle(title, author)
      console.log('[book-enrich] title result:', doc ? 'found' : 'not found')
    }

    if (!doc) {
      return new Response(JSON.stringify({ ok: false, reason: 'not_found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const olKey            = doc.key             || null
    const coverId          = doc.cover_i          || null
    const firstPublishYear = doc.first_publish_year || null

    let description: string | null = null
    if (typeof doc.description === 'string') description = doc.description.slice(0, 1000)
    else if (doc.description?.value) description = doc.description.value.slice(0, 1000)

    if (olKey && !description) {
      description = await getDescription(olKey)
    }

    // ── Write to books table ──────────────────────────────────────────────────
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY)
    const update: Record<string, any> = {}
    if (olKey)            update.ol_key            = olKey
    if (coverId)          update.cover_id           = coverId
    if (firstPublishYear) update.first_publish_year = firstPublishYear
    if (description)      update.description        = description

    console.log('[book-enrich] writing to books row:', bookId, update)

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