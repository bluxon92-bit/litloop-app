// ─────────────────────────────────────────────────────────────
// importBooks.js — Goodreads & Storygraph CSV import utilities
// ─────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function normaliseTitle(s) {
  return s.toLowerCase().replace(/^(a |an |the )/i, '').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
}

export function normTitle(s) {
  return (s || '').replace(/\s*\([^)]*#\d[^)]*\)/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
}

export function isDuplicate(books, title, author, olKey = null, isbn = null) {
  const nt = normTitle(title)
  const na = normTitle(author)
  return books.some(b => {
    if (isbn && b.isbn && isbn === b.isbn) return true
    if (olKey && b.olKey && olKey === b.olKey) return true
    const bt = normTitle(b.title)
    const titleMatch = bt === nt || bt.startsWith(nt) || nt.startsWith(bt)
    if (!titleMatch) return false
    if (na && normTitle(b.author) && normTitle(b.author) !== na) return false
    return true
  })
}

// ── ISBN parsing ──────────────────────────────────────────────

// Goodreads wraps ISBNs in Excel formula escaping: ="0060776099"
// StoryGraph exports clean ISBNs: 9780756404734
export function parseISBN(raw) {
  if (!raw || !raw.trim()) return null
  // Strip Excel ="..." wrapper
  const stripped = raw.trim().replace(/^="?|"?=$/g, '').replace(/"/g, '').trim()
  // Accept ISBN-10 or ISBN-13 (digits only, possibly with hyphens)
  const clean = stripped.replace(/-/g, '')
  if (/^\d{10}$/.test(clean) || /^\d{13}$/.test(clean)) return clean
  return null
}

// Convert ISBN-10 to ISBN-13
function toISBN13(isbn) {
  if (!isbn) return null
  if (isbn.length === 13) return isbn
  if (isbn.length === 10) return '978' + isbn.slice(0, 9)
  return null
}

// ── Google Books lookup ───────────────────────────────────────

export async function lookupByISBN(isbn) {
  if (!isbn) return null
  const isbn13 = toISBN13(isbn)
  const query = isbn13 || isbn
  try {
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${query}&maxResults=1`)
    if (!res.ok) return null
    const data = await res.json()
    const item = data.items?.[0]
    if (!item) return null
    return extractGoogleBookData(item)
  } catch { return null }
}

export async function lookupByTitle(title, author) {
  const q = author ? `${title} ${author.split(',')[0].trim()}` : title
  try {
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=5&printType=books`)
    if (!res.ok) return null
    const data = await res.json()
    if (!data.items?.length) return null
    // Try to find a title match first
    const normTarget = normaliseTitle(title)
    const match = data.items.find(item => {
      const t = normaliseTitle(item.volumeInfo?.title || '')
      return t === normTarget || t.startsWith(normTarget.split(' ')[0])
    }) || data.items[0]
    return extractGoogleBookData(match)
  } catch { return null }
}

function extractGoogleBookData(item) {
  if (!item) return null
  const info = item.volumeInfo || {}
  const identifiers = info.industryIdentifiers || []
  const isbn13 = identifiers.find(i => i.type === 'ISBN_13')?.identifier || null
  const isbn10 = identifiers.find(i => i.type === 'ISBN_10')?.identifier || null
  const isbn = isbn13 || isbn10 || null
  const imageLinks = info.imageLinks || {}
  const coverUrl = imageLinks.thumbnail
    ? imageLinks.thumbnail.replace('zoom=1', 'zoom=2').replace('http://', 'https://')
    : null
  return {
    googleBooksId: item.id || null,
    isbn,
    description: info.description ? info.description.slice(0, 1000) : null,
    coverUrl,
    olKey: null,
    coverId: null,
  }
}

// ── OL fallback (title search only) ──────────────────────────

export async function matchBookToOL(title, author) {
  const query = author ? `${title} ${author.split(',')[0].trim()}` : title
  try {
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&fields=key,title,author_name,cover_i&limit=5&language=eng`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    const docs = data.docs || []
    if (!docs.length) return null
    const normTarget = normaliseTitle(title)
    const match = docs.find(d => normaliseTitle(d.title || '') === normTarget)
    const best = match || docs[0]
    if (!match) {
      const rn = normaliseTitle(best.title || '')
      if (!rn.includes(normTarget.split(' ')[0]) && !normTarget.includes(rn.split(' ')[0])) return null
    }
    return { olKey: best.key || null, coverId: best.cover_i || null, googleBooksId: null, isbn: null, description: null, coverUrl: null }
  } catch { return null }
}

// ── Batch enrichment — Google first, OL fallback ─────────────

export async function batchEnrich(bookList, onProgress) {
  const DELAY_ISBN  = 150  // Google Books ISBN lookup — fast
  const DELAY_TITLE = 300  // Google Books title search — slightly slower
  const DELAY_OL    = 400  // OL fallback — slowest
  const results = new Array(bookList.length).fill(null)

  for (let i = 0; i < bookList.length; i++) {
    const book = bookList[i]
    let result = null

    // 1. Try Google Books by ISBN first — most reliable
    if (book.isbn) {
      result = await lookupByISBN(book.isbn)
      if (result) await new Promise(r => setTimeout(r, DELAY_ISBN))
    }

    // 2. Fall back to Google Books title search
    if (!result) {
      result = await lookupByTitle(book.title, book.author)
      if (result) await new Promise(r => setTimeout(r, DELAY_TITLE))
    }

    // 3. Fall back to Open Library title search
    if (!result || (!result.olKey && !result.coverId)) {
      const olResult = await matchBookToOL(book.title, book.author)
      if (olResult) {
        result = result
          ? { ...result, olKey: olResult.olKey, coverId: olResult.coverId }
          : olResult
      }
      if (olResult) await new Promise(r => setTimeout(r, DELAY_OL))
    }

    results[i] = result
    onProgress(i + 1, bookList.length)
  }

  return results
}

// ── Legacy batchMatchOL kept for any existing callers ─────────
export async function batchMatchOL(bookList, onProgress) {
  return batchEnrich(bookList, onProgress)
}

export function normaliseImportedGenre(raw) {
  if (!raw || !raw.trim()) return null
  const terms = raw.toLowerCase()
  if (terms.includes('fantasy'))                                                         return 'Fantasy'
  if (terms.includes('sci-fi') || terms.includes('science-fiction')
    || terms.includes('science fiction') || terms.includes('scifi'))                     return 'Science Fiction'
  if (terms.includes('horror'))                                                          return 'Horror'
  if (terms.includes('romance'))                                                         return 'Romance'
  if (terms.includes('dystopia'))                                                        return 'Dystopian'
  if (terms.includes('literary fiction') || terms.includes('literary'))                  return 'Literary Fiction'
  if (terms.includes('historical fiction') || terms.includes('historical'))              return 'Historical Fiction'
  if (terms.includes('thriller') || terms.includes('mystery')
    || terms.includes('crime') || terms.includes('suspense'))                            return 'Thriller'
  if (terms.includes('non-fiction') || terms.includes('nonfiction')
    || terms.includes('biography') || terms.includes('memoir')
    || terms.includes('self-help') || terms.includes('history')
    || terms.includes('true crime') || terms.includes('psychology'))                     return 'Non-Fiction'
  if (terms.includes('short stor') || terms.includes('anthology')
    || terms.includes('collection'))                                                     return 'Short Stories'
  return null
}

export function parseGRDate(str) {
  if (!str || !str.trim()) return null
  const s = str.trim()
  const slash = s.match(/^(\d{4})\/(\d{2})\/(\d{2})$/)
  if (slash) return `${slash[1]}-${slash[2]}-${slash[3]}`
  const dash = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dash) return `${dash[1]}-${dash[2]}-${dash[3]}`
  const partial = s.match(/^(\d{4})[\/\-](\d{2})$/)
  if (partial) return `${partial[1]}-${partial[2]}-01`
  const yearOnly = s.match(/^(\d{4})$/)
  if (yearOnly) return `${yearOnly[1]}-01-01`
  return null
}

export function parseCSV(text) {
  const rows = []; let row = [], cell = '', inQuote = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') {
      if (inQuote && text[i + 1] === '"') { cell += '"'; i++ } else inQuote = !inQuote
    } else if (c === ',' && !inQuote) {
      row.push(cell); cell = ''
    } else if ((c === '\n' || c === '\r') && !inQuote) {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some(c => c)) rows.push(row); row = []
    } else { cell += c }
  }
  if (cell || row.length) { row.push(cell); if (row.some(c => c)) rows.push(row) }
  return rows
}

export async function processGoodreadsCSV(csvText, existingBooks, onProgress) {
  const rows = parseCSV(csvText)
  if (!rows.length) throw new Error('No rows found')

  const headers = rows[0].map(h => h.toLowerCase().trim())
  const col = name => headers.findIndex(h => h.includes(name))

  const iTitle     = col('title')
  const iBookId    = col('book id')
  const iAuthor    = headers.findIndex(h => h.includes('author'))
  const iShelf     = col('exclusive shelf')
  const iShelves   = col('bookshelves')
  const iRating    = col('my rating')
  const iDateRead  = col('date read')
  const iDateAdded = col('date added')
  const iReview    = col('my review')
  const iISBN13    = col('isbn13')
  const iISBN      = col('isbn')

  if (iTitle === -1) throw new Error('Could not find Title column — is this a Goodreads CSV?')

  const toImport = []; let skipped = 0
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row[iTitle] || !row[iTitle].trim()) continue
    const title     = row[iTitle].trim()
    const author    = iAuthor    >= 0 ? row[iAuthor].trim()  : ''
    const shelf     = iShelf     >= 0 ? row[iShelf].trim().toLowerCase() : ''
    const rating    = iRating    >= 0 ? parseInt(row[iRating]) || null : null
    const grId      = iBookId    >= 0 ? row[iBookId].trim()  : null
    const dateRead  = iDateRead  >= 0 ? parseGRDate(row[iDateRead])  : null
    const dateAdded = iDateAdded >= 0 ? parseGRDate(row[iDateAdded]) : null
    const notes     = iReview    >= 0 ? (row[iReview] || '').trim() || null : null
    const genre     = normaliseImportedGenre(iShelves >= 0 ? row[iShelves] : '')
    // Prefer ISBN13 over ISBN10; strip Goodreads Excel escaping
    const isbn      = parseISBN(iISBN13 >= 0 ? row[iISBN13] : '')
                   || parseISBN(iISBN   >= 0 ? row[iISBN]   : '')

    if (isDuplicate(existingBooks, title, author, null, isbn)) { skipped++; continue }

    let status = 'read'
    if      (shelf === 'to-read')           status = 'tbr'
    else if (shelf === 'currently-reading') status = 'reading'

    toImport.push({
      id: uid(), title, author, status, isbn: isbn || null,
      rating:      status === 'read' ? rating    : null,
      notes:       status === 'read' ? notes     : null,
      dateRead:    status === 'read' ? dateRead  : null,
      dateStarted: status === 'reading' ? (dateAdded || null) : null,
      added:       dateAdded || new Date().toISOString(),
      genre:       genre || null,
      source: 'goodreads', goodreadsId: grId || null,
      olKey: null, coverId: null, googleBooksId: null, description: null, coverUrl: null
    })
  }

  if (!toImport.length) return { books: [], skipped }

  const enriched = await batchEnrich(toImport, onProgress)
  let matched = 0
  enriched.forEach((e, i) => {
    if (e) {
      toImport[i].olKey        = e.olKey        || null
      toImport[i].coverId      = e.coverId      || null
      toImport[i].googleBooksId = e.googleBooksId || null
      toImport[i].description  = e.description  || null
      toImport[i].coverUrl     = e.coverUrl     || null
      // Prefer ISBN from enrichment if we didn't have one from the CSV
      if (!toImport[i].isbn && e.isbn) toImport[i].isbn = e.isbn
      matched++
    }
  })

  return { books: toImport, skipped, matched }
}

export async function processStorygraphCSV(csvText, existingBooks, onProgress) {
  const rows = parseCSV(csvText)
  if (!rows.length) throw new Error('No rows found')

  const headers = rows[0].map(h => h.toLowerCase().trim())
  const col = name => headers.findIndex(h => h.includes(name))

  const iTitle     = col('title')
  const iAuthor    = col('authors')
  const iStatus    = col('read status')
  const iRating    = col('star rating')
  const iDateRead  = col('last date read')
  const iDateAdded = col('date added')
  const iReview    = col('review')
  const iGenres    = col('genres')
  const iISBN      = col('isbn')  // StoryGraph: "ISBN/UID" column

  if (iTitle === -1) throw new Error('Could not find Title column — is this a Storygraph CSV?')

  const toImport = []; let skipped = 0
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row[iTitle] || !row[iTitle].trim()) continue
    const title     = row[iTitle].trim()
    const author    = iAuthor    >= 0 ? row[iAuthor].trim()  : ''
    const sgStatus  = iStatus    >= 0 ? row[iStatus].trim().toLowerCase() : 'read'
    const rawRating = iRating    >= 0 ? parseFloat(row[iRating]) : NaN
    const rating    = !isNaN(rawRating) ? Math.round(rawRating) : null
    const dateRead  = iDateRead  >= 0 ? parseGRDate(row[iDateRead])  : null
    const dateAdded = iDateAdded >= 0 ? parseGRDate(row[iDateAdded]) : null
    const notes     = iReview    >= 0 ? (row[iReview] || '').trim() || null : null
    const genre     = normaliseImportedGenre(iGenres >= 0 ? row[iGenres] : '')
    // StoryGraph ISBNs are clean — no escaping needed
    const isbn      = parseISBN(iISBN >= 0 ? row[iISBN] : '')

    if (isDuplicate(existingBooks, title, author, null, isbn)) { skipped++; continue }

    let status = 'read'
    if      (sgStatus === 'to-read')           status = 'tbr'
    else if (sgStatus === 'currently-reading') status = 'reading'
    else if (sgStatus === 'did-not-finish')    status = 'dnf'

    toImport.push({
      id: uid(), title, author, status, isbn: isbn || null,
      rating:      status === 'read' ? rating    : null,
      notes:       status === 'read' ? notes     : null,
      dateRead:    status === 'read' ? dateRead  : null,
      dateStarted: status === 'reading' ? (dateAdded || null) : null,
      added:       dateAdded || new Date().toISOString(),
      genre:       genre || null,
      source: 'storygraph',
      olKey: null, coverId: null, googleBooksId: null, description: null, coverUrl: null
    })
  }

  if (!toImport.length) return { books: [], skipped }

  const enriched = await batchEnrich(toImport, onProgress)
  let matched = 0
  enriched.forEach((e, i) => {
    if (e) {
      toImport[i].olKey        = e.olKey        || null
      toImport[i].coverId      = e.coverId      || null
      toImport[i].googleBooksId = e.googleBooksId || null
      toImport[i].description  = e.description  || null
      toImport[i].coverUrl     = e.coverUrl     || null
      if (!toImport[i].isbn && e.isbn) toImport[i].isbn = e.isbn
      matched++
    }
  })

  return { books: toImport, skipped, matched }
}