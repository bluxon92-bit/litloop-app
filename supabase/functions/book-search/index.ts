// supabase/functions/book-search/index.ts
//
// Unified book search proxy.
// Flow:
//   1. Search local Supabase books table first (instant, no API cost)
//   2. Call Google Books API (server-side key, no browser rate limiting)
//   3. For each Google result with an ISBN, query Open Library via ISBN
//      to get ol_key, cover_id, description, publish year
//   4. Score and sort: local first, then fiction/English boosted
//   5. Upload covers to Supabase Storage in background (OL preferred, Google fallback)
//   6. OL search fallback if Google returns < 3 results
//
// Result shape: { title, author, coverUrl, coverId, olKey, googleBooksId, isbn, description, source }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GOOGLE_BOOKS_KEY = Deno.env.get('GOOGLE_BOOKS_API_KEY')!
const BUCKET           = 'book-covers'

function decodeHtml(str: string | null | undefined): string {
  if (!str) return ''
  return str
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
}

function scoreResult(item: any): number {
  const info = item.volumeInfo || {}
  let score = 0
  if (info.language === 'en') score += 10
  const cats = (info.categories || []).map((c: string) => c.toLowerCase())
  if (cats.some((c: string) => c.includes('fiction') && !c.includes('non-fiction'))) score += 8
  if (cats.some((c: string) => ['biography','history','reference','self-help','business'].some(nf => c.includes(nf)))) score -= 5
  const titleLower = (info.title || '').toLowerCase()
  const descLower  = (info.description || '').toLowerCase()
  const titlePenalty = ['dictionary','encyclopedia','study guide','sparknotes','cliffsnotes',
    'textbook','workbook','handbook','manual','proceedings','journal of',
    'introduction to','principles of','theory of','annual report','biennial report']
  if (titlePenalty.some(w => titleLower.includes(w))) score -= 10
  const fictionBoost = ['novel','fiction','fantasy','thriller','mystery','romance',
    'science fiction','horror','adventure','story','tale','saga']
  if (fictionBoost.some(w => descLower.includes(w))) score += 5
  if (info.imageLinks?.thumbnail) score += 3
  if (info.description) score += 2
  if ((info.pageCount || 0) > 100) score += 1
  return score
}

// Look up a book on Open Library by ISBN
// Uses search API (more reliable than books API for coverage)
async function enrichFromOL(isbn: string): Promise<{
  olKey: string | null
  coverId: number | null
  description: string | null
  firstPublishYear: number | null
} | null> {
  try {
    // Primary: ISBN search — most reliable, broad coverage
    const searchRes = await fetch(
      `https://openlibrary.org/search.json?isbn=${isbn}&fields=key,cover_i,first_publish_year,description&limit=1`
    )
    if (searchRes.ok) {
      const searchData = await searchRes.json()
      const doc = searchData.docs?.[0]
      if (doc) {
        const olKey = doc.key || null
        const coverId = doc.cover_i || null
        const firstPublishYear = doc.first_publish_year || null
        let description: string | null = null
        if (typeof doc.description === 'string') description = doc.description.slice(0, 500)
        else if (doc.description?.value) description = doc.description.value.slice(0, 500)

        // If we have olKey but no description, fetch from works endpoint
        if (olKey && !description) {
          try {
            const worksId = olKey.replace('/works/', '')
            const worksRes = await fetch(`https://openlibrary.org/works/${worksId}.json`)
            if (worksRes.ok) {
              const worksData = await worksRes.json()
              if (typeof worksData.description === 'string') description = worksData.description.slice(0, 500)
              else if (worksData.description?.value) description = worksData.description.value.slice(0, 500)
            }
          } catch { /* continue without description */ }
        }

        return { olKey, coverId, description, firstPublishYear }
      }
    }
    return null
  } catch {
    return null
  }
}

// Upload cover to Supabase Storage — prefers OL (higher res) over Google thumbnail
async function uploadCoverToStorage(sb: any, opts: {
  coverId?: number | null
  olKey?: string | null
  googleBooksId?: string | null
  googleCoverUrl?: string | null
}): Promise<string | null> {
  try {
    // OL cover preferred
    if (opts.coverId && opts.olKey) {
      const safeFolder = opts.olKey.replace(/^\//, '').replace(/\//g, '_').replace(/[^a-zA-Z0-9_-]/g, '')
      const path = `${safeFolder}/${opts.coverId}.jpg`
      const { data: existing } = await sb.storage.from(BUCKET).list(safeFolder)
      if (existing?.some((f: any) => f.name === `${opts.coverId}.jpg`)) {
        return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`
      }
      const res = await fetch(`https://covers.openlibrary.org/b/id/${opts.coverId}-L.jpg`)
      if (res.ok) {
        const blob = await res.blob()
        if (blob.size > 1000) {
          const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: true })
          if (!error) {
            const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`
            await sb.from('books').update({ cover_url: publicUrl }).eq('ol_key', opts.olKey)
            return publicUrl
          }
        }
      }
    }
    // Google thumbnail fallback
    if (opts.googleBooksId && opts.googleCoverUrl) {
      const safeFolder = `google_${opts.googleBooksId.replace(/[^a-zA-Z0-9_-]/g, '')}`
      const path = `${safeFolder}/cover.jpg`
      const { data: existing } = await sb.storage.from(BUCKET).list(safeFolder)
      if (existing?.some((f: any) => f.name === 'cover.jpg')) {
        return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`
      }
      const res = await fetch(opts.googleCoverUrl)
      if (res.ok) {
        const blob = await res.blob()
        if (blob.size > 1000) {
          const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: true })
          if (!error) {
            const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`
            await sb.from('books').update({ cover_url: publicUrl }).eq('google_books_id', opts.googleBooksId)
            return publicUrl
          }
        }
      }
    }
    return null
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
      return new Response(JSON.stringify({ results: [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const query = q.trim()
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { db: { schema: 'public' } })

    // ── 1. Local Supabase books table ─────────────────────────────
    const { data: localBooks } = await sb
      .from('books')
      .select('id, title, author, cover_url, cover_id, ol_key, google_books_id, isbn, description')
      .or(`title.ilike.%${query}%,author.ilike.%${query}%`)
      .limit(5)

    const localResults = (localBooks || []).map((b: any) => ({
      title: b.title || '', author: b.author || '',
      coverUrl: b.cover_url || null, coverId: b.cover_id || null,
      olKey: b.ol_key || null, googleBooksId: b.google_books_id || null,
      isbn: b.isbn || null, description: b.description || null,
      source: 'local' as const,
    }))

    // ── 2. Google Books API ───────────────────────────────────────
    const googleUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=12&printType=books&key=${GOOGLE_BOOKS_KEY}`
    const googleRes = await fetch(googleUrl)
    const googleData = googleRes.ok ? await googleRes.json() : { items: [] }
    const googleItems: any[] = googleData.items || []

    const scored = googleItems
      .map((item: any) => ({ item, score: scoreResult(item) }))
      .sort((a: any, b: any) => b.score - a.score)

    // ── 3. Enrich top 6 via ISBN → Open Library (parallel, 4s timeout) ──
    const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T | null> =>
      Promise.race([promise, new Promise<null>(r => setTimeout(() => r(null), ms))])

    const enriched = await Promise.all(
      scored.slice(0, 6).map(async ({ item }: any) => {
        const info = item.volumeInfo || {}
        const identifiers = info.industryIdentifiers || []
        const isbn = identifiers.find((i: any) => i.type === 'ISBN_13')?.identifier
                  || identifiers.find((i: any) => i.type === 'ISBN_10')?.identifier || null
        const rawCoverUrl = info.imageLinks?.thumbnail
          ? info.imageLinks.thumbnail.replace('zoom=1', 'zoom=2').replace('http://', 'https://')
          : null

        let olKey: string | null = null
        let coverId: number | null = null
        let description: string | null = info.description ? decodeHtml(info.description.slice(0, 500)) : null

        if (isbn) {
          const olData = await withTimeout(enrichFromOL(isbn), 4000)
          if (olData) {
            if (olData.olKey) olKey = olData.olKey
            if (olData.coverId) coverId = olData.coverId
            if (olData.description && (!description || olData.description.length > description.length)) {
              description = olData.description
            }
          }
        }

        return {
          title: decodeHtml(info.title),
          author: (info.authors || []).map(decodeHtml).join(', '),
          coverUrl: rawCoverUrl, coverId, olKey,
          googleBooksId: item.id, isbn, description,
          source: 'google' as const,
          _rawCoverUrl: rawCoverUrl,
        }
      })
    )

    // Remaining Google results (unenriched, lower ranked)
    const remaining = scored.slice(6).map(({ item }: any) => {
      const info = item.volumeInfo || {}
      const identifiers = info.industryIdentifiers || []
      const isbn = identifiers.find((i: any) => i.type === 'ISBN_13')?.identifier
               || identifiers.find((i: any) => i.type === 'ISBN_10')?.identifier || null
      const rawCoverUrl = info.imageLinks?.thumbnail
        ? info.imageLinks.thumbnail.replace('zoom=1', 'zoom=2').replace('http://', 'https://')
        : null
      return {
        title: decodeHtml(info.title), author: (info.authors || []).map(decodeHtml).join(', '),
        coverUrl: rawCoverUrl, coverId: null, olKey: null,
        googleBooksId: item.id, isbn,
        description: info.description ? decodeHtml(info.description.slice(0, 500)) : null,
        source: 'google' as const, _rawCoverUrl: rawCoverUrl,
      }
    })

    const googleResults = [...enriched, ...remaining]

    // ── 4. OL fallback if Google sparse ──────────────────────────
    let olResults: any[] = []
    if (googleResults.length < 3) {
      try {
        const olRes = await fetch(`https://openlibrary.org/search.json?title=${encodeURIComponent(query)}&fields=key,title,author_name,cover_i,isbn&limit=6&language=eng`)
        if (olRes.ok) {
          const olData = await olRes.json()
          olResults = (olData.docs || []).map((doc: any) => ({
            title: doc.title || '', author: (doc.author_name || []).join(', '),
            coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null,
            coverId: doc.cover_i || null, olKey: doc.key || null,
            googleBooksId: null, isbn: doc.isbn?.[0] || null, description: null,
            source: 'openlibrary' as const, _rawCoverUrl: null,
          }))
        }
      } catch { /* continue */ }
    }

    // ── 5. Merge ──────────────────────────────────────────────────
    const localTitles   = new Set(localResults.map((r: any) => r.title.toLowerCase()))
    const googleDeduped = googleResults.filter((r: any) => !localTitles.has(r.title.toLowerCase()))
    const allTitles     = new Set([
      ...localResults.map((r: any) => r.title.toLowerCase()),
      ...googleResults.map((r: any) => r.title.toLowerCase()),
    ])
    const olDeduped = olResults.filter((r: any) => !allTitles.has(r.title.toLowerCase()))
    const merged = [...localResults, ...googleDeduped, ...olDeduped].slice(0, 10)

    // ── 6. Background cover upload ────────────────────────────────
    ;(async () => {
      for (const result of merged) {
        if (result.source === 'local') continue
        const storageUrl = await uploadCoverToStorage(sb, {
          coverId:       result.coverId       || null,
          olKey:         result.olKey         || null,
          googleBooksId: result.googleBooksId || null,
          googleCoverUrl: (result as any)._rawCoverUrl || null,
        })
        if (storageUrl) result.coverUrl = storageUrl
      }
    })()

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