import { useState, useEffect, useCallback } from 'react'
import { sb } from '../lib/supabase'
import CoverImage from '../components/books/CoverImage'

// ── All 15 genres from reading_lists table ────────────────────────
const ALL_GENRES = [
  { slug: 'fantasy',            label: 'Fantasy' },
  { slug: 'grimdark',           label: 'Grimdark' },
  { slug: 'sci-fi',             label: 'Science Fiction' },
  { slug: 'horror',             label: 'Horror' },
  { slug: 'thriller',           label: 'Thriller' },
  { slug: 'crime-mystery',      label: 'Crime & Mystery' },
  { slug: 'romance',            label: 'Romance' },
  { slug: 'romantasy',          label: 'Romantasy' },
  { slug: 'historical-fiction', label: 'Historical Fiction' },
  { slug: 'literary-fiction',   label: 'Literary Fiction' },
  { slug: 'young-adult',        label: 'Young Adult' },
  { slug: 'biography-memoir',   label: 'Biography & Memoir' },
  { slug: 'non-fiction',        label: 'Non-Fiction' },
  { slug: 'contemporary-fiction', label: 'Contemporary Fiction' },
  { slug: 'travel-writing',     label: 'Travel Writing' },
]

const DEFAULT_FAVOURITES = ['fantasy', 'crime-mystery', 'romance']
const MAX_FAVOURITES = 3
const INITIAL_SHOW = 15
const FAV_GENRES_KEY = 'litloop_fav_genres'
const GENRE_CACHE_KEY = 'litloop_genre_'

