// supabase/functions/book-search/index.ts
//
// Unified book search proxy — called by AddBookModal and onboarding search.
// Flow:
//   1. Search local Supabase books table (instant, no API cost)
//   2. Call Google Books API with server-side key (no browser rate limiting)
//   3. Score and sort results: local matches first, then fiction/English boosted,
//      then everything else — nothing is excluded, just deprioritised
//   4. Upload Google Book covers to Supabase Storage in the background
//
// Request body: { q: string }
// Response: { results: BookResult[] }
//
// BookResult shape:
//   { title, author, coverUrl, coverId, olKey, googleBooksId, isbn, description, source }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GOOGLE_BOOKS_KEY  = Deno.env.get('GOOGLE_BOOKS_API_KEY')!
const BUCKET            = 'book-covers'

// Categories that indicate non-fiction / reference / study material
const NON_FICTION_CATEGORIES = [
  'study', 'guide', 'reference', 'essay', 'nonfiction', 'non-fiction',
  'biography', 'autobiography', 'history', 'science', 'self-help',
  'business', 'economics', 'politics', 'religion', 'philosophy',
  'sparknotes', 'cliffsnotes', 'litcharts', 'gradesaver',
]

function decodeHtml(str: string | null | undefined): string {
  if (!str) return ''
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
}

// Score a Google Books result — higher = more relevant
// Fiction in English scores highest, everything else still included but lower
function scoreResult(item: any): number {
  const info = item.volumeInfo || {}
  let score = 0

  // Language boost
  if (info.language === 'en') score += 10

  // Fiction boost based on categories
  const cats = (info.categories || []).map((c: string) => c.toLowerCase())
  const isFiction = cats.some((c: string) =>
    c.includes('fiction') && !c.includes('non-fiction') && !c.includes('nonfiction')
  )
  const isNonFiction = cats.some((c: string) =>
    NON_FICTION_CATEGORIES.some(nf => c.includes(nf))
  )
  if (isFiction) score += 8
  if (isNonFiction) score -= 5

  // Has a cover
  if (info.imageLinks?.thumbnail) score += 3

  // Has description
  if (info.description) score += 2

  // Prefer books over other types
  const type = (info.printType || '').toLowerCase()
  if (type === 'book') score += 2

  return score
}

