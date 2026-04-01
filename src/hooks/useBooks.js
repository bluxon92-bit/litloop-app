import { useState, useEffect } from 'react'
import { sb } from '../lib/supabase'
import { uploadGoogleCoverToSupabase, uploadCoverToSupabase } from '../lib/coverCache'

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  || 'https://afwvsrjbaxutfonmmxjd.supabase.co'
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

// ── OL enrichment via edge function ──────────────────────────────────────────
// OL is called server-side (no CORS issues). Writes ol_key, cover_id,
// description, first_publish_year directly to books.id and returns the values
// so local state can be updated immediately.
async function enrichBookWithOL(isbn, bookId, title, author) {
  console.log('[enrich] called with isbn:', isbn, 'bookId:', bookId)
  if (!isbn || !bookId) { console.log('[enrich] bailing — missing isbn or bookId'); return null }
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/book-enrich`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON}`,
      },
      body: JSON.stringify({ isbn, bookId, title, author }),
    })
    console.log('[enrich] edge function status:', res.status)
    const text = await res.text()
    console.log('[enrich] edge function raw response:', text)
    const data = JSON.parse(text)
    console.log('[enrich] parsed response:', data)
    return data.ok ? data : null
  } catch (err) {
    console.error('[enrich] error:', err)
    return null
  }
}

const LOCAL_KEY = 'litloop_books_v2'

function localLoad() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) || [] }
  catch { return [] }
}

function localSave(books) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(books)) }
  catch {}
}

// Map our local book shape → reading_entries columns
function toCloudRow(bookData, userId) {
  return {
    user_id:          userId,
    title_manual:     bookData.title        || null,
    author_manual:    bookData.author       || null,
    status:           bookData.status       || 'tbr',
    rating:           bookData.rating       || null,
    genre:            bookData.genre        || null,
    notes:            bookData.notes        || null,
    review_body:      bookData.reviewBody   || null,
    review_is_public: bookData.reviewPublic || false,
    date_finished:    bookData.dateRead     || null,
    date_started:     bookData.dateStarted  || null,
    tbr_position:     bookData.tbrPosition  || null,
    updated_at:       new Date().toISOString(),
  }
}