function loadCachedFavourites() {
  try {
    const raw = sessionStorage.getItem(FAV_GENRES_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return null
}

function saveCachedFavourites(favs) {
  try { sessionStorage.setItem(FAV_GENRES_KEY, JSON.stringify(favs)) } catch {}
}

function loadCachedGenre(slug) {
  try {
    const raw = sessionStorage.getItem(GENRE_CACHE_KEY + slug)
    if (raw) return JSON.parse(raw)
  } catch {}
  return null
}

function saveCachedGenre(slug, books, listId) {
  try { sessionStorage.setItem(GENRE_CACHE_KEY + slug, JSON.stringify({ books, listId })) } catch {}
}

// ── Status colours (matching stats page palette) ─────────────────
const STATUS_COLOUR = {
  read:      '#22c55e',   // green
  tbr:       '#C9973A',   // amber
  reading:   '#3b82f6',   // blue
  dnf:       '#94a3b8',   // slate
  dismissed: '#cbd5e1',   // light grey
}

const STATUS_LABEL = {
  read:      'Read',
  tbr:       'To Read',
  reading:   'Reading',
  dnf:       'DNF',
  dismissed: 'Dismissed',
}

// ── Segmented progress bar ────────────────────────────────────────
function ProgressBar({ books, total }) {
  const counts = { read: 0, tbr: 0, reading: 0, dismissed: 0 }
  books.forEach(b => {
    if (b.user_status === 'read')      counts.read++
    else if (b.user_status === 'tbr')  counts.tbr++
    else if (b.user_status === 'reading') counts.reading++
    else if (b.user_status === 'dismissed') counts.dismissed++
  })
  const untracked = total - counts.read - counts.tbr - counts.reading - counts.dismissed

  const segments = [
    { key: 'read',      count: counts.read,      colour: STATUS_COLOUR.read },
    { key: 'tbr',       count: counts.tbr,        colour: STATUS_COLOUR.tbr },
    { key: 'reading',   count: counts.reading,    colour: STATUS_COLOUR.reading },
    { key: 'dismissed', count: counts.dismissed,  colour: STATUS_COLOUR.dismissed },
  ].filter(s => s.count > 0)

  return (
    <div style={{ marginBottom: '1.25rem' }}>
      {/* Bar */}
      <div style={{ height: 8, borderRadius: 99, background: 'var(--rt-border)', overflow: 'hidden', display: 'flex', marginBottom: '0.6rem' }}>
        {segments.map(s => (
          <div
            key={s.key}
            style={{
              width: `${(s.count / total) * 100}%`,
              background: s.colour,
              transition: 'width 0.4s ease',
            }}
          />
        ))}
      </div>
      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1rem' }}>
        {segments.map(s => (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: s.colour, flexShrink: 0 }} />
            <span style={{ fontSize: '0.72rem', color: 'var(--rt-t3)' }}>
              {s.count} {STATUS_LABEL[s.key]}
            </span>
          </div>
        ))}
        {untracked > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--rt-border)', flexShrink: 0 }} />
            <span style={{ fontSize: '0.72rem', color: 'var(--rt-t3)' }}>{untracked} untracked</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Single book tile (3-col grid) ─────────────────────────────────
function BookTile({ book, listId, userId, onStatusChange, onDismiss, onUndismiss, addBook, onSelectBook }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [saving, setSaving]     = useState(false)

  const isDismissed = book.user_status === 'dismissed'
  const isTracked   = book.user_status && book.user_status !== 'dismissed'

  async function handleAdd(status) {
    setSaving(true)
    setMenuOpen(false)
    try {
      await addBook({
        title:     book.title,
        author:    book.author    || '',
        olKey:     book.ol_key    || null,
        coverUrl:  book.cover_url || null,
        coverId:   book.cover_id  || null,
        status,
        dateRead:  status === 'read' ? new Date().toISOString().split('T')[0] : null,
      })
      onStatusChange(book.book_id, status)
    } catch (err) {
      console.error('[BookTile] add error:', err)
    }
    setSaving(false)
  }

  async function handleDismiss() {
    setSaving(true)
    setMenuOpen(false)
    try {
      await sb.from('dismissed_genre_list_books').insert({
        user_id: userId,
        list_id: listId,
        book_id: book.book_id,
      })
      onDismiss(book.book_id)
    } catch (err) {
      console.error('[BookTile] dismiss error:', err)
    }
    setSaving(false)
  }

  async function handleUndismiss() {
    setSaving(true)
    try {
      await sb.from('dismissed_genre_list_books')
        .delete()
        .eq('user_id', userId)
        .eq('list_id', listId)
        .eq('book_id', book.book_id)
      onUndismiss(book.book_id)
    } catch (err) {
      console.error('[BookTile] undismiss error:', err)
    }
    setSaving(false)
  }

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
      {/* Rank badge */}
      <div style={{
        position: 'absolute', top: 4, left: 4, zIndex: 2,
        background: 'rgba(17,28,53,0.75)', backdropFilter: 'blur(4px)',
        color: '#fff', borderRadius: 4,
        fontSize: '0.58rem', fontWeight: 700,
        padding: '0.1em 0.35em', lineHeight: 1.6,
      }}>
        #{book.list_position}
      </div>

      {/* Status badge */}
      {isTracked && (
        <div style={{
          position: 'absolute', top: 4, right: 4, zIndex: 2,
          background: STATUS_COLOUR[book.user_status],
          color: '#fff', borderRadius: 4,
          fontSize: '0.52rem', fontWeight: 700,
          padding: '0.1em 0.35em', lineHeight: 1.6,
        }}>
          {STATUS_LABEL[book.user_status]}
        </div>
      )}

      {/* Cover */}
      <div
        onClick={() => onSelectBook && onSelectBook({
          title:           book.title,
          author:          book.author,
          coverUrl:        book.cover_url  || null,
          coverId:         book.cover_id   || null,
          olKey:           book.ol_key     || null,
          description:     book.description || null,
          _key:            `genre-${book.book_id}`,
          _genreBook:      true,
          _bookId:         book.book_id,
          _onStatusChange: onStatusChange,
          _onDismiss:      onDismiss,
        })}
        style={{
          borderRadius: 8,
          overflow: 'hidden',
          aspectRatio: '2/3',
          opacity: isDismissed ? 0.35 : isTracked ? 0.65 : 1,
          transition: 'opacity 0.2s',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          background: 'var(--rt-surface)',
          cursor: onSelectBook ? 'pointer' : 'default',
        }}
      >
        <CoverImage
          coverUrl={book.cover_url}
          coverId={book.cover_id}
          olKey={book.ol_key}
          title={book.title}
          size="M"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </div>

      {/* Title */}
      <div style={{
        fontSize: '0.65rem', fontWeight: 600, lineHeight: 1.3,
        color: isDismissed ? 'var(--rt-t3)' : isTracked ? 'var(--rt-t2)' : 'var(--rt-navy)',
        marginTop: '0.3rem',
        overflow: 'hidden',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
      }}>
        {book.title}
      </div>

      <div style={{
        fontSize: '0.58rem', color: 'var(--rt-t3)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        marginTop: '0.1rem',
      }}>
        {book.author}
      </div>

      {/* Action buttons */}
      {!isDismissed && !isTracked && userId && (
        <div style={{ marginTop: '0.4rem', position: 'relative' }}>
          {menuOpen ? (
            <div style={{
              position: 'absolute', bottom: '100%', left: 0, right: 0,
              background: 'var(--rt-white)', border: '1px solid var(--rt-border-md)',
              borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
              zIndex: 10, overflow: 'hidden',
            }}>
              {[
                { status: 'tbr',     label: '+ To Read' },
                { status: 'read',    label: '✓ Mark Read' },
                { status: 'reading', label: '📖 Reading' },
              ].map(({ status, label }) => (
                <button
                  key={status}
                  onClick={() => handleAdd(status)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: '0.5rem 0.6rem', fontSize: '0.72rem',
                    fontWeight: 600, color: 'var(--rt-navy)',
                    borderBottom: '1px solid var(--rt-border)',
                    fontFamily: 'var(--rt-font-body)',
                  }}
                >
                  {label}
                </button>
              ))}
              <button
                onClick={handleDismiss}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: '0.5rem 0.6rem', fontSize: '0.72rem',
                  fontWeight: 600, color: 'var(--rt-t3)',
                  fontFamily: 'var(--rt-font-body)',
                }}
              >
                ✕ Not for me
              </button>
            </div>
          ) : null}
          <button
            onClick={() => setMenuOpen(v => !v)}
            disabled={saving}
            style={{
              width: '100%', background: menuOpen ? 'var(--rt-navy)' : 'var(--rt-surface)',
              color: menuOpen ? '#fff' : 'var(--rt-navy)',
              border: `1px solid ${menuOpen ? 'var(--rt-navy)' : 'var(--rt-border-md)'}`,
              borderRadius: 6, padding: '0.3rem 0',
              fontSize: '0.65rem', fontWeight: 700,
              cursor: saving ? 'default' : 'pointer',
              fontFamily: 'var(--rt-font-body)',
              transition: 'all 0.15s',
            }}
          >
            {saving ? '…' : '+ Add'}
          </button>
        </div>
      )}

      {/* Undismiss button */}
      {isDismissed && userId && (
        <button
          onClick={handleUndismiss}
          disabled={saving}
          style={{
            marginTop: '0.4rem', width: '100%',
            background: 'none', border: '1px solid var(--rt-border)',
            borderRadius: 6, padding: '0.3rem 0',
            fontSize: '0.6rem', color: 'var(--rt-t3)',
            cursor: 'pointer', fontFamily: 'var(--rt-font-body)',
          }}
        >
          Undo
        </button>
      )}
    </div>
  )
}

