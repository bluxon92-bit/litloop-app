import { useState, useEffect } from 'react'
import { sb } from '../lib/supabase'
import { clearIntent } from '../lib/readingListIntent'

// ── Reading List Onboarding Step ─────────────────────────────────────────
// Shown after the main onboarding flow completes, when a user arrived
// from a genre Top 100 page. Lets them quickly tick off books they've read.
//
// Props:
//   intent   — the stored intent object { action, ol_key, title, author, cover_url, genre, list_name }
//   addBook  — from useBooksContext
//   books    — existing books from useBooksContext (for duplicate detection)
//   onDone   — called when user finishes or skips

const SUPABASE_URL = import.meta.env.SUPABASE_URL || 'https://afwvsrjbaxutfonmmxjd.supabase.co'

export default function ReadingListOnboarding({ intent, addBook, books, onDone }) {
  const [listBooks, setListBooks]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [selected, setSelected]     = useState(new Set())
  const [saving, setSaving]         = useState(false)
  const [done, setDone]             = useState(false)

  // Pre-select the book that triggered the flow if action was mark-read
  useEffect(() => {
    if (intent.action === 'mark-read' && intent.ol_key) {
      setSelected(new Set([intent.ol_key]))
    }
  }, [intent])

  // Fetch the genre's top 100 list from Supabase
  useEffect(() => {
    async function fetchList() {
      setLoading(true)
      try {
        // Find the reading list by genre slug
        const { data: list } = await sb
          .from('reading_lists')
          .select('id')
          .eq('slug', intent.genre)
          .maybeSingle()

        if (!list) { setLoading(false); return }

        // Get the books for this list, ordered by position, limit 20 for this step
        const { data: items } = await sb
          .from('reading_list_books')
          .select('position, books(title, author, ol_key, cover_url, cover_id, description)')
          .eq('list_id', list.id)
          .order('position')
          .limit(20)

        if (items) {
          setListBooks(items.map(item => ({
            position: item.position,
            ...item.books,
          })).filter(b => b.ol_key))
        }
      } catch (err) {
        console.error('[ReadingListOnboarding] fetch error:', err)
      }
      setLoading(false)
    }
    fetchList()
  }, [intent.genre])

  function toggle(olKey) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(olKey)) next.delete(olKey)
      else next.add(olKey)
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    const toAdd = listBooks.filter(b => selected.has(b.ol_key))
    const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

    for (const book of toAdd) {
      // Skip if already in their list
      const alreadyAdded = books.some(b =>
        norm(b.title) === norm(book.title) && norm(b.author) === norm(book.author)
      )
      if (alreadyAdded) continue

      await addBook({
        title:     book.title,
        author:    book.author    || '',
        olKey:     book.ol_key    || null,
        coverUrl:  book.cover_url || null,
        coverId:   book.cover_id  || null,
        description: book.description || null,
        status:    'read',
        dateRead:  new Date().toISOString().split('T')[0],
      })
    }

    clearIntent()
    setSaving(false)
    setDone(true)
    setTimeout(onDone, 1200)
  }

  function handleSkip() {
    clearIntent()
    onDone()
  }

  // ── Done state ────────────────────────────────────────────
  if (done) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'var(--rt-cream)', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--rt-font-body)',
      }}>
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📚</div>
          <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.2rem', fontWeight: 600, color: 'var(--rt-navy)', marginBottom: '0.4rem' }}>
            {selected.size > 0 ? `${selected.size} book${selected.size > 1 ? 's' : ''} added!` : 'All set!'}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--rt-t3)' }}>Taking you to your reading list…</div>
        </div>
      </div>
    )
  }

  // ── Main step ─────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'var(--rt-cream)',
      fontFamily: 'var(--rt-font-body)',
      display: 'flex', flexDirection: 'column',
      overflowY: 'auto', overflowX: 'hidden',
    }}>
      {/* Progress bar — full, this is the last step */}
      <div style={{ height: 3, background: 'var(--rt-border)', flexShrink: 0 }}>
        <div style={{ height: '100%', background: 'var(--rt-amber)', width: '100%' }} />
      </div>

      {/* Header */}
      <div style={{
        background: 'linear-gradient(160deg, #111C35 0%, var(--rt-navy) 100%)',
        padding: '1.75rem 1.5rem 1.5rem', flexShrink: 0,
      }}>
        <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.3rem', fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>Litloop</div>
        <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.78rem', marginTop: '0.2rem' }}>One last thing</div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, maxWidth: 540, width: '100%', margin: '0 auto', padding: '2rem 1.5rem 3rem', boxSizing: 'border-box' }}>

        <h2 style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.35rem', fontWeight: 600, color: 'var(--rt-navy)', margin: '0 0 0.5rem', lineHeight: 1.2 }}>
          How many of the {intent.list_name || 'list'} have you read?
        </h2>
        <p style={{ color: 'var(--rt-t3)', fontSize: '0.88rem', margin: '0 0 1.75rem', lineHeight: 1.5 }}>
          Tap the books you've already read to add them to your list instantly. You can always add more later.
        </p>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem 0' }}>
            <div style={{ width: 28, height: 28, border: '3px solid var(--rt-border)', borderTopColor: 'var(--rt-navy)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          </div>
        ) : listBooks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--rt-t3)', fontSize: '0.88rem' }}>
            Couldn't load the list — you can add books from your reading list later.
          </div>
        ) : (
          <>
            {/* Count badge */}
            {selected.size > 0 && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                background: 'var(--rt-amber)', color: '#fff',
                borderRadius: 99, padding: '0.3rem 0.85rem',
                fontSize: '0.8rem', fontWeight: 700,
                marginBottom: '1.25rem',
              }}>
                ✓ {selected.size} book{selected.size > 1 ? 's' : ''} selected
              </div>
            )}

            {/* Book grid — 4 across on desktop, 3 on mobile */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
              gap: '1rem',
              marginBottom: '2rem',
            }}>
              {listBooks.map(book => {
                const isSelected = selected.has(book.ol_key)
                const coverSrc = book.cover_url
                  || (book.cover_id ? `https://covers.openlibrary.org/b/id/${book.cover_id}-M.jpg` : null)

                return (
                  <button
                    key={book.ol_key}
                    onClick={() => toggle(book.ol_key)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      padding: 0, textAlign: 'left', position: 'relative',
                    }}
                  >
                    {/* Cover */}
                    <div style={{
                      position: 'relative',
                      borderRadius: 6,
                      overflow: 'hidden',
                      aspectRatio: '2/3',
                      background: 'var(--rt-surface)',
                      boxShadow: isSelected
                        ? '0 0 0 3px var(--rt-amber), 0 4px 12px rgba(0,0,0,0.15)'
                        : '0 2px 8px rgba(0,0,0,0.12)',
                      transition: 'box-shadow 0.15s, transform 0.15s',
                      transform: isSelected ? 'translateY(-2px)' : 'none',
                    }}>
                      {coverSrc ? (
                        <img
                          src={coverSrc}
                          alt={book.title}
                          loading="lazy"
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                      ) : (
                        <div style={{
                          width: '100%', height: '100%',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: 'linear-gradient(135deg, #1a2744, #2d4070)',
                          padding: '0.5rem', boxSizing: 'border-box',
                        }}>
                          <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.7)', textAlign: 'center', lineHeight: 1.3, fontWeight: 600 }}>
                            {book.title}
                          </span>
                        </div>
                      )}
                      {/* Tick overlay */}
                      {isSelected && (
                        <div style={{
                          position: 'absolute', inset: 0,
                          background: 'rgba(201,151,58,0.25)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: '50%',
                            background: 'var(--rt-amber)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.85rem', color: '#fff', fontWeight: 900,
                          }}>✓</div>
                        </div>
                      )}
                    </div>
                    {/* Title below cover */}
                    <div style={{
                      fontSize: '0.65rem', fontWeight: 600,
                      color: isSelected ? 'var(--rt-amber)' : 'var(--rt-navy)',
                      marginTop: '0.35rem', lineHeight: 1.3,
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      transition: 'color 0.15s',
                    }}>
                      {book.title}
                    </div>
                  </button>
                )
              })}
            </div>
          </>
        )}

        {/* Actions */}
        {!loading && (
          <>
            <button
              onClick={handleSave}
              disabled={saving || selected.size === 0}
              style={{
                width: '100%',
                background: selected.size === 0 ? 'var(--rt-surface)' : 'var(--rt-navy)',
                color: selected.size === 0 ? 'var(--rt-t3)' : '#fff',
                border: 'none', borderRadius: 'var(--rt-r3)', padding: '0.95rem',
                fontSize: '0.95rem', fontWeight: 700,
                cursor: saving || selected.size === 0 ? 'default' : 'pointer',
                fontFamily: 'var(--rt-font-body)', transition: 'all 0.15s',
                marginBottom: '0.75rem',
              }}
            >
              {saving
                ? 'Saving…'
                : selected.size > 0
                ? `Add ${selected.size} book${selected.size > 1 ? 's' : ''} to my list →`
                : 'Select books you\'ve read'}
            </button>

            <div style={{ textAlign: 'center' }}>
              <button
                onClick={handleSkip}
                style={{
                  background: 'none', border: 'none',
                  color: 'var(--rt-t3)', fontSize: '0.82rem',
                  cursor: 'pointer', padding: '0.25rem',
                  textDecoration: 'underline', textUnderlineOffset: 2,
                }}
              >
                Skip for now →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
