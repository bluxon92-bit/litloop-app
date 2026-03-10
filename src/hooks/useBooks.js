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

export function useBooks(user) {
  const [books, setBooks] = useState(localLoad)
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
        title:        e.books?.title    || e.title_manual  || '',
        author:       e.books?.author   || e.author_manual || '',
        coverId:      e.books?.cover_id || null,
        olKey:        e.books?.ol_key   || null,
        status:       e.status,
        rating:       e.rating          || null,
        notes:        e.notes           || null,
        reviewBody:   e.review_body     || null,
        reviewPublic: e.review_is_public || false,
        dateRead:     e.date_finished   || null,
        dateStarted:  e.date_started    || null,
        tbrPosition:  e.tbr_position    || null,
        genre:        e.genre           || null,
        added:        e.added_at,
        updatedAt:    e.updated_at      || e.added_at,
        favourite:    e.favourite       || false,
        favOrder:     e.fav_order       || null,
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
    const newBook = {
      id:           crypto.randomUUID(),
      title:        bookData.title,
      author:       bookData.author      || '',
      status:       bookData.status      || 'tbr',
      rating:       bookData.rating      || null,
      genre:        bookData.genre       || '',
      notes:        bookData.notes       || '',
      reviewBody:   bookData.reviewBody  || '',
      reviewPublic: bookData.reviewPublic || false,
      dateRead:     bookData.dateRead    || null,
      dateStarted:  bookData.dateStarted || null,
      added:        new Date().toISOString(),
      coverId:      bookData.coverId     || null,
      olKey:        bookData.olKey       || null,
      userId:       user?.id             || null,
      favourite:    false,
      favOrder:     null,
    }

    setBooks(prev => [newBook, ...prev])
    return newBook
  }

  async function updateBook(id, changes) {
    setBooks(prev => prev.map(b => b.id === id ? { ...b, ...changes } : b))
  }

  async function deleteBook(id) {
    setBooks(prev => prev.filter(b => b.id !== id))
    if (user) {
      await sb.from('reading_entries').delete().eq('id', id).eq('user_id', user.id)
    }
  }

  return { books, syncing, addBook, updateBook, deleteBook, isDuplicate, syncFromCloud }
}