// ── Edit Favourites sheet ─────────────────────────────────────────
function EditFavouritesSheet({ current, onSave, onClose }) {
  const [selected, setSelected] = useState(new Set(current))

  function toggle(slug) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(slug)) { next.delete(slug); return next }
      if (next.size >= MAX_FAVOURITES) return prev
      next.add(slug); return next
    })
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--rt-white)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, padding: '1.25rem', maxHeight: '75vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
          <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1rem', fontWeight: 600, color: 'var(--rt-navy)' }}>
            Favourite Genres
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--rt-t3)' }}>×</button>
        </div>
        <p style={{ fontSize: '0.78rem', color: 'var(--rt-t3)', marginBottom: '1rem', marginTop: 0 }}>
          Pick up to {MAX_FAVOURITES} genres to pin to the top of your list.
        </p>
        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '1rem' }}>
          {ALL_GENRES.map(g => {
            const active = selected.has(g.slug)
            const disabled = !active && selected.size >= MAX_FAVOURITES
            return (
              <button
                key={g.slug}
                onClick={() => toggle(g.slug)}
                disabled={disabled}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: active ? 'var(--rt-amber-pale)' : 'var(--rt-surface)',
                  border: `1.5px solid ${active ? 'var(--rt-amber)' : 'var(--rt-border)'}`,
                  borderRadius: 10, padding: '0.65rem 0.85rem',
                  cursor: disabled ? 'default' : 'pointer',
                  opacity: disabled ? 0.4 : 1,
                  fontFamily: 'var(--rt-font-body)',
                  transition: 'all 0.15s',
                }}
              >
                <span style={{ fontSize: '0.88rem', fontWeight: 600, color: active ? 'var(--rt-amber)' : 'var(--rt-navy)' }}>
                  {g.label}
                </span>
                <span style={{ fontSize: '1rem', opacity: active ? 1 : 0.25 }}>★</span>
              </button>
            )
          })}
        </div>
        <button
          onClick={() => { onSave([...selected]); onClose() }}
          style={{
            width: '100%', background: 'var(--rt-navy)', color: '#fff',
            border: 'none', borderRadius: 'var(--rt-r3)', padding: '0.9rem',
            fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer',
            fontFamily: 'var(--rt-font-body)',
          }}
        >
          Save favourites
        </button>
      </div>
    </div>
  )
}