export function useBooks(user) {
  const [books, setBooks]   = useState(localLoad)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    if (!user) { setBooks([]); return }
    syncFromCloud()
  }, [user?.id])

  useEffect(() => {
    localSave(books)
  }, [books])

  async function syncFromCloud() {
    setSyncing(true)
    const { data, error } = await sb
      .from('reading_entries')
      .select('*, books(title, author, cover_id, ol_key, cover_url, isbn, description, google_books_id)')
      .eq('user_id', user.id)
      .order('added_at', { ascending: false })

    if (!error && data) {
      const mapped = data.map(e => ({
        id:           e.id,
        cloudId:      e.id,
        title:        e.books?.title     || e.title_manual  || '',
        author:       e.books?.author    || e.author_manual || '',
        coverId:       e.books?.cover_id        || null,
        olKey:         e.books?.ol_key          || null,
        coverUrl:      e.books?.cover_url       || null,
        isbn:          e.books?.isbn            || null,
        description:   e.books?.description     || null,
        googleBooksId: e.books?.google_books_id || null,
        status:       e.status,
        rating:       e.rating           || null,
        notes:        e.notes            || null,
        reviewBody:   e.review_body      || null,
        reviewPublic: e.review_is_public || false,
        reviewedAt:   e.reviewed_at       || null,
        dateRead:     e.date_finished    || null,
        dateStarted:  e.date_started     || null,
        tbrPosition:  e.tbr_position     || null,
        genre:        e.genre            || null,
        added:        e.added_at,
        updatedAt:    e.updated_at       || e.added_at,
        favourite:    e.favourite        || false,
        favOrder:     e.fav_order        || null,
        userId:       e.user_id,
        currentPage:   e.current_page     || null,
        totalPages:    e.total_pages      || null,
        spoilerWarning: e.spoiler_warning  || false,
      }))
      setBooks(mapped)
    }
    setSyncing(false)
  }

  function isDuplicate(title, author, excludeId = null) {
    const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
    return books.some(b =>
      b.id !== excludeId &&
      norm(b.title) === norm(title) &&
      norm(b.author) === norm(author)
    )
  }

  // Returns the existing book object if a duplicate exists, otherwise null.
  function findDuplicate(title, author, excludeId = null) {
    const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
    const nt = norm(title), na = norm(author)
    return books.find(b =>
      b.id !== excludeId &&
      norm(b.title) === nt &&
      (!na || !norm(b.author) || norm(b.author) === na)
    ) || null
  }

  async function addBook(bookData) {
    // Optimistic local update first
    const tempId = crypto.randomUUID()
    const newBook = {
      id:           tempId,
      title:        bookData.title,
      author:       bookData.author       || '',
      status:       bookData.status       || 'tbr',
      rating:       bookData.rating       || null,
      genre:        bookData.genre        || '',
      notes:        bookData.notes        || '',
      reviewBody:   bookData.reviewBody   || '',
      reviewPublic: bookData.reviewPublic || false,
      dateRead:     bookData.dateRead     || null,
      dateStarted:  bookData.dateStarted  || null,
      added:        new Date().toISOString(),
      coverId:       bookData.coverId       || null,
      olKey:         bookData.olKey         || null,
      coverUrl:      bookData.coverUrl      || null,
      isbn:          bookData.isbn          || null,
      description:   bookData.description   || null,
      googleBooksId: bookData.googleBooksId || null,
      userId:        user?.id              || null,
      favourite:    false,
      favOrder:     null,
    }
    setBooks(prev => [newBook, ...prev])

    // Write to Supabase
    if (user) {
      console.log('[addBook] bookData incoming:', {
        isbn: bookData.isbn,
        olKey: bookData.olKey,
        googleBooksId: bookData.googleBooksId,
        coverId: bookData.coverId,
        title: bookData.title,
      })
      let bookId = null

      // ── Unified books-table upsert ──────────────────────────────────────────
      // Any book with external data gets a row in books so cover_url, ol_key,
      // and cover_id are always stored centrally.
      if (bookData.olKey || bookData.googleBooksId || bookData.isbn) {
        const bookRow = {
          title:  bookData.title  || null,
          author: bookData.author || null,
        }
        if (bookData.olKey)         bookRow.ol_key          = bookData.olKey
        if (bookData.coverId)       bookRow.cover_id        = Number(bookData.coverId)
        if (bookData.isbn)          bookRow.isbn            = bookData.isbn
        if (bookData.googleBooksId) bookRow.google_books_id = bookData.googleBooksId
        if (bookData.description)   bookRow.description     = bookData.description
        if (bookData.coverUrl)      bookRow.cover_url       = bookData.coverUrl

        const conflictCol = bookData.olKey ? 'ol_key'
          : bookData.googleBooksId ? 'google_books_id'
          : 'isbn'

        const { data: upserted } = await sb
          .from('books')
          .upsert(bookRow, { onConflict: conflictCol, ignoreDuplicates: false })
          .select('id')
          .single()

        console.log('[addBook] upsert result:', upserted)
        if (upserted) {
          bookId = upserted.id
          console.log('[addBook] bookId set to:', bookId)

          // ── OL enrichment (server-side, no CORS issues) ─────────────────────
          // If this came from Google Books, ol_key and cover_id will be null.
          // Call book-enrich edge function to fetch them from OL by ISBN and
          // write directly to the books row we just created.
          if (bookData.isbn && !bookData.olKey) {
            console.log('[addBook] firing enrichBookWithOL — isbn:', bookData.isbn, 'bookId:', bookId)
            enrichBookWithOL(bookData.isbn, bookId, bookData.title, bookData.author).then(enriched => {
              console.log('[addBook] enrichment result:', enriched)
              if (!enriched) return
              // Patch local state so the UI reflects OL data immediately
              setBooks(prev => prev.map(b =>
                b.id === tempId ? {
                  ...b,
                  olKey:       enriched.olKey       || b.olKey,
                  coverId:     enriched.coverId      || b.coverId,
                  description: enriched.description  || b.description,
                } : b
              ))
            })
          }

          // ── Cover upload to Supabase Storage ────────────────────────────────
          if (bookData.coverId && bookData.olKey) {
            const storageUrl = await uploadCoverToSupabase(bookData.coverId, bookData.olKey)
            if (storageUrl) {
              setBooks(prev => prev.map(b => b.id === tempId ? { ...b, coverUrl: storageUrl } : b))
            }
          } else if (bookData.googleBooksId && bookData.coverUrl) {
            const storageUrl = await uploadGoogleCoverToSupabase(bookData.googleBooksId, bookData.coverUrl)
            if (storageUrl) {
              setBooks(prev => prev.map(b => b.id === tempId ? { ...b, coverUrl: storageUrl } : b))
            }
          }
        }
      }

      const row = {
        user_id:          user.id,
        status:           bookData.status       || 'tbr',
        rating:           bookData.rating       || null,
        genre:            bookData.genre        || null,
        notes:            bookData.notes        || null,
        review_body:      bookData.reviewBody   || null,
        review_is_public: bookData.reviewPublic || false,
        date_finished:    bookData.dateRead     || null,
        date_started:     bookData.dateStarted  || null,
        tbr_position:     bookData.tbrPosition  || null,
        added_at:         newBook.added,
        updated_at:       new Date().toISOString(),
      }

      if (bookId) {
        row.book_id = bookId
      } else {
        // Manual entry — no external data, store title/author directly on the entry
        row.title_manual  = bookData.title
        row.author_manual = bookData.author || null
      }

      const { data, error } = await sb
        .from('reading_entries')
        .insert(row)
        .select('id')
        .single()

      if (!error && data) {
        // Replace temp ID with the real DB id
        setBooks(prev => prev.map(b =>
          b.id === tempId ? { ...b, id: data.id, cloudId: data.id } : b
        ))
      } else if (error) {
        console.error('[Books] addBook cloud error:', error)
      }
    }
  }

  async function updateBook(id, changes) {
    // Optimistic local update
    setBooks(prev => prev.map(b => b.id === id ? { ...b, ...changes } : b))

    // Write to Supabase
    if (user) {
      const cloudChanges = {}
      if (changes.status       !== undefined) cloudChanges.status           = changes.status
      if (changes.rating       !== undefined) cloudChanges.rating            = changes.rating
      if (changes.notes        !== undefined) cloudChanges.notes             = changes.notes
      if (changes.reviewBody   !== undefined) cloudChanges.review_body       = changes.reviewBody
      if (changes.reviewPublic !== undefined) cloudChanges.review_is_public  = changes.reviewPublic
      if (changes.dateRead     !== undefined) cloudChanges.date_finished      = changes.dateRead
      if (changes.dateStarted  !== undefined) cloudChanges.date_started       = changes.dateStarted
      if (changes.tbrPosition  !== undefined) cloudChanges.tbr_position       = changes.tbrPosition
      if (changes.genre        !== undefined) cloudChanges.genre              = changes.genre
      if (changes.favourite    !== undefined) cloudChanges.favourite          = changes.favourite
      if (changes.favOrder     !== undefined) cloudChanges.fav_order          = changes.favOrder
      if (changes.currentPage  !== undefined) cloudChanges.current_page       = changes.currentPage
      if (changes.totalPages       !== undefined) cloudChanges.total_pages        = changes.totalPages
      if (changes.spoilerWarning   !== undefined) cloudChanges.spoiler_warning    = changes.spoilerWarning

      // coverId lives on books table (not reading_entries) — write separately via ol_key.
      // changes._olKey may be passed as a fallback when book.olKey is null (eg. Goodreads imports
      // where olKey is discovered during the OL search, not stored at import time).
      if (changes.coverId !== undefined) {
        const book = books.find(b => b.id === id)
        const writeKey = book?.olKey || changes._olKey
        if (writeKey) {
          ;(async () => {
            // Upsert books row to ensure cover_id is stored (handles both new and existing rows)
            const { data: upserted, error: upsertErr } = await sb
              .from('books')
              .upsert({
                ol_key:   writeKey,
                title:    book?.title    || changes._title    || null,
                author:   book?.author   || changes._author   || null,
                cover_id: Number(changes.coverId),
              }, { onConflict: 'ol_key', ignoreDuplicates: false })
              .select('id')
              .single()
            if (upsertErr) {
              console.error('[Books] cover upsert error:', upsertErr)
              return
            }
            // If the reading_entry has no book_id yet (was a manual entry), link it now
            if (upserted?.id && !book?.olKey) {
              const { error: linkErr } = await sb
                .from('reading_entries')
                .update({ book_id: upserted.id, title_manual: null, author_manual: null })
                .eq('id', id)
                .eq('user_id', user.id)
              if (linkErr) console.error('[Books] book_id link error:', linkErr)
              // Update local state so future updateBook calls use olKey
              setBooks(prev => prev.map(b => b.id === id ? { ...b, olKey: writeKey } : b))
            }
          })()
        }
      }

      // Set reviewed_at only on first publish — not on subsequent edits.
      // Re-fetch current book state AFTER optimistic update to avoid stale closure.
      if (changes.reviewBody !== undefined || changes.reviewPublic !== undefined) {
        const currentBook = books.find(b => b.id === id)
        const willBePublic = changes.reviewPublic !== undefined ? changes.reviewPublic : currentBook?.reviewPublic
        // Only stamp if: going public AND no reviewed_at already in DB AND review body is actually being set now
        const alreadyPublished = !!currentBook?.reviewedAt
        const hasReviewBody = changes.reviewBody !== undefined ? !!changes.reviewBody : !!currentBook?.reviewBody
        if (willBePublic && !alreadyPublished && hasReviewBody && changes.reviewBody !== undefined) {
          cloudChanges.reviewed_at = new Date().toISOString()
        }
      }

      cloudChanges.updated_at = new Date().toISOString()

      const { error } = await sb
        .from('reading_entries')
        .update(cloudChanges)
        .eq('id', id)
        .eq('user_id', user.id)

      if (error) console.error('[Books] updateBook cloud error:', error)
    }
  }

  async function deleteBook(id) {
    setBooks(prev => prev.filter(b => b.id !== id))
    if (user) {
      const { error } = await sb
        .from('reading_entries')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)
      if (error) console.error('[Books] deleteBook cloud error:', error)
    }
  }

  // Called by CoverImage after a successful lazy upload to Supabase Storage.
  // Updates local state so subsequent renders use the cached URL immediately.
  function updateCoverUrl(bookId, coverUrl) {
    setBooks(prev => prev.map(b => b.id === bookId ? { ...b, coverUrl } : b))
    // The DB is already updated inside uploadCoverToSupabase — no extra write needed here.
  }

  return { books, syncing, addBook, updateBook, deleteBook, isDuplicate, findDuplicate, syncFromCloud, updateCoverUrl }
}