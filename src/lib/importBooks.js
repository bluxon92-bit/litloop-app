// ─────────────────────────────────────────────────────────────
// importBooks.js — Goodreads & Storygraph CSV import utilities
// All functions are pure / framework-agnostic.
// ─────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function normaliseTitle(s) {
  return s.toLowerCase().replace(/^(a |an |the )/i, '').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
}

export function normTitle(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
}

export function isDuplicate(books, title, author) {
  const nt = normTitle(title)
  const na = normTitle(author)
  return books.some(b => {
    if (normTitle(b.title) !== nt) return false
    if (na && normTitle(b.author) && normTitle(b.author) !== na) return false
    return true
  })
}

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
    return { olKey: best.key || null, coverId: best.cover_i || null }
  } catch (e) {
    return null
  }
}

export async function batchMatchOL(bookList, onProgress) {
  const BATCH = 3, DELAY = 400
  const results = new Array(bookList.length).fill(null)
  for (let i = 0; i < bookList.length; i += BATCH) {
    const slice = bookList.slice(i, i + BATCH)
    const matches = await Promise.all(slice.map(b => matchBookToOL(b.title, b.author)))
    matches.forEach((m, j) => { results[i + j] = m })
    onProgress(Math.min(i + BATCH, bookList.length), bookList.length)
    if (i + BATCH < bookList.length) await new Promise(r => setTimeout(r, DELAY))
  }
  return results
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

// ─────────────────────────────────────────────────────────────
// Returns { books: [], skipped: number } — caller handles saving
// ─────────────────────────────────────────────────────────────

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

    if (isDuplicate(existingBooks, title, author)) { skipped++; continue }

    let status = 'read'
    if      (shelf === 'to-read')           status = 'tbr'
    else if (shelf === 'currently-reading') status = 'reading'

    toImport.push({
      id: uid(), title, author, status,
      rating:      status === 'read' ? rating    : null,
      notes:       status === 'read' ? notes     : null,
      dateRead:    status === 'read' ? dateRead  : null,
      dateStarted: status === 'reading' ? (dateAdded || null) : null,
      added:       dateAdded || new Date().toISOString(),
      genre:       genre || null,
      source: 'goodreads', goodreadsId: grId || null,
      olKey: null, coverId: null
    })
  }

  if (!toImport.length) return { books: [], skipped }

  // OL matching
  const olResults = await batchMatchOL(toImport, onProgress)
  let matched = 0
  olResults.forEach((ol, i) => {
    if (ol) { toImport[i].olKey = ol.olKey; toImport[i].coverId = ol.coverId; matched++ }
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

    if (isDuplicate(existingBooks, title, author)) { skipped++; continue }

    let status = 'read'
    if      (sgStatus === 'to-read')           status = 'tbr'
    else if (sgStatus === 'currently-reading') status = 'reading'
    else if (sgStatus === 'did-not-finish')    status = 'dnf'

    toImport.push({
      id: uid(), title, author, status,
      rating:      status === 'read' ? rating    : null,
      notes:       status === 'read' ? notes     : null,
      dateRead:    status === 'read' ? dateRead  : null,
      dateStarted: status === 'reading' ? (dateAdded || null) : null,
      added:       dateAdded || new Date().toISOString(),
      genre:       genre || null,
      source: 'storygraph',
      olKey: null, coverId: null
    })
  }

  if (!toImport.length) return { books: [], skipped }

  const olResults = await batchMatchOL(toImport, onProgress)
  let matched = 0
  olResults.forEach((ol, i) => {
    if (ol) { toImport[i].olKey = ol.olKey; toImport[i].coverId = ol.coverId; matched++ }
  })

  return { books: toImport, skipped, matched }
}