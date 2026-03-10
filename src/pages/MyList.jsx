import { useState } from 'react'
import { useBooksContext } from '../context/BooksContext'
import { useSocialContext } from '../context/SocialContext'
import { useChatContext } from '../context/ChatContext'
import { useAuthContext } from '../context/AuthContext'
import { fmtDate, GENRES, avatarColour, avatarInitial } from '../lib/utils'
import CoverImage from '../components/books/CoverImage'
import { ModalShell, FinishModal } from '../components/books/BookSheet'
import AddBookModal from '../components/books/AddBookModal'
import BookDetailPanel from '../components/books/BookDetailPanel'
import { sb } from '../lib/supabase'

// ─────────────────────────────────────────────────────────────
// STARS (read-only display)
// ─────────────────────────────────────────────────────────────
function StarsDisplay({ value, size = '1.1rem' }) {
  if (!value) return null
  return (
    <span style={{ fontSize: size, color: 'var(--rt-amber)', letterSpacing: '1px' }}>
      {'★'.repeat(value)}{'☆'.repeat(5 - value)}
    </span>
  )
}

// Interactive star widget
function StarPicker({ value, onChange }) {
  const [hover, setHover] = useState(0)
  return (
    <div style={{ display: 'flex', gap: '0.2rem' }}>
      {[1,2,3,4,5].map(n => (
        <button key={n} type="button"
          onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
          onClick={() => onChange(value === n ? 0 : n)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.05rem',
            fontSize: '1.8rem', lineHeight: 1, color: n <= (hover || value) ? 'var(--rt-amber)' : '#ddd', transition: 'color 0.1s' }}
        >★</button>
      ))}
    </div>
  )
}

