import CoverImage from './CoverImage'

const STARS = ['★', '★', '★', '★', '★']

export default function BookCard({ book, onClick, showStatus = false }) {
  const statusLabels = {
    reading: 'Currently Reading',
    tbr: 'To Read',
    read: 'Read',
    dnf: 'DNF'
  }

  return (
    <div
      className="rt-hist-card"
      onClick={() => onClick?.(book)}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <div className="rt-hist-card-inner">
        <CoverImage
          coverId={book.coverId}
          olKey={book.olKey}
          title={book.title}
          size="M"
        />
        <div className="rt-hist-body" style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--rt-font-display)',
            fontSize: '0.95rem',
            fontWeight: 700,
            color: 'var(--rt-navy)',
            marginBottom: '0.15rem',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>{book.title}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--rt-t3)', marginBottom: '0.35rem' }}>
            {book.author}
          </div>
          <div className="rt-hist-meta">
            {book.rating > 0 && (
              <span style={{ color: 'var(--rt-amber)', fontSize: '0.82rem', letterSpacing: '-1px' }}>
                {STARS.slice(0, book.rating).join('')}
              </span>
            )}
            {book.genre && (
              <span className="rt-book-genre">{book.genre}</span>
            )}
            {showStatus && (
              <span style={{
                fontSize: '0.6rem', letterSpacing: '0.08em', textTransform: 'uppercase',
                color: 'var(--rt-t3)', background: 'var(--rt-surface)',
                padding: '0.2em 0.55em', borderRadius: 3
              }}>{statusLabels[book.status] || book.status}</span>
            )}
            {book.dateRead && (
              <span className="rt-book-date">
                {new Date(book.dateRead).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
              </span>
            )}
          </div>
          {book.notes && (
            <div className="rt-hist-notes" style={{ paddingLeft: 0 }}>
              {book.notes.length > 100 ? book.notes.slice(0, 100) + '…' : book.notes}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}