// ── Main GenresTab ────────────────────────────────────────────────
export default function GenresTab({ user, addBook, onSelectBook }) {
  // Session-persistent selected genre
  const [selectedSlug, setSelectedSlug] = useState(
    () => sessionStorage.getItem('litloop_genre_tab') || null
  )
  const [favourites, setFavourites]     = useState(() => loadCachedFavourites() || DEFAULT_FAVOURITES)
  const [showEditFavs, setShowEditFavs] = useState(false)
  const [books, setBooks]               = useState([])
  const [listId, setListId]             = useState(null)
  const [loading, setLoading]           = useState(false)
  const [showAll, setShowAll]           = useState(false)
  const [showDismissed, setShowDismissed] = useState(false)
  const [savingFavs, setSavingFavs]     = useState(false)

  // Load user's saved favourite genres — serve from sessionStorage cache instantly,
  // then refresh from DB in background so it's always up to date.
  useEffect(() => {
    if (!user) return
    async function loadFavs() {
      const { data } = await sb
        .from('profiles')
        .select('favourite_genres')
        .eq('id', user.id)
        .maybeSingle()
      if (data?.favourite_genres?.length) {
        setFavourites(data.favourite_genres)
        saveCachedFavourites(data.favourite_genres)
      }
    }
    loadFavs()
  }, [user?.id])

  // Set default selected genre once favourites are loaded
  useEffect(() => {
    if (!selectedSlug && favourites.length) {
      const slug = favourites[0]
      setSelectedSlug(slug)
      sessionStorage.setItem('litloop_genre_tab', slug)
    }
  }, [favourites])

  // Fetch list when genre changes
  useEffect(() => {
    if (!selectedSlug) return
    setShowAll(false)
    setShowDismissed(false)
    fetchList(selectedSlug)
  }, [selectedSlug, user?.id])

  const fetchList = useCallback(async (slug) => {
    // Fix 2: serve from sessionStorage cache immediately — no spinner for repeat visits
    const cached = loadCachedGenre(slug)
    if (cached) {
      setBooks(cached.books)
      setListId(cached.listId)
      setLoading(false)
      // Refresh in background so user status changes are reflected next visit
      fetchAndUpdate(slug)
      return
    }
    setLoading(true)
    setBooks([])
    await fetchAndUpdate(slug)
    setLoading(false)
  }, [user?.id])

  // Fix 1: RPC and list_id lookup run in parallel (were sequential before)
  const fetchAndUpdate = useCallback(async (slug) => {
    try {
      const [rpcResult, listResult] = await Promise.all([
        sb.rpc('get_genre_list_for_user', {
          p_list_slug: slug,
          p_user_id:   user?.id ?? null,
        }),
        sb.from('reading_lists').select('id').eq('slug', slug).maybeSingle(),
      ])
      if (rpcResult.error) throw rpcResult.error
      const books  = rpcResult.data || []
      const listId = listResult.data?.id ?? null
      setBooks(books)
      setListId(listId)
      saveCachedGenre(slug, books, listId)
    } catch (err) {
      console.error('[GenresTab] fetch error:', err)
    }
  }, [user?.id])

  function handleSelectGenre(slug) {
    setSelectedSlug(slug)
    sessionStorage.setItem('litloop_genre_tab', slug)
  }

  async function handleSaveFavourites(newFavs) {
    setFavourites(newFavs)
    saveCachedFavourites(newFavs)
    setSavingFavs(true)
    if (user) {
      await sb
        .from('profiles')
        .update({ favourite_genres: newFavs })
        .eq('id', user.id)
    }
    setSavingFavs(false)
  }

  function handleStatusChange(bookId, status) {
    setBooks(prev => prev.map(b => b.book_id === bookId ? { ...b, user_status: status } : b))
  }

  function handleDismiss(bookId) {
    setBooks(prev => prev.map(b => b.book_id === bookId ? { ...b, user_status: 'dismissed' } : b))
  }

  function handleUndismiss(bookId) {
    setBooks(prev => prev.map(b => b.book_id === bookId ? { ...b, user_status: null } : b))
  }

  // Sort: untracked first (by position), tracked second, dismissed last
  const sortedBooks = [...books].sort((a, b) => {
    const rank = s => s === 'dismissed' ? 2 : s ? 1 : 0
    const ra = rank(a.user_status), rb = rank(b.user_status)
    if (ra !== rb) return ra - rb
    return a.list_position - b.list_position
  })

  const activeBooks    = sortedBooks.filter(b => b.user_status !== 'dismissed')
  const dismissedBooks = sortedBooks.filter(b => b.user_status === 'dismissed')
  const visibleActive  = showAll ? activeBooks : activeBooks.slice(0, INITIAL_SHOW)

  // Build ordered chip list: favourites first, then rest
  const orderedGenres = [
    ...ALL_GENRES.filter(g => favourites.includes(g.slug)),
    ...ALL_GENRES.filter(g => !favourites.includes(g.slug)),
  ]

  const currentGenre = ALL_GENRES.find(g => g.slug === selectedSlug)

  return (
    <div>
      {/* ── Genre chip strip ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', overflowX: 'auto', paddingBottom: '0.5rem', scrollbarWidth: 'none', msOverflowStyle: 'none', marginBottom: '1rem' }}>
        {orderedGenres.map((g, idx) => {
          const isFav    = favourites.includes(g.slug)
          const isActive = g.slug === selectedSlug
          // Divider after last favourite
          const showDivider = idx === favourites.length - 1 && favourites.length < ALL_GENRES.length
          return (
            <div key={g.slug} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
              <button
                onClick={() => handleSelectGenre(g.slug)}
                style={{
                  flexShrink: 0,
                  background: isActive ? 'var(--rt-navy)' : isFav ? 'var(--rt-amber-pale)' : 'var(--rt-surface)',
                  color: isActive ? '#fff' : isFav ? 'var(--rt-amber)' : 'var(--rt-t2)',
                  border: `1.5px solid ${isActive ? 'var(--rt-navy)' : isFav ? 'var(--rt-amber)' : 'var(--rt-border)'}`,
                  borderRadius: 99, padding: '0.3rem 0.75rem',
                  fontSize: '0.78rem', fontWeight: isActive || isFav ? 700 : 500,
                  cursor: 'pointer', fontFamily: 'var(--rt-font-body)',
                  transition: 'all 0.15s',
                  display: 'flex', alignItems: 'center', gap: '0.25rem',
                }}
              >
                {isFav && <span style={{ fontSize: '0.6rem', opacity: 0.8 }}>★</span>}
                {g.label}
              </button>
              {showDivider && (
                <div style={{ width: 1, height: 20, background: 'var(--rt-border-md)', flexShrink: 0 }} />
              )}
            </div>
          )
        })}
        {/* Edit favourites button */}
        <button
          onClick={() => setShowEditFavs(true)}
          style={{
            flexShrink: 0, background: 'none',
            border: '1.5px dashed var(--rt-border-md)',
            borderRadius: 99, padding: '0.3rem 0.65rem',
            fontSize: '0.72rem', fontWeight: 600, color: 'var(--rt-t3)',
            cursor: 'pointer', fontFamily: 'var(--rt-font-body)',
            whiteSpace: 'nowrap',
          }}
        >
          ★ Edit
        </button>
      </div>

      {/* ── List header + progress bar ── */}
      {selectedSlug && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <div>
              <h3 style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.05rem', fontWeight: 600, color: 'var(--rt-navy)', margin: 0 }}>
                {currentGenre?.label} Top {books.length}
              </h3>
              {!user && (
                <p style={{ fontSize: '0.75rem', color: 'var(--rt-t3)', margin: '0.2rem 0 0' }}>
                  Sign in to track your progress
                </p>
              )}
            </div>
            {books.length > 0 && user && (
              <span style={{ fontSize: '0.72rem', color: 'var(--rt-t3)' }}>
                {books.filter(b => b.user_status === 'read').length}/{books.length} read
              </span>
            )}
          </div>

          {books.length > 0 && user && (
            <ProgressBar books={books} total={books.length} />
          )}

          {/* ── Book grid ── */}
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem 0' }}>
              <div style={{ width: 28, height: 28, border: '3px solid var(--rt-border)', borderTopColor: 'var(--rt-navy)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            </div>
          ) : books.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--rt-t3)', fontSize: '0.85rem' }}>
              No books found for this genre.
            </div>
          ) : (
            <>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '1rem 0.75rem',
                marginBottom: '1rem',
              }}>
                {visibleActive.map(book => (
                  <BookTile
                    key={book.book_id}
                    book={book}
                    listId={listId}
                    userId={user?.id ?? null}
                    onStatusChange={handleStatusChange}
                    onDismiss={handleDismiss}
                    onUndismiss={handleUndismiss}
                    addBook={addBook}
                    onSelectBook={onSelectBook}
                  />
                ))}
              </div>

              {/* Show all / collapse */}
              {activeBooks.length > INITIAL_SHOW && (
                <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                  <button
                    onClick={() => setShowAll(v => !v)}
                    style={{
                      background: 'var(--rt-surface)', border: '1px solid var(--rt-border-md)',
                      borderRadius: 99, padding: '0.45rem 1.25rem',
                      fontSize: '0.78rem', fontWeight: 600, color: 'var(--rt-navy)',
                      cursor: 'pointer', fontFamily: 'var(--rt-font-body)',
                    }}
                  >
                    {showAll
                      ? '↑ Show less'
                      : `Show all ${activeBooks.length} books ↓`}
                  </button>
                </div>
              )}

              {/* Dismissed section */}
              {dismissedBooks.length > 0 && (
                <div style={{ marginTop: '0.5rem' }}>
                  <button
                    onClick={() => setShowDismissed(v => !v)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: '0.75rem', color: 'var(--rt-t3)',
                      fontFamily: 'var(--rt-font-body)', padding: '0.25rem 0',
                      display: 'flex', alignItems: 'center', gap: '0.35rem',
                    }}
                  >
                    <span style={{ fontSize: '0.65rem' }}>{showDismissed ? '▼' : '▶'}</span>
                    {showDismissed ? 'Hide' : `Show`} dismissed ({dismissedBooks.length})
                  </button>

                  {showDismissed && (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '1rem 0.75rem',
                      marginTop: '0.75rem',
                    }}>
                      {dismissedBooks.map(book => (
                        <BookTile
                          key={book.book_id}
                          book={book}
                          listId={listId}
                          userId={user?.id ?? null}
                          onStatusChange={handleStatusChange}
                          onDismiss={handleDismiss}
                          onUndismiss={handleUndismiss}
                          addBook={addBook}
                          onSelectBook={onSelectBook}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Edit favourites sheet */}
      {showEditFavs && (
        <EditFavouritesSheet
          current={favourites}
          onSave={handleSaveFavourites}
          onClose={() => setShowEditFavs(false)}
        />
      )}
    </div>
  )
}