// supabase/functions/populate-book-description/index.ts
//
// Triggered by a Supabase Database Webhook on staging.reading_entries
// when a row is inserted or updated with review_is_public = true.
//
// What it does:
//   1. Reads the book_id from the entry
//   2. Looks up the ol_key from staging.books
//   3. If books.description is null, fetches it from Open Library
//   4. Writes description + page_generated_at back to staging.books
//
// Set up as a Database Webhook in Supabase:
//   Table: staging.reading_entries
//   Events: INSERT, UPDATE
//   URL: https://<project-ref>.supabase.co/functions/v1/populate-book-description

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL    = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  try {
    const payload = await req.json()
    const record  = payload.record

    // Only proceed if this is a public review
    if (!record?.review_is_public || !record?.book_id) {
      return new Response('skipped', { status: 200 })
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
      db: { schema: 'public' }
    })

    // Look up the book's ol_key and current description
    const { data: book, error: bookErr } = await sb
      .from('books')
      .select('id, ol_key, description, page_generated_at')
      .eq('id', record.book_id)
      .single()

    if (bookErr || !book?.ol_key) {
      console.error('[populate-book-description] book lookup failed:', bookErr)
      return new Response('book not found', { status: 200 })
    }

    // If description already exists, just stamp page_generated_at if not set
    if (book.description) {
      if (!book.page_generated_at) {
        await sb.from('books')
          .update({ page_generated_at: new Date().toISOString() })
          .eq('id', book.id)
      }
      return new Response('description already exists', { status: 200 })
    }

    // Fetch description from Open Library
    const olId  = book.ol_key.replace('/works/', '')
    const olRes = await fetch(`https://openlibrary.org/works/${olId}.json`)

    if (!olRes.ok) {
      console.error('[populate-book-description] OL fetch failed:', olRes.status)
      // Still stamp page_generated_at so the page is linkable even without description
      await sb.from('books')
        .update({ page_generated_at: new Date().toISOString() })
        .eq('id', book.id)
      return new Response('OL fetch failed', { status: 200 })
    }

    const olData    = await olRes.json()
    const rawDesc   = olData.description
    let description = typeof rawDesc === 'string'
      ? rawDesc
      : rawDesc?.value || null

    // Trim to 600 chars at a word boundary
    if (description && description.length > 600) {
      description = description.slice(0, 600).replace(/\s+\S*$/, '') + '…'
    }

    // Write back to books table
    const { error: updateErr } = await sb.from('books')
      .update({
        description:       description,
        page_generated_at: new Date().toISOString(),
      })
      .eq('id', book.id)

    if (updateErr) {
      console.error('[populate-book-description] update failed:', updateErr)
      return new Response('update failed', { status: 500 })
    }

    console.log(`[populate-book-description] populated description for ${book.ol_key}`)
    return new Response('ok', { status: 200 })

  } catch (err) {
    console.error('[populate-book-description] unexpected error:', err)
    return new Response('error', { status: 500 })
  }
})