// Upload a Google Books cover URL to Supabase Storage
// Returns the public Supabase URL, or null on failure
async function uploadGoogleCoverToStorage(
  sb: any,
  googleBooksId: string,
  coverUrl: string
): Promise<string | null> {
  try {
    const safeFolder = `google_${googleBooksId.replace(/[^a-zA-Z0-9_-]/g, '')}`
    const path = `${safeFolder}/cover.jpg`

    // Check if already uploaded
    const { data: existing } = await sb.storage.from(BUCKET).list(safeFolder)
    if (existing?.some((f: any) => f.name === 'cover.jpg')) {
      return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`
    }

    // Fetch and upload
    const res = await fetch(coverUrl)
    if (!res.ok) return null
    const blob = await res.blob()
    if (blob.size < 1000) return null

    const { error } = await sb.storage
      .from(BUCKET)
      .upload(path, blob, { contentType: 'image/jpeg', upsert: true })

    if (error) return null

    return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`
  } catch {
    return null
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { q } = await req.json()
    if (!q || q.trim().length < 2) {
      return new Response(
        JSON.stringify({ results: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const query = q.trim()
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { db: { schema: 'public' } })

    // ── 1. Search local Supabase books table ──────────────────
    const { data: localBooks } = await sb
      .from('books')
      .select('id, title, author, cover_url, cover_id, ol_key, google_books_id, isbn, description')
      .or(`title.ilike.%${query}%,author.ilike.%${query}%`)
      .limit(5)

    const localResults = (localBooks || []).map((b: any) => ({
      title:        b.title || '',
      author:       b.author || '',
      coverUrl:     b.cover_url || null,
      coverId:      b.cover_id  || null,
      olKey:        b.ol_key    || null,
      googleBooksId: b.google_books_id || null,
      isbn:         b.isbn      || null,
      description:  b.description || null,
      source:       'local' as const,
    }))

    // ── 2. Google Books API ───────────────────────────────────
    const googleUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=12&printType=books&key=${GOOGLE_BOOKS_KEY}`
    const googleRes = await fetch(googleUrl)
    const googleData = googleRes.ok ? await googleRes.json() : { items: [] }
    const googleItems = googleData.items || []

    // Score and sort
    const scored = googleItems
      .map((item: any) => ({ item, score: scoreResult(item) }))
      .sort((a: any, b: any) => b.score - a.score)

    const googleResults = scored.map(({ item }: any) => {
      const info = item.volumeInfo || {}
      const identifiers = info.industryIdentifiers || []
      const isbn = identifiers.find((i: any) => i.type === 'ISBN_13')?.identifier
                || identifiers.find((i: any) => i.type === 'ISBN_10')?.identifier
                || null
      const rawCoverUrl = info.imageLinks?.thumbnail
        ? info.imageLinks.thumbnail
            .replace('zoom=1', 'zoom=2')
            .replace('http://', 'https://')
        : null

      return {
        title:        decodeHtml(info.title),
        author:       (info.authors || []).map(decodeHtml).join(', '),
        coverUrl:     rawCoverUrl,
        coverId:      null,
        olKey:        null,
        googleBooksId: item.id,
        isbn,
        description:  info.description ? decodeHtml(info.description.slice(0, 500)) : null,
        source:       'google' as const,
        _rawCoverUrl: rawCoverUrl,
      }
    })

    // ── 2b. Open Library fallback (server-side, no CORS) ─────
    // Only called if Google returns fewer than 3 results
    let olResults: any[] = []
    if (googleResults.length < 3) {
      try {
        const olUrl = `https://openlibrary.org/search.json?title=${encodeURIComponent(query)}&fields=key,title,author_name,first_publish_year,cover_i&limit=6&language=eng`
        const olRes = await fetch(olUrl)
        if (olRes.ok) {
          const olData = await olRes.json()
          olResults = (olData.docs || []).map((doc: any) => ({
            title:        doc.title || '',
            author:       (doc.author_name || []).join(', '),
            coverUrl:     doc.cover_i
              ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
              : null,
            coverId:      doc.cover_i || null,
            olKey:        doc.key    || null,
            googleBooksId: null,
            isbn:         null,
            description:  null,
            source:       'openlibrary' as const,
            _rawCoverUrl: null,
          }))
        }
      } catch {
        // OL failed — continue with what we have
      }
    }

    // ── 3. Merge — local first, then Google, then OL (deduplicated) ──
    const localTitles = new Set(localResults.map((r: any) => r.title.toLowerCase()))
    const googleDeduped = googleResults.filter(
      (r: any) => !localTitles.has(r.title.toLowerCase())
    )
    const allTitles = new Set([
      ...localResults.map((r: any) => r.title.toLowerCase()),
      ...googleResults.map((r: any) => r.title.toLowerCase()),
    ])
    const olDeduped = olResults.filter(
      (r: any) => !allTitles.has(r.title.toLowerCase())
    )
    const merged = [...localResults, ...googleDeduped, ...olDeduped].slice(0, 10)

    // ── 4. Background: upload Google covers to Storage ────────
    // Fire and forget — client gets the raw Google URL immediately
    // and we update the books table with the Storage URL afterwards
    ;(async () => {
      for (const result of merged) {
        if (result.source === 'google' && result.googleBooksId && (result as any)._rawCoverUrl) {
          const storageUrl = await uploadGoogleCoverToStorage(
            sb,
            result.googleBooksId,
            (result as any)._rawCoverUrl
          )
          if (storageUrl) {
            // Update books table if this book already exists there
            await sb.from('books')
              .update({ cover_url: storageUrl })
              .eq('google_books_id', result.googleBooksId)
          }
        }
      }
    })()

    // Strip internal _rawCoverUrl before sending
    const clean = merged.map(({ _rawCoverUrl, ...r }: any) => r)

    return new Response(
      JSON.stringify({ results: clean }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('[book-search] error:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message, results: [] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