// Toggle switch
function Toggle({ checked, onChange, label, sub }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.8rem 0.9rem', background: 'var(--rt-cream)', borderRadius: 'var(--rt-r3)', marginBottom: '1rem' }}>
      <div>
        <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.88rem', fontWeight: 700, color: 'var(--rt-navy)' }}>{label}</div>
        {sub && <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)', marginTop: '0.1rem' }}>{sub}</div>}
      </div>
      <div onClick={() => onChange(!checked)} style={{ width: 44, height: 26, borderRadius: 99, background: checked ? 'var(--rt-navy)' : '#d1d5db', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
        <div style={{ position: 'absolute', top: 3, left: checked ? 20 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.18)', transition: 'left 0.2s' }} />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// FRIEND PICKER (shared between Recommend + Chat inline flows)
// ─────────────────────────────────────────────────────────────
function FriendPicker({ friends, selected, onToggle }) {
  if (friends.length === 0) return (
    <p style={{ fontSize: '0.83rem', color: 'var(--rt-t3)', fontStyle: 'italic' }}>Add friends first.</p>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {friends.map(f => {
        const sel = selected.includes(f.userId)
        return (
          <div key={f.userId} onClick={() => onToggle(f.userId)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.65rem 0.85rem', border: `1.5px solid ${sel ? 'var(--rt-navy)' : 'var(--rt-border-md)'}`, borderRadius: 'var(--rt-r3)', cursor: 'pointer', background: sel ? 'rgba(26,39,68,0.03)' : 'transparent', transition: 'border-color 0.15s' }}
          >
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: avatarColour(f.userId), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 700, color: '#fff', flexShrink: 0 }}>{avatarInitial(f.displayName)}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--rt-navy)' }}>{f.displayName}</div>
              {f.username && <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)' }}>@{f.username}</div>}
            </div>
            <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${sel ? 'var(--rt-navy)' : 'var(--rt-border-md)'}`, background: sel ? 'var(--rt-navy)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.65rem', fontWeight: 700, flexShrink: 0 }}>
              {sel && '✓'}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// RECOMMEND MODAL
// ─────────────────────────────────────────────────────────────
function RecommendModal({ book, user, onClose }) {
  const { friends, sendRecommendation } = useSocialContext()
  const [selected, setSelected] = useState([])
  const [note, setNote]         = useState('')
  const [sending, setSending]   = useState(false)
  const [sent, setSent]         = useState(false)
  const [error, setError]       = useState(null)

  function toggle(id) { setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]) }

  async function handleSend() {
    if (!selected.length) { setError('Select at least one friend.'); return }
    setSending(true); setError(null)
    const { error: e } = await sendRecommendation(book, selected, note.trim() || null, user)
    setSending(false)
    if (e) { setError('Could not send — try again.'); return }
    setSent(true)
  }

  return (
    <ModalShell onClose={onClose} maxWidth={500}>
      <div style={{ padding: '1rem 1rem 0', flexShrink: 0 }}>
        <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.15rem' }}>Recommend to friends</div>
        <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1rem', fontWeight: 700, color: 'var(--rt-navy)', marginBottom: '0.85rem' }}>{book.title}</div>
      </div>

      {sent ? (
        <div style={{ padding: '2rem 1.25rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📚</div>
          <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--rt-navy)', marginBottom: '0.4rem' }}>Recommended!</div>
          <div style={{ fontSize: '0.83rem', color: 'var(--rt-t3)', marginBottom: '1.5rem' }}>Your friends will see it in their Discover feed.</div>
          <button onClick={onClose} style={{ background: 'var(--rt-navy)', color: '#fff', border: 'none', borderRadius: 'var(--rt-r3)', padding: '0.75rem 2rem', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer' }}>Done</button>
        </div>
      ) : (
        <>
          <div style={{ overflowY: 'auto', flex: 1, padding: '0 1rem' }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.5rem' }}>Choose friends</div>
            <FriendPicker friends={friends} selected={selected} onToggle={toggle} />
            <div style={{ marginTop: '0.85rem' }}>
              <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.4rem' }}>Add a note <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></div>
              <textarea rows={3} value={note} onChange={e => setNote(e.target.value)}
                placeholder="Why do you think they'd love this?"
                style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid var(--rt-border-md)', borderRadius: 'var(--rt-r3)', padding: '0.65rem 0.8rem', fontFamily: 'var(--rt-font-body)', fontSize: '0.85rem', color: 'var(--rt-navy)', background: 'var(--rt-cream)', resize: 'none', outline: 'none' }}
              />
            </div>
            {error && <p style={{ fontSize: '0.78rem', color: '#991b1b', marginTop: '0.35rem' }}>{error}</p>}
          </div>
          <div style={{ padding: '0.85rem 1rem', borderTop: '1px solid var(--rt-border)', display: 'flex', gap: '0.6rem', flexShrink: 0 }}>
            <button onClick={onClose} style={{ background: 'var(--rt-cream)', border: '1.5px solid var(--rt-border-md)', borderRadius: 'var(--rt-r3)', padding: '0.7rem 1rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--rt-t2)', cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleSend} disabled={sending || !selected.length}
              style={{ flex: 1, background: sending || !selected.length ? 'var(--rt-surface)' : 'var(--rt-navy)', color: sending || !selected.length ? 'var(--rt-t3)' : '#fff', border: 'none', borderRadius: 'var(--rt-r3)', padding: '0.75rem 1rem', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer' }}>
              {sending ? 'Sending…' : 'Send recommendation →'}
            </button>
          </div>
        </>
      )}
    </ModalShell>
  )
}

// ─────────────────────────────────────────────────────────────
// START CHAT MODAL
// ─────────────────────────────────────────────────────────────
function StartChatModal({ book, user, chats, onClose, onNavigateChat }) {
  const { friends }             = useSocialContext()
  const { startOrOpenChat }     = useChatContext()
  const [selected, setSelected] = useState([])
  const [message, setMessage]   = useState('')
  const [starting, setStarting] = useState(false)

  function toggle(id) { setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]) }

  const existingChat = chats?.find(c => c.bookOlKey === book.olKey)

  async function handleStart() {
    setStarting(true)
    await startOrOpenChat(book.olKey, book.title, book.author, book.coverId, selected, message.trim() || null)
    setStarting(false)
    if (onNavigateChat) onNavigateChat()
    onClose()
  }

  return (
    <ModalShell onClose={onClose} maxWidth={500}>
      <div style={{ padding: '1rem 1rem 0', flexShrink: 0 }}>
        <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.15rem' }}>Start a chat about</div>
        <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1rem', fontWeight: 700, color: 'var(--rt-navy)', marginBottom: '0.85rem' }}>{book.title}</div>
      </div>
      <div style={{ overflowY: 'auto', flex: 1, padding: '0 1rem' }}>
        {existingChat ? (
          <div style={{ padding: '1.5rem 0', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>💬</div>
            <div style={{ fontSize: '0.88rem', color: 'var(--rt-t2)' }}>You already have a chat about this book.</div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.5rem' }}>Select friends</div>
            <FriendPicker friends={friends} selected={selected} onToggle={toggle} />
            <div style={{ marginTop: '0.85rem' }}>
              <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.4rem' }}>First message <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></div>
              <textarea rows={2} value={message} onChange={e => setMessage(e.target.value)}
                placeholder="What do you want to say about this book?"
                style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid var(--rt-border-md)', borderRadius: 'var(--rt-r3)', padding: '0.65rem 0.8rem', fontFamily: 'var(--rt-font-body)', fontSize: '0.85rem', color: 'var(--rt-navy)', background: 'var(--rt-cream)', resize: 'none', outline: 'none' }}
              />
            </div>
          </>
        )}
      </div>
      <div style={{ padding: '0.85rem 1rem', borderTop: '1px solid var(--rt-border)', display: 'flex', gap: '0.6rem', flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: 'var(--rt-cream)', border: '1.5px solid var(--rt-border-md)', borderRadius: 'var(--rt-r3)', padding: '0.7rem 1rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--rt-t2)', cursor: 'pointer' }}>Cancel</button>
        {existingChat
          ? <button onClick={() => { if (onNavigateChat) onNavigateChat(); onClose() }} style={{ flex: 1, background: 'var(--rt-navy)', color: '#fff', border: 'none', borderRadius: 'var(--rt-r3)', padding: '0.75rem 1rem', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer' }}>View chat →</button>
          : <button onClick={handleStart} disabled={starting || !selected.length || !book.olKey}
              style={{ flex: 1, background: starting || !selected.length ? 'var(--rt-surface)' : 'var(--rt-navy)', color: starting || !selected.length ? 'var(--rt-t3)' : '#fff', border: 'none', borderRadius: 'var(--rt-r3)', padding: '0.75rem 1rem', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer' }}>
              {starting ? 'Starting…' : '💬 Start chat →'}
            </button>
        }
      </div>
    </ModalShell>
  )
}

// ─────────────────────────────────────────────────────────────
// EDIT BOOK MODAL
// _startMode = true → pre-set to 'reading', simpler form
// Otherwise full form for history/DNF editing
// ─────────────────────────────────────────────────────────────
function EditBookModal({ book, user, onClose, onSaved }) {
  const isStartMode = !!book._startMode
  const [status, setStatus]       = useState(isStartMode ? 'reading' : (book.status || 'read'))
  const [rating, setRating]       = useState(book.rating || 0)
  const [date, setDate]           = useState(book.dateRead || '')
  const [shareReview, setShareReview] = useState(book.reviewPublic || false)
  const [reviewText, setReviewText]   = useState(book.reviewBody || '')
  const [genre, setGenre]         = useState(book.genre || '')
  const [notes, setNotes]         = useState(book.notes || '')
  const [saving, setSaving]       = useState(false)

  const statusOptions = [
    { value: 'tbr',     label: 'Add back to my list' },
    { value: 'reading', label: 'Currently reading' },
    { value: 'read',    label: 'Already finished' },
    { value: 'dnf',     label: 'Did not finish' },
  ]

  const showFullForm = status === 'read' || status === 'dnf'

  async function handleSave() {
    setSaving(true)
    const today = new Date().toISOString().split('T')[0]
    const changes = {
      status,
      dateStarted:  status === 'reading' ? today : undefined,
      rating:       status === 'read' ? (rating || null) : null,
      dateRead:     date || null,
      reviewBody:   (shareReview && reviewText.trim()) ? reviewText.trim() : null,
      reviewPublic: shareReview && !!reviewText.trim(),
      genre:        genre || null,
      notes:        notes.trim() || null,
      updatedAt:    new Date().toISOString(),
    }
    if (user && book.id) {
      const dbPayload = {
        status:           changes.status,
        rating:           changes.rating,
        date_finished:    changes.dateRead,
        review_body:      changes.reviewBody,
        review_is_public: changes.reviewPublic,
        genre:            changes.genre,
        notes:            changes.notes,
        updated_at:       changes.updatedAt,
      }
      if (changes.dateStarted) dbPayload.date_started = changes.dateStarted
      await sb.from('reading_entries').update(dbPayload).eq('id', book.id).eq('user_id', user.id)
    }
    setSaving(false)
    onSaved(changes)
  }

  return (
    <ModalShell onClose={onClose} maxWidth={500}>
      {/* Header */}
      <div style={{ padding: '0.9rem 1rem', borderBottom: '1px solid var(--rt-border)', display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
        {(book.coverId || book.olKey) && (
          <div style={{ width: 38, height: 54, borderRadius: 5, overflow: 'hidden', flexShrink: 0 }}>
            <img src={book.coverId ? `https://covers.openlibrary.org/b/id/${book.coverId}-S.jpg` : `https://covers.openlibrary.org/b/olid/${(book.olKey||'').replace('/works/','')}-S.jpg`}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.9rem', fontWeight: 700, color: 'var(--rt-navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{book.title}</div>
          {book.author && <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)' }}>{book.author}</div>}
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.3rem', color: 'var(--rt-t3)', padding: '0.25rem', flexShrink: 0 }}>×</button>
      </div>

      <div style={{ overflowY: 'auto', flex: 1, padding: '1rem 1rem' }}>
        {/* Status */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.4rem' }}>Change status</div>
          <select value={status} onChange={e => setStatus(e.target.value)}
            style={{ width: '100%', padding: '0.65rem 0.85rem', border: '1.5px solid var(--rt-navy)', borderRadius: 'var(--rt-r3)', fontFamily: 'var(--rt-font-body)', fontSize: '0.88rem', color: 'var(--rt-navy)', background: 'var(--rt-white)', outline: 'none' }}>
            {statusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {showFullForm && (
          <>
            {/* Rating + DNF */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)' }}>Rating</div>
                {status === 'dnf' && (
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, background: 'var(--rt-surface)', border: '1px solid var(--rt-border-md)', borderRadius: 99, padding: '0.15em 0.7em', color: 'var(--rt-t2)' }}>DNF</span>
                )}
              </div>
              {status === 'read' && <StarPicker value={rating} onChange={setRating} />}
            </div>

            {/* Date finished */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.4rem' }}>Date finished</div>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', padding: '0.65rem 0.85rem', border: '1.5px solid var(--rt-border-md)', borderRadius: 'var(--rt-r3)', fontFamily: 'var(--rt-font-body)', fontSize: '0.88rem', color: 'var(--rt-navy)', background: 'var(--rt-cream)', outline: 'none' }}
              />
            </div>

            {/* Share review toggle */}
            <Toggle checked={shareReview} onChange={setShareReview} label="Share a review" sub="Friends can see this and comment" />

            {shareReview && (
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--rt-navy)', marginBottom: '0.4rem' }}>
                  Your review <span style={{ fontWeight: 400, color: 'var(--rt-t3)', textTransform: 'none', letterSpacing: 0 }}>(public)</span>
                </div>
                <textarea rows={4} value={reviewText} onChange={e => setReviewText(e.target.value)}
                  placeholder="Write something others would find useful…"
                  style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid var(--rt-border-md)', borderRadius: 'var(--rt-r3)', padding: '0.65rem 0.85rem', fontFamily: 'var(--rt-font-body)', fontSize: '0.85rem', color: 'var(--rt-navy)', background: 'var(--rt-white)', resize: 'none', outline: 'none' }}
                />
              </div>
            )}

            {/* Private notes divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', margin: '0.75rem 0' }}>
              <div style={{ flex: 1, height: 1, background: 'var(--rt-border)' }} />
              <span style={{ fontSize: '0.68rem', color: 'var(--rt-t3)', whiteSpace: 'nowrap' }}>🔒 Private notes</span>
              <div style={{ flex: 1, height: 1, background: 'var(--rt-border)' }} />
            </div>
          </>
        )}

        {/* Genre */}
        <div style={{ marginBottom: '0.85rem' }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.4rem' }}>Genre</div>
          <select value={genre} onChange={e => setGenre(e.target.value)}
            style={{ width: '100%', padding: '0.65rem 0.85rem', border: '1.5px solid var(--rt-border-md)', borderRadius: 'var(--rt-r3)', fontFamily: 'var(--rt-font-body)', fontSize: '0.85rem', color: 'var(--rt-navy)', background: 'var(--rt-white)', outline: 'none' }}>
            <option value="">— select —</option>
            {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        {/* Private notes */}
        <div>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--rt-navy)', marginBottom: '0.15rem' }}>
            Only you can see this
          </div>
          <textarea rows={4} value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="What did you think?"
            style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid var(--rt-border-md)', borderRadius: 'var(--rt-r3)', padding: '0.65rem 0.85rem', fontFamily: 'var(--rt-font-body)', fontSize: '0.85rem', color: 'var(--rt-navy)', background: 'var(--rt-cream)', resize: 'none', outline: 'none' }}
          />
        </div>
      </div>

      <div style={{ padding: '0.85rem 1rem', borderTop: '1px solid var(--rt-border)', display: 'flex', gap: '0.6rem', flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: 'var(--rt-cream)', border: '1.5px solid var(--rt-border-md)', borderRadius: 'var(--rt-r3)', padding: '0.7rem 1rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--rt-t2)', cursor: 'pointer' }}>← Back</button>
        <button onClick={handleSave} disabled={saving}
          style={{ flex: 1, background: 'var(--rt-navy)', color: '#fff', border: 'none', borderRadius: 'var(--rt-r3)', padding: '0.75rem 1rem', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer' }}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </ModalShell>
  )
}

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────
const TABS = ['to-read', 'history', 'dnf']
const TAB_LABELS = { 'to-read': 'To Read', history: 'History', dnf: 'DNF' }

export default function MyList({ onNavigate }) {
  const { user }                              = useAuthContext()
  const { books, addBook, updateBook, deleteBook } = useBooksContext()
  const { friends }                           = useSocialContext()
  const { chats }                             = useChatContext()

  const [tab, setTab]                 = useState('to-read')
  const [addModal, setAddModal]       = useState(false)
  const [sortHistory, setSortHistory] = useState('date-desc')
  const [showAll, setShowAll]         = useState(false)

  // Which book detail is open (OL info panel)
  const [detailBook, setDetailBook]   = useState(null)
  const [detailLocation, setDetailLocation] = useState(null)

  // Edit modal
  const [editBook, setEditBook]       = useState(null)

  // Finish (mark as read 3-step) flow
  const [finishBook, setFinishBook]   = useState(null)

  // Recommend modal
  const [recBook, setRecBook]         = useState(null)

  // Start chat modal
  const [chatBook, setChatBook]       = useState(null)

  // TBR drag-reorder
  const [dragIdx, setDragIdx]  = useState(null)
  const [overIdx, setOverIdx]  = useState(null)

  const tbr     = books.filter(b => b.status === 'tbr').sort((a, b) => (a.tbrPosition||999) - (b.tbrPosition||999))
  const reading = books.filter(b => b.status === 'reading').sort((a, b) => new Date(b.dateStarted||b.added||0) - new Date(a.dateStarted||a.added||0))
  const history = books.filter(b => b.status === 'read').sort((a, b) => {
    if (sortHistory === 'date-desc') return new Date(b.dateRead||b.added||0) - new Date(a.dateRead||a.added||0)
    if (sortHistory === 'date-asc')  return new Date(a.dateRead||a.added||0) - new Date(b.dateRead||b.added||0)
    if (sortHistory === 'rating')    return (b.rating||0) - (a.rating||0)
    if (sortHistory === 'title')     return (a.title||'').localeCompare(b.title||'')
    return 0
  })
  const dnf = books.filter(b => b.status === 'dnf').sort((a, b) => new Date(b.added||0) - new Date(a.added||0))

  function findExistingChat(olKey) {
    if (!olKey || !chats) return null
    return chats.find(c => c.bookOlKey === olKey) || null
  }

  // TBR drag
  function handleDragStart(i) { setDragIdx(i) }
  function handleDragOver(e, i) { e.preventDefault(); setOverIdx(i) }
  function handleDrop() {
    if (dragIdx === null || overIdx === null || dragIdx === overIdx) { setDragIdx(null); setOverIdx(null); return }
    const reordered = [...tbr]
    const [moved] = reordered.splice(dragIdx, 1)
    reordered.splice(overIdx, 0, moved)
    reordered.forEach((b, i) => updateBook(b.id, { tbrPosition: i }))
    setDragIdx(null); setOverIdx(null)
  }

  const historyVisible = showAll ? history : history.slice(0, 20)

  return (
    <div style={{ padding: '1.5rem', maxWidth: 720, margin: '0 auto' }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
          <h2 style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.6rem', fontWeight: 700, color: 'var(--rt-navy)', margin: 0 }}>My List</h2>
          <button
            onClick={() => setAddModal(true)}
            style={{ flexShrink: 0, background: 'var(--rt-navy)', color: '#fff', border: 'none', borderRadius: 'var(--rt-r3)', padding: '0.55rem 1.1rem', fontFamily: 'var(--rt-font-body)', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >+ Add book</button>
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--rt-t3)' }}>Your reading queue, history, and DNFs — all in one place.</div>
      </div>

      {/* Currently reading strip */}
      {reading.length > 0 && (
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-teal)', marginBottom: '0.5rem' }}>Currently reading</div>
          {reading.map(book => (
            <div key={book.id} className="rt-card"
              style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.5rem', cursor: 'pointer' }}
              onClick={() => { setDetailBook(book); setDetailLocation('mylist-reading') }}
            >
              <CoverImage coverId={book.coverId} olKey={book.olKey} title={book.title} size="S" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="rt-book-title">{book.title}</div>
                {book.author && <div className="rt-book-author">{book.author}</div>}
                {book.dateStarted && <div className="rt-book-date">Started {fmtDate(book.dateStarted)}</div>}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--rt-teal)', fontWeight: 600, flexShrink: 0 }}>reading ›</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Full-width tabs ── */}
      <div style={{ display: 'flex', borderBottom: '2px solid var(--rt-border)', marginBottom: '1.25rem' }}>
        {TABS.map(t => {
          const active = tab === t
          const count = t === 'to-read' ? tbr.length : t === 'history' ? history.length : dnf.length
          return (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, fontFamily: 'var(--rt-font-body)', fontSize: '0.88rem',
              fontWeight: active ? 700 : 500,
              color: active ? 'var(--rt-navy)' : 'var(--rt-t3)',
              background: 'none', border: 'none',
              borderBottom: `2.5px solid ${active ? 'var(--rt-amber)' : 'transparent'}`,
              marginBottom: -2, padding: '0.6rem 0.5rem',
              cursor: 'pointer', transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
            }}>
              {TAB_LABELS[t]}
              {count > 0 && (
                <span style={{ background: active ? 'var(--rt-amber)' : 'var(--rt-surface)', color: active ? '#fff' : 'var(--rt-t3)', borderRadius: 99, fontSize: '0.62rem', fontWeight: 700, padding: '0.1em 0.5em', lineHeight: '1.6', transition: 'all 0.15s' }}>{count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── TO READ ── */}
      {tab === 'to-read' && (
        <div>
          {tbr.length === 0 ? (
            <div className="rt-empty-state">
              <div className="rt-empty-icon">📚</div>
              <p>Your reading list is empty.</p>
            </div>
          ) : (
            tbr.map((book, i) => (
              <div key={book.id} className="rt-tbr-item"
                draggable
                onDragStart={() => handleDragStart(i)}
                onDragOver={e => handleDragOver(e, i)}
                onDrop={handleDrop}
                onDragEnd={() => { setDragIdx(null); setOverIdx(null) }}
                style={{ opacity: dragIdx === i ? 0.4 : 1, outline: overIdx === i && dragIdx !== i ? '2px solid var(--rt-amber)' : 'none' }}
                onClick={() => { setDetailBook(book); setDetailLocation('mylist-tbr') }}
              >
                <div className="rt-tbr-drag-handle" onClick={e => e.stopPropagation()}><span/><span/><span/></div>
                <span className="rt-tbr-num">{i + 1}</span>
                <CoverImage coverId={book.coverId} olKey={book.olKey} title={book.title} size="S" />
                <div className="rt-tbr-item-body">
                  <div className="rt-book-title">{book.title}</div>
                  {book.author && <div className="rt-book-author">{book.author}</div>}
                </div>
                <button className="rt-delete rt-delete--quiet" onClick={e => { e.stopPropagation(); deleteBook(book.id) }}>×</button>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── HISTORY ── */}
      {tab === 'history' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.85rem' }}>
            <select
              value={sortHistory} onChange={e => setSortHistory(e.target.value)}
              style={{ border: '1px solid var(--rt-border-md)', borderRadius: 'var(--rt-r4)', padding: '0.35rem 0.75rem', fontSize: '0.78rem', color: 'var(--rt-t2)', background: 'var(--rt-white)', cursor: 'pointer', outline: 'none' }}
            >
              <option value="date-desc">Newest first</option>
              <option value="date-asc">Oldest first</option>
              <option value="rating">By rating</option>
              <option value="title">By title</option>
            </select>
          </div>

          {history.length === 0 ? (
            <div className="rt-empty-state"><div className="rt-empty-icon">✓</div><p>No finished books yet.</p></div>
          ) : (
            <>
              {historyVisible.map(book => (
                <div key={book.id}
                  style={{ display: 'flex', gap: '0.9rem', alignItems: 'flex-start', padding: '0.85rem 0', borderBottom: '1px solid var(--rt-border)', cursor: 'pointer', position: 'relative' }}
                  onClick={() => { setDetailBook(book); setDetailLocation('mylist-history') }}
                >
                  <CoverImage coverId={book.coverId} olKey={book.olKey} title={book.title} size="M" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="rt-book-title">{book.title}</div>
                    {book.author && <div className="rt-book-author" style={{ marginBottom: '0.3rem' }}>{book.author}</div>}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: book.reviewBody ? '0.35rem' : 0 }}>
                      {book.rating > 0 && <StarsDisplay value={book.rating} size="0.9rem" />}
                      {book.dateRead && <span style={{ fontSize: '0.68rem', color: 'var(--rt-t3)' }}>{fmtDate(book.dateRead)}</span>}
                    </div>
                    {book.reviewBody && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--rt-t2)', lineHeight: 1.5, fontStyle: 'italic' }}>
                        "{book.reviewBody.slice(0, 120)}{book.reviewBody.length > 120 ? '…' : ''}"
                      </div>
                    )}
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); deleteBook(book.id) }}
                    style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--rt-t3)', fontSize: '1rem', opacity: 0.5, padding: '0.2rem 0.3rem', alignSelf: 'flex-start' }}
                  >×</button>
                </div>
              ))}
              {history.length > 20 && !showAll && (
                <div style={{ textAlign: 'center', marginTop: '0.75rem' }}>
                  <button className="rt-show-more-btn" onClick={() => setShowAll(true)}>Show all {history.length} books</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── DNF ── */}
      {tab === 'dnf' && (
        <div>
          {dnf.length === 0 ? (
            <div className="rt-empty-state"><div className="rt-empty-icon">🚫</div><p>No DNF books yet.</p></div>
          ) : (
            dnf.map(book => (
              <div key={book.id}
                style={{ display: 'flex', gap: '0.9rem', alignItems: 'center', padding: '0.7rem 0', borderBottom: '1px solid var(--rt-border)', cursor: 'pointer', opacity: 0.75, position: 'relative' }}
                onClick={() => { setDetailBook(book); setDetailLocation('mylist-dnf') }}
              >
                <CoverImage coverId={book.coverId} olKey={book.olKey} title={book.title} size="S" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <div className="rt-book-title">{book.title}</div>
                    <span className="rt-dnf-label">DNF</span>
                  </div>
                  {book.author && <div className="rt-book-author">{book.author}</div>}
                </div>
                <button onClick={e => { e.stopPropagation(); deleteBook(book.id) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--rt-t3)', fontSize: '1rem', opacity: 0.5 }}>×</button>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── BookDetailPanel (OL info + context actions) ── */}
      {detailBook && (
        <BookDetailPanel
          book={detailBook}
          location={detailLocation}
          user={user}
          existingChatId={findExistingChat(detailBook.olKey)?.id}
          onClose={() => setDetailBook(null)}
          onMarkFinished={() => { setFinishBook(detailBook); setDetailBook(null) }}
          onStartReading={() => { setEditBook({ ...detailBook, _startMode: true }); setDetailBook(null) }}
          onEdit={() => { setEditBook(detailBook); setDetailBook(null) }}
          onRecommend={() => { setRecBook(detailBook); setDetailBook(null) }}
          onStartChat={() => { setChatBook(detailBook); setDetailBook(null) }}
          onViewChat={() => { onNavigate('chat'); setDetailBook(null) }}
          onAddToTBR={() => { addBook({ title: detailBook.title, author: detailBook.author, status: 'tbr', olKey: detailBook.olKey, coverId: detailBook.coverId }); setDetailBook(null) }}
        />
      )}

      {/* ── Finish flow (3-step) ── */}
      {finishBook && (
        <FinishModal
          book={finishBook}
          user={user}
          onClose={() => setFinishBook(null)}
          onSaved={changes => { updateBook(finishBook.id, changes); setFinishBook(null) }}
        />
      )}

      {/* ── Edit modal ── */}
      {editBook && (
        <EditBookModal
          book={editBook}
          user={user}
          onClose={() => setEditBook(null)}
          onSaved={changes => { updateBook(editBook.id, changes); setEditBook(null) }}
        />
      )}

      {/* ── Recommend modal ── */}
      {recBook && (
        <RecommendModal
          book={recBook}
          user={user}
          onClose={() => setRecBook(null)}
        />
      )}

      {/* ── Start chat modal ── */}
      {chatBook && (
        <StartChatModal
          book={chatBook}
          user={user}
          chats={chats}
          onClose={() => setChatBook(null)}
          onNavigateChat={() => onNavigate('chat')}
        />
      )}

      {/* ── Add book modal ── */}
      {addModal && (
        <AddBookModal
          defaultStatus="tbr"
          books={books}
          onAdd={async d => { await addBook(d); setAddModal(false) }}
          onClose={() => setAddModal(false)}
          user={user}
        />
      )}
    </div>
  )
}
