import { useState, useEffect } from 'react'
import { sb } from '../lib/supabase'

const LOCAL_KEY = 'litloop_books_v1'

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
      .select('*, books(title, author, cover_id, ol_key)')
      .eq('user_id', user.id)
      .order('added_at', { ascending: false })

    if (!error && data) {
      const mapped = data.map(e => ({
        id:           e.id,
        cloudId:      e.id,
        title:        e.books?.title     || e.title_manual  || '',
        author:       e.books?.author    || e.author_manual || '',
        coverId:      e.books?.cover_id  || null,
        olKey:        e.books?.ol_key    || null,
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
      coverId:      bookData.coverId      || null,
      olKey:        bookData.olKey        || null,
      userId:       user?.id              || null,
      favourite:    false,
      favOrder:     null,
    }
    setBooks(prev => [newBook, ...prev])

    // Write to Supabase
    if (user) {
      let bookId = null

      // If this came from OpenLibrary, upsert into books table to preserve cover/ol_key
      if (bookData.olKey) {
        const bookRow = {
          ol_key: bookData.olKey,
          title:  bookData.title  || null,
          author: bookData.author || null,
        }
        // Only set cover_id when we actually have one — avoid overwriting an existing cover with null
        if (bookData.coverId) bookRow.cover_id = Number(bookData.coverId)
        const { data: upserted } = await sb
          .from('books')
          .upsert(bookRow, { onConflict: 'ol_key', ignoreDuplicates: false })
          .select('id')
          .single()
        if (upserted) bookId = upserted.id
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
        // Manual entry — no OL data, store title/author directly
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

  return { books, syncing, addBook, updateBook, deleteBook, isDuplicate, syncFromCloud }
}