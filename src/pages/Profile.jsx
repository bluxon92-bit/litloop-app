import { useState } from 'react'
import { useBooksContext } from '../context/BooksContext'
import { useSocialContext } from '../context/SocialContext'
import { useAuthContext } from '../context/AuthContext'
import { fmtDate, avatarColour, avatarInitial } from '../lib/utils'
import { ModalShell } from '../components/books/BookSheet'
import CoverImage from '../components/books/CoverImage'
import BookDetailPanel from '../components/books/BookDetailPanel'

function CogIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  )
}

export default function Profile({ onNavigate }) {
  const { user } = useAuthContext()
  const { books, updateBook } = useBooksContext()
  const {
    myUsername, myDisplayName, myBio, topBookIds,
    saveFavBooks
  } = useSocialContext()

  const [detailBook, setDetailBook]       = useState(null)
  const [detailLocation, setDetailLocation] = useState(null)
  const [favEditorOpen, setFavEditorOpen] = useState(false)
  const [favSelected, setFavSelected]     = useState([])

  const read    = books.filter(b => b.status === 'read')
  const reading = books.filter(b => b.status === 'reading')
    .sort((a, b) => new Date(b.dateStarted || b.added || 0) - new Date(a.dateStarted || a.added || 0))

  // All reviews sorted by date — show all with reviewBody
  const reviews = [...read]
    .filter(b => b.reviewBody)
    .sort((a, b) => new Date(b.dateRead || b.added || 0) - new Date(a.dateRead || a.added || 0))

  const favBooks = topBookIds.map(id => books.find(b => b.id === id)).filter(Boolean)

  const displayName  = myDisplayName || myUsername || user?.email?.split('@')[0] || 'Reader'
  const avatarBg     = avatarColour(user?.id || 'x')
  const avatarLetter = avatarInitial(displayName)

  function openFavEditor() { setFavSelected([...topBookIds]); setFavEditorOpen(true) }
  function toggleFav(id) {
    setFavSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length >= 10 ? prev : [...prev, id])
  }
  async function handleSaveFavs() { await saveFavBooks(favSelected); setFavEditorOpen(false) }

  function BookCoverWithTitle({ book, onClick }) {
    return (
      <div onClick={onClick} style={{ cursor: 'pointer', textAlign: 'center', width: 62, flexShrink: 0 }}>
        <CoverImage coverId={book.coverId} olKey={book.olKey} title={book.title} size="M" />
        <div style={{
          fontSize: '0.6rem', color: 'var(--rt-t2)', marginTop: 4,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          maxWidth: 62, lineHeight: 1.2, fontWeight: 500
        }}>{book.title}</div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>

      {/* ── Navy hero header ── */}
      <div style={{
        background: 'linear-gradient(160deg, var(--rt-navy) 0%, #243A5E 100%)',
        padding: '1.5rem 1.25rem 1.4rem',
        position: 'relative',
        marginBottom: '1.25rem',
        borderRadius: '0 0 20px 20px',
      }}>
        {/* Cog → settings */}
        <button
          onClick={() => onNavigate('account')}
          style={{
            position: 'absolute', top: '1rem', right: '1rem',
            background: 'rgba(255,255,255,0.12)', border: 'none',
            borderRadius: '50%', width: 34, height: 34,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'rgba(255,255,255,0.7)', transition: 'background 0.15s'
          }}
          title="Account settings"
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.22)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
        ><CogIcon /></button>

        {/* Avatar + name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
          <div style={{
            width: 54, height: 54, borderRadius: '50%', background: avatarBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--rt-font-display)', fontSize: '1.3rem', fontWeight: 700,
            color: '#fff', flexShrink: 0, border: '2.5px solid rgba(255,255,255,0.2)'
          }}>{avatarLetter}</div>
          <div>
            <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.15rem', fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>{displayName}</div>
            {myUsername && <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.55)', marginTop: '0.15rem' }}>@{myUsername}</div>}
            {myBio && <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.65)', marginTop: '0.35rem', lineHeight: 1.45 }}>{myBio}</div>}
          </div>
        </div>
      </div>

      <div style={{ padding: '0 1.25rem 2rem' }}>

        {/* ── Currently reading (most recently started) ── */}
        {reading.length > 0 && (() => {
          const book = reading[0]
          return (
            <div className="rt-card" style={{ marginBottom: '1.1rem' }}>
              <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-teal)', marginBottom: '0.6rem' }}>Currently reading</div>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', cursor: 'pointer' }}
                onClick={() => { setDetailBook(book); setDetailLocation('mylist-reading') }}>
                <CoverImage coverId={book.coverId} olKey={book.olKey} title={book.title} size="M" />
                <div>
                  <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.9rem', fontWeight: 700, color: 'var(--rt-navy)' }}>{book.title}</div>
                  {book.author && <div style={{ fontSize: '0.75rem', color: 'var(--rt-t3)' }}>{book.author}</div>}
                  {book.dateStarted && <div style={{ fontSize: '0.68rem', color: 'var(--rt-t3)', marginTop: 2 }}>Started {fmtDate(book.dateStarted)}</div>}
                </div>
              </div>
            </div>
          )
        })()}

        {/* ── Favourite books (carousel, up to 10) ── */}
        <div className="rt-card" style={{ marginBottom: '1.1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.9rem', fontWeight: 700, color: 'var(--rt-navy)' }}>Favourite books</div>
            <button onClick={openFavEditor}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--rt-amber)', fontWeight: 600 }}>
              Edit →
            </button>
          </div>
          {favBooks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1rem 0', color: 'var(--rt-t3)', fontSize: '0.82rem' }}>
              <span style={{ display: 'block', fontSize: '1.5rem', marginBottom: '0.4rem' }}>⭐</span>
              Pin up to 10 favourites.
              <br/>
              <button onClick={openFavEditor} style={{ marginTop: '0.5rem', background: 'none', border: 'none', color: 'var(--rt-amber)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>Choose books</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '0.85rem', overflowX: 'auto', paddingBottom: '0.3rem', scrollbarWidth: 'none' }}>
              {favBooks.map(book => (
                <BookCoverWithTitle key={book.id} book={book} onClick={() => { setDetailBook(book); setDetailLocation('mylist-history') }} />
              ))}
            </div>
          )}
        </div>

        {/* ── My reviews ── */}
        {reviews.length > 0 && (
          <div className="rt-card" style={{ marginBottom: '1.1rem' }}>
            <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.9rem', fontWeight: 700, color: 'var(--rt-navy)', marginBottom: '0.85rem' }}>My reviews</div>
            {reviews.map(book => (
              <div
                key={book.id}
                onClick={() => { setDetailBook(book); setDetailLocation('mylist-history') }}
                style={{
                  display: 'flex', gap: '0.85rem', alignItems: 'flex-start',
                  padding: '0.85rem 0', borderBottom: '1px solid var(--rt-border)',
                  cursor: 'pointer',
                }}
              >
                {/* Cover */}
                <div style={{ flexShrink: 0, width: 46, height: 66, borderRadius: 6, overflow: 'hidden', background: 'var(--rt-surface)' }}>
                  {book.coverId
                    ? <img src={`https://covers.openlibrary.org/b/id/${book.coverId}-S.jpg`}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt=""
                        onError={e => e.target.style.display='none'} />
                    : book.olKey
                      ? <img src={`https://covers.openlibrary.org/b/olid/${book.olKey.replace('/works/','')}-S.jpg`}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt=""
                          onError={e => e.target.style.display='none'} />
                      : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>📖</div>
                  }
                </div>

                {/* Body */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.88rem', fontWeight: 700, color: 'var(--rt-navy)', marginBottom: '0.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{book.title}</div>
                  {book.rating > 0 && (
                    <div style={{ fontSize: '0.88rem', color: 'var(--rt-amber)', marginBottom: '0.25rem', letterSpacing: '1px' }}>
                      {'★'.repeat(book.rating)}{'☆'.repeat(5 - book.rating)}
                    </div>
                  )}
                  <div style={{ fontSize: '0.8rem', color: 'var(--rt-t2)', lineHeight: 1.5,
                    display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {book.reviewBody}
                  </div>
                  {book.dateRead && (
                    <div style={{ fontSize: '0.65rem', color: 'var(--rt-t3)', marginTop: '0.3rem' }}>{fmtDate(book.dateRead)}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Book detail panel ── */}
      {detailBook && (
        <BookDetailPanel
          book={detailBook}
          location={detailLocation || (detailBook.status === 'reading' ? 'mylist-reading' : 'mylist-history')}
          user={user}
          onClose={() => setDetailBook(null)}
          onMarkFinished={() => setDetailBook(null)}
          onEdit={() => setDetailBook(null)}
          onRecommend={() => setDetailBook(null)}
          onStartChat={() => setDetailBook(null)}
          onViewChat={() => setDetailBook(null)}
        />
      )}

      {/* ── Fav books editor ── */}
      {favEditorOpen && (
        <ModalShell onClose={() => setFavEditorOpen(false)} maxWidth={560}>
          <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--rt-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <div>
              <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1rem', fontWeight: 700, color: 'var(--rt-navy)' }}>Choose favourites</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)' }}>Pick up to 10 ({favSelected.length}/10)</div>
            </div>
            <button onClick={() => setFavEditorOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.3rem', color: 'var(--rt-t3)' }}>×</button>
          </div>
          <div style={{ overflowY: 'auto', flex: 1, padding: '0.75rem 1.25rem' }}>
            {read.map(book => {
              const selected = favSelected.includes(book.id)
              return (
                <div key={book.id} onClick={() => toggleFav(book.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0', borderBottom: '1px solid var(--rt-border)', cursor: 'pointer' }}>
                  <div style={{ width: 20, height: 20, borderRadius: 4, border: '2px solid', borderColor: selected ? 'var(--rt-amber)' : 'var(--rt-border-md)', background: selected ? 'var(--rt-amber)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {selected && <span style={{ color: '#fff', fontSize: '0.75rem', fontWeight: 700 }}>✓</span>}
                  </div>
                  <CoverImage coverId={book.coverId} olKey={book.olKey} title={book.title} size="S" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--rt-navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{book.title}</div>
                    {book.author && <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)' }}>{book.author}</div>}
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ padding: '0.85rem 1.25rem', borderTop: '1px solid var(--rt-border)', flexShrink: 0 }}>
            <button className="rt-submit-btn" style={{ width: '100%' }} onClick={handleSaveFavs}>Save favourites</button>
          </div>
        </ModalShell>
      )}
    </div>
  )
}
