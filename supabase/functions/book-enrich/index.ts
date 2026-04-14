// supabase/functions/book-enrich/index.ts
//
// Given a bookId plus isbn/title/author, fetches ol_key, cover_id, description,
// and first_publish_year from Open Library, uploads the cover to Supabase Storage,
// and writes everything to the books row — all server-side, no CORS issues.
//
// POST body: { bookId, isbn?, title?, author? }
// Returns:   { ok, olKey, coverId, coverUrl, description, firstPublishYear }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BUCKET       = 'book-covers'

// ── OL search helpers ─────────────────────────────────────────────────────────

async function searchOLByISBN(isbn: string) {
  const url = `https://openlibrary.org/search.json?isbn=${isbn}&fields=key,cover_i,first_publish_year,description&limit=1`
  console.log('[book-enrich] fetching OL URL:', url)
  const res = await fetch(url)
  console.log('[book-enrich] OL response status:', res.status)
  if (!res.ok) {
    console.log('[book-enrich] OL fetch not ok:', res.status, res.statusText)
    return null
  }
  const json = await res.json()
  console.log('[book-enrich] OL raw response:', JSON.stringify(json).slice(0, 500))
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

// ── Cover upload ──────────────────────────────────────────────────────────────
// Fetches OL cover image server-side and uploads to Supabase Storage.
// Returns the public URL or null on failure.

async function uploadOLCover(sb: any, coverId: number, olKey: string): Promise<string | null> {
  try {
    const safeFolder = olKey.replace(/^\//, '').replace(/\//g, '_').replace(/[^a-zA-Z0-9_-]/g, '')
    const path = `${safeFolder}/${coverId}.jpg`

    // Check if already uploaded
    const { data: existing } = await sb.storage.from(BUCKET).list(safeFolder)
    if (existing?.some((f: any) => f.name === `${coverId}.jpg`)) {
      return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`
    }

    // Fetch from OL
    const res = await fetch(`https://covers.openlibrary.org/b/id/${coverId}-L.jpg`)
    if (!res.ok) return null
    const blob = await res.blob()
    if (blob.size < 1000) return null  // placeholder/empty image

    const { error } = await sb.storage.from(BUCKET).upload(path, blob, {
      contentType: 'image/jpeg',
      upsert: true,
    })
    if (error) {
      console.error('[book-enrich] storage upload error:', error)
      return null
    }

    return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`
  } catch (err) {
    console.error('[book-enrich] cover upload error:', err)
    return null
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { bookId, isbn, title, author } = await req.json()
    console.log('[book-enrich] request:', { bookId, isbn, title, author })

    // ── Connectivity test ────────────────────────────────────────────────────
    try {
      const testRes = await fetch('https://openlibrary.org/search.json?q=test&limit=1')
      console.log('[book-enrich] OL connectivity test status:', testRes.status)
    } catch (testErr) {
      console.error('[book-enrich] OL connectivity test FAILED:', testErr)
    }

    if (!bookId) {
      return new Response(JSON.stringify({ ok: false, error: 'bookId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── 1. Find OL record ─────────────────────────────────────────────────────
    let doc: any = null

    if (isbn) {
      console.log('[book-enrich] searching OL by ISBN:', isbn)
      doc = await searchOLByISBN(isbn)
      console.log('[book-enrich] ISBN result:', doc ? `found — key:${doc.key} cover_i:${doc.cover_i}` : 'not found')
    }

    if (!doc && title) {
      console.log('[book-enrich] falling back to title/author:', title, author)
      doc = await searchOLByTitle(title, author)
      console.log('[book-enrich] title result:', doc ? `found — key:${doc.key} cover_i:${doc.cover_i}` : 'not found')
    }

    if (!doc) {
      return new Response(JSON.stringify({ ok: false, reason: 'not_found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const olKey            = doc.key              || null
    const coverId          = doc.cover_i           || null
    const firstPublishYear = doc.first_publish_year || null

    // ── 2. Get description ────────────────────────────────────────────────────
    let description: string | null = null
    if (typeof doc.description === 'string') description = doc.description.slice(0, 1000)
    else if (doc.description?.value) description = doc.description.value.slice(0, 1000)
    if (olKey && !description) description = await getDescription(olKey)

    // ── 3. Upload cover to Supabase Storage ───────────────────────────────────
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY)
    let coverUrl: string | null = null
    if (coverId && olKey) {
      console.log('[book-enrich] uploading cover — coverId:', coverId)
      coverUrl = await uploadOLCover(sb, coverId, olKey)
      console.log('[book-enrich] cover URL:', coverUrl)
    }

    // ── 4. Write everything to books table ────────────────────────────────────
    const update: Record<string, any> = {}
    if (olKey)            update.ol_key            = olKey
    if (coverId)          update.cover_id           = coverId
    if (firstPublishYear) update.first_publish_year = firstPublishYear
    if (description)      update.description        = description
    if (coverUrl)         update.cover_url          = coverUrl

    console.log('[book-enrich] writing to books row:', bookId, update)

    if (Object.keys(update).length > 0) {
      const { error } = await sb.from('books').update(update).eq('id', bookId)
      if (error) console.error('[book-enrich] db update error:', error)
    }

    return new Response(
      JSON.stringify({ ok: true, olKey, coverId, coverUrl, description, firstPublishYear }),
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