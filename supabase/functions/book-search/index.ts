// supabase/functions/book-search/index.ts
//
// Unified book search proxy — fast path only.
// Flow:
//   1. Search local Supabase books table first (instant, no API cost)
//   2. Call Google Books API (server-side key, no browser rate-limiting)
//   3. OL search fallback if Google returns < 3 results
//   4. Score and sort: local first, then fiction/English boosted
//
// OL enrichment (ol_key, cover_id, description) is intentionally NOT done
// here. It runs once at add-time in useBooks.addBook via enrichWithOL(),
// so we pay the OL latency only for the one book the user actually picks.
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { q } = await req.json()
    if (!q || q.trim().length < 2) {
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
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

    const googleResults = googleItems
      .map((item: any) => ({ item, score: scoreResult(item) }))
      .sort((a: any, b: any) => b.score - a.score)
      .map(({ item }: any) => {
        const info = item.volumeInfo || {}
        const identifiers = info.industryIdentifiers || []
        const isbn = identifiers.find((i: any) => i.type === 'ISBN_13')?.identifier
                  || identifiers.find((i: any) => i.type === 'ISBN_10')?.identifier || null
        const coverUrl = info.imageLinks?.thumbnail
          ? info.imageLinks.thumbnail.replace('zoom=1', 'zoom=2').replace('http://', 'https://')
          : null
        return {
          title: decodeHtml(info.title),
          author: (info.authors || []).map(decodeHtml).join(', '),
          coverUrl,
          coverId: null,   // populated at add-time via enrichWithOL
          olKey: null,     // populated at add-time via enrichWithOL
          googleBooksId: item.id,
          isbn,
          description: info.description ? decodeHtml(info.description.slice(0, 500)) : null,
          source: 'google' as const,
        }
      })

    // ── 3. OL fallback if Google sparse ──────────────────────────
    let olResults: any[] = []
    if (googleResults.length < 3) {
      try {
        const olRes = await fetch(
          `https://openlibrary.org/search.json?title=${encodeURIComponent(query)}&fields=key,title,author_name,cover_i,isbn&limit=6&language=eng`
        )
        if (olRes.ok) {
          const olData = await olRes.json()
          olResults = (olData.docs || []).map((doc: any) => ({
            title: doc.title || '', author: (doc.author_name || []).join(', '),
            coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null,
            coverId: doc.cover_i || null, olKey: doc.key || null,
            googleBooksId: null, isbn: doc.isbn?.[0] || null, description: null,
            source: 'openlibrary' as const,
          }))
        }
      } catch { /* continue */ }
    }

    // ── 4. Merge & deduplicate ────────────────────────────────────
    const localTitles   = new Set(localResults.map((r: any) => r.title.toLowerCase()))
    const googleDeduped = googleResults.filter((r: any) => !localTitles.has(r.title.toLowerCase()))
    const allTitles     = new Set([
      ...localResults.map((r: any) => r.title.toLowerCase()),
      ...googleResults.map((r: any) => r.title.toLowerCase()),
    ])
    const olDeduped = olResults.filter((r: any) => !allTitles.has(r.title.toLowerCase()))

    const merged = [...localResults, ...googleDeduped, ...olDeduped].slice(0, 10)

    return new Response(
      JSON.stringify({ results: merged }),
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