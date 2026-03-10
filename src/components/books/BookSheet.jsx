import { useState } from 'react'
import { sb } from '../../lib/supabase'
import { fmtDate, GENRES, avatarColour, avatarInitial } from '../../lib/utils'
import { useSocialContext } from '../../context/SocialContext'
import { useChatContext } from '../../context/ChatContext'
import CoverImage from './CoverImage'

// ─────────────────────────────────────────────────────────────
// MODAL SHELL
// Mobile:  slides up from the bottom with spring transition
// Desktop: fades + scales in as a centred dialog
// Used by every modal in the app — import from here.
// ─────────────────────────────────────────────────────────────
export function ModalShell({ onClose, children, maxWidth = 540 }) {
  return (
    <>
      <style>{`
        /* Backdrop */
        .rt-ms-backdrop {
          position: fixed; inset: 0;
          background: rgba(10,15,30,0.55);
          z-index: 400;
          display: flex; align-items: flex-end; justify-content: center;
        }
        /* Sheet */
        .rt-ms-sheet {
          background: var(--rt-white);
          border-radius: 20px 20px 0 0;
          width: 100%; max-width: ${maxWidth}px;
          max-height: 92vh; overflow: hidden;
          display: flex; flex-direction: column;
        }
        /* Drag handle — mobile only */
        .rt-ms-handle {
          width: 36px; height: 4px; border-radius: 99px;
          background: var(--rt-cream-md);
          margin: 10px auto 0; flex-shrink: 0;
        }
        @media (min-width: 640px) {
          .rt-ms-backdrop {
            align-items: center;
          }
          .rt-ms-sheet {
            border-radius: 16px;
            max-height: 90vh;
            box-shadow: 0 24px 80px rgba(10,15,30,0.28);
          }
          .rt-ms-handle { display: none; }
        }
      `}</style>
      <div
        className="rt-ms-backdrop"
        onClick={e => { if (e.target === e.currentTarget) onClose() }}
      >
        <div className="rt-ms-sheet" onClick={e => e.stopPropagation()}>
          <div className="rt-ms-handle" />
          {children}
        </div>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────
// SHARED SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────

// Mini compact header strip (book cover + title + author + ×)
function SheetHeader({ book, onClose, stepBar }) {
  return (
    <div style={{
      padding: '0.85rem 1rem 0',
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        {/* Cover */}
        <div style={{
          width: 44, height: 64, borderRadius: 6, overflow: 'hidden',
          flexShrink: 0, background: 'var(--rt-surface)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
        }}>
          {(book.coverId || book.olKey)
            ? <img
                src={book.coverId
                  ? `https://covers.openlibrary.org/b/id/${book.coverId}-S.jpg`
                  : `https://covers.openlibrary.org/b/olid/${(book.olKey||'').replace('/works/','')}-S.jpg`}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                alt=""
                onError={e => e.target.style.display='none'}
              />
            : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>📖</div>
          }
        </div>
        {/* Title / author */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--rt-font-display)', fontSize: '0.9rem',
            fontWeight: 700, color: 'var(--rt-navy)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{book.title}</div>
          {book.author && (
            <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)', marginTop: '0.1rem' }}>
              {book.author}
            </div>
          )}
        </div>
        {/* Close */}
        <button
          onClick={onClose}
          style={{
            width: 26, height: 26, borderRadius: '50%',
            background: 'var(--rt-surface)', border: 'none',
            cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: '0.9rem', color: 'var(--rt-t3)',
            flexShrink: 0,
          }}
        >×</button>
      </div>
      {/* Step progress bar */}
      {stepBar}
    </div>
  )
}

// Segmented progress bar matching screenshots
function StepBar({ steps, current }) {
  return (
    <div style={{ display: 'flex', gap: '3px', marginTop: '0.9rem', marginBottom: 0 }}>
      {steps.map((label, i) => (
        <div key={i} style={{ flex: 1, position: 'relative' }}>
          <div style={{
            height: 3, borderRadius: 99,
            background: i < current ? 'var(--rt-amber-lt)' : i === current ? 'var(--rt-navy)' : 'var(--rt-border-md)',
            transition: 'background 0.25s',
          }} />
        </div>
      ))}
      <div style={{
        position: 'absolute', right: 0, top: 0,
        fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em',
        textTransform: 'uppercase', color: 'var(--rt-t3)',
        marginTop: '0.2rem',
      }}>
        {/* step label is shown in each step's own heading */}
      </div>
    </div>
  )
}

// Stars widget
function Stars({ value, onChange, size = '2rem' }) {
  const [hover, setHover] = useState(0)
  return (
    <div style={{ display: 'flex', gap: '0.25rem' }}>
      {[1,2,3,4,5].map(n => (
        <button key={n} type="button"
          onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
          onClick={() => onChange(value === n ? 0 : n)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '0.05rem',
            fontSize: size, lineHeight: 1,
            color: n <= (hover || value) ? 'var(--rt-amber)' : '#ddd',
            transition: 'color 0.1s',
          }}
        >★</button>
      ))}
    </div>
  )
}

// Toggle switch matching screenshot 3/4
function ToggleSwitch({ checked, onChange, label, sub }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0.85rem 1rem',
      background: 'var(--rt-cream)', borderRadius: 'var(--rt-r3)',
      marginBottom: '1.1rem',
    }}>
      <div>
        <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.88rem', fontWeight: 700, color: 'var(--rt-navy)' }}>{label}</div>
        {sub && <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)', marginTop: '0.1rem' }}>{sub}</div>}
      </div>
      {/* iOS-style toggle */}
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: 44, height: 26, borderRadius: 99,
          background: checked ? 'var(--rt-navy)' : '#d1d5db',
          position: 'relative', cursor: 'pointer',
          transition: 'background 0.2s', flexShrink: 0,
        }}
      >
        <div style={{
          position: 'absolute', top: 3,
          left: checked ? 20 : 3,
          width: 20, height: 20, borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
          transition: 'left 0.2s',
        }} />
      </div>
    </div>
  )
}

// Friend row used in Recommend + Chat pickers
function FriendRow({ friend, selected, onToggle }) {
  const colour = avatarColour(friend.userId)
  return (
    <div
      onClick={() => onToggle(friend.userId)}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.75rem',
        padding: '0.75rem 0.85rem',
        border: `1.5px solid ${selected ? 'var(--rt-navy)' : 'var(--rt-border-md)'}`,
        borderRadius: 'var(--rt-r3)', cursor: 'pointer',
        background: selected ? 'rgba(26,39,68,0.03)' : 'var(--rt-white)',
        marginBottom: '0.5rem',
        transition: 'border-color 0.15s',
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        background: colour,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '0.9rem', fontWeight: 700, color: '#fff', flexShrink: 0,
      }}>{avatarInitial(friend.displayName)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--rt-navy)' }}>{friend.displayName}</div>
        {friend.username && <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)' }}>@{friend.username}</div>}
      </div>
      {/* Circle checkbox */}
      <div style={{
        width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
        border: `2px solid ${selected ? 'var(--rt-navy)' : 'var(--rt-border-md)'}`,
        background: selected ? 'var(--rt-navy)' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: '0.65rem', fontWeight: 700,
        transition: 'all 0.15s',
      }}>
        {selected && '✓'}
      </div>
    </div>
  )
}

// Standard footer buttons
function SheetFooter({ left, right }) {
  return (
    <div style={{
      padding: '0.85rem 1rem',
      borderTop: '1px solid var(--rt-border)',
      display: 'flex', gap: '0.6rem',
      flexShrink: 0,
    }}>
      {left}
      {right}
    </div>
  )
}

function GhostBtn({ onClick, children }) {
  return (
    <button onClick={onClick} style={{
      background: 'var(--rt-cream)', border: '1.5px solid var(--rt-border-md)',
      borderRadius: 'var(--rt-r3)', padding: '0.7rem 1rem',
      fontFamily: 'var(--rt-font-body)', fontSize: '0.85rem', fontWeight: 600,
      color: 'var(--rt-t2)', cursor: 'pointer', whiteSpace: 'nowrap',
    }}>{children}</button>
  )
}

function PrimaryBtn({ onClick, disabled, children, style = {} }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      flex: 1, background: disabled ? 'var(--rt-surface)' : 'var(--rt-navy)',
      border: 'none', borderRadius: 'var(--rt-r3)',
      padding: '0.75rem 1rem',
      fontFamily: 'var(--rt-font-body)', fontSize: '0.88rem', fontWeight: 700,
      color: disabled ? 'var(--rt-t3)' : '#fff',
      cursor: disabled ? 'default' : 'pointer',
      transition: 'background 0.15s', textAlign: 'center',
      ...style,
    }}>{children}</button>
  )
}

function AmberBtn({ onClick, disabled, children }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      flex: 1, background: 'var(--rt-amber-lt)',
      border: 'none', borderRadius: 'var(--rt-r3)',
      padding: '0.75rem 1rem',
      fontFamily: 'var(--rt-font-body)', fontSize: '0.88rem', fontWeight: 700,
      color: '#fff', cursor: 'pointer', textAlign: 'center',
    }}>{children}</button>
  )
}

// ─────────────────────────────────────────────────────────────
// FINISH WORKFLOW — 3 steps embedded in one ModalShell
// step 0 = Rate  |  step 1 = Write  |  step 2 = Done
// From step 2: recommend (step 3) or chat (step 4), both return to step 2
// ─────────────────────────────────────────────────────────────
const FINISH_STEPS = ['RATE IT', 'WRITE', 'DONE']

export function FinishModal({ book, user, onClose, onSaved }) {
  const { friends, sendRecommendation } = useSocialContext()
  const { chats, startOrOpenChat }      = useChatContext()

  const [step, setStep]         = useState(0)
  const [rating, setRating]     = useState(0)
  const [isDnf, setIsDnf]       = useState(false)
  const [date, setDate]         = useState(new Date().toISOString().split('T')[0])
  const [genre, setGenre]       = useState(book.genre || '')
  const [shareReview, setShareReview] = useState(false)
  const [reviewText, setReviewText]   = useState('')
  const [privateNotes, setPrivateNotes] = useState('')
  const [committed, setCommitted] = useState(null)

  // sub-step: 'none' | 'recommend' | 'chat'
  const [subStep, setSubStep] = useState('none')
  // recommend state
  const [recSelected, setRecSelected] = useState([])
  const [recNote, setRecNote]         = useState('')
  const [recSending, setRecSending]   = useState(false)
  const [recError, setRecError]       = useState(null)
  // chat state
  const [chatSelected, setChatSelected] = useState([])
  const [chatMsg, setChatMsg]           = useState('')
  const [chatStarting, setChatStarting] = useState(false)

  function toggleRec(id)  { setRecSelected(p => p.includes(id) ? p.filter(x=>x!==id) : [...p,id]) }
  function toggleChat(id) { setChatSelected(p => p.includes(id) ? p.filter(x=>x!==id) : [...p,id]) }

  async function commitBook() {
    const status = isDnf ? 'dnf' : 'read'
    const changes = {
      status,
      dateRead:     date,
      rating:       status === 'read' ? (rating || null) : null,
      notes:        privateNotes.trim() || null,
      reviewBody:   (shareReview && reviewText.trim()) ? reviewText.trim() : null,
      reviewPublic: shareReview && !!reviewText.trim(),
      genre:        genre || book.genre || null,
      updatedAt:    new Date().toISOString(),
    }
    setCommitted(changes)
    // Write to cloud
    if (user && book.id) {
      await sb.from('reading_entries').update({
        status:           changes.status,
        rating:           changes.rating,
        date_finished:    changes.dateRead,
        notes:            changes.notes,
        review_body:      changes.reviewBody,
        review_is_public: changes.reviewPublic,
        genre:            changes.genre,
        updated_at:       changes.updatedAt,
      }).eq('id', book.id).eq('user_id', user.id)
    }
    onSaved(changes)   // moves book to history in local state
    setStep(2)
  }

  async function handleSendRec() {
    if (!recSelected.length) { setRecError('Select at least one friend.'); return }
    setRecSending(true); setRecError(null)
    const { error } = await sendRecommendation(book, recSelected, recNote.trim() || null, user)
    setRecSending(false)
    if (error) { setRecError('Could not send — try again.'); return }
    setSubStep('none')   // back to done slide after sending
  }

  async function handleStartChat() {
    if (!chatSelected.length || !book.olKey) return
    setChatStarting(true)
    await startOrOpenChat(book.olKey, book.title, book.author, book.coverId, chatSelected, chatMsg.trim() || null)
    setChatStarting(false)
    setSubStep('none')   // back to done slide
  }

  // ── Recommend sub-step ──
  if (subStep === 'recommend') {
    return (
      <ModalShell onClose={onClose} maxWidth={520}>
        <SheetHeader book={book} onClose={onClose}
          stepBar={<StepBar steps={FINISH_STEPS} current={3} />}
        />
        <div style={{ padding: '1.1rem 1rem 0', flexShrink: 0 }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.15rem' }}>Recommend to friends</div>
          <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1rem', fontWeight: 700, color: 'var(--rt-navy)', marginBottom: '0.85rem' }}>{book.title}</div>
        </div>
        <div style={{ overflowY: 'auto', flex: 1, padding: '0 1rem' }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.5rem' }}>Choose friends</div>
          {friends.length === 0
            ? <p style={{ fontSize: '0.83rem', color: 'var(--rt-t3)', fontStyle: 'italic' }}>Add friends first to recommend books.</p>
            : friends.map(f => <FriendRow key={f.userId} friend={f} selected={recSelected.includes(f.userId)} onToggle={toggleRec} />)
          }
          <div style={{ marginTop: '0.85rem' }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.4rem' }}>Add a note <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></div>
            <textarea
              rows={3} value={recNote} onChange={e => setRecNote(e.target.value)}
              placeholder="Why do you think they'd love this?"
              style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid var(--rt-border-md)', borderRadius: 'var(--rt-r3)', padding: '0.65rem 0.8rem', fontFamily: 'var(--rt-font-body)', fontSize: '0.85rem', color: 'var(--rt-navy)', background: 'var(--rt-cream)', resize: 'none', outline: 'none' }}
            />
          </div>
          {recError && <p style={{ fontSize: '0.78rem', color: '#991b1b', marginTop: '0.35rem' }}>{recError}</p>}
        </div>
        <SheetFooter
          left={<GhostBtn onClick={() => setSubStep('none')}>Cancel</GhostBtn>}
          right={<PrimaryBtn onClick={handleSendRec} disabled={recSending || !recSelected.length}>{recSending ? 'Sending…' : 'Send recommendation →'}</PrimaryBtn>}
        />
      </ModalShell>
    )
  }

  // ── Chat sub-step ──
  if (subStep === 'chat') {
    return (
      <ModalShell onClose={onClose} maxWidth={520}>
        <SheetHeader book={book} onClose={onClose}
          stepBar={<StepBar steps={FINISH_STEPS} current={3} />}
        />
        <div style={{ padding: '1.1rem 1rem 0', flexShrink: 0 }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.15rem' }}>Start a chat about</div>
          <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1rem', fontWeight: 700, color: 'var(--rt-navy)', marginBottom: '0.85rem' }}>{book.title}</div>
        </div>
        <div style={{ overflowY: 'auto', flex: 1, padding: '0 1rem' }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.5rem' }}>Select friends to add</div>
          {friends.length === 0
            ? <p style={{ fontSize: '0.83rem', color: 'var(--rt-t3)', fontStyle: 'italic' }}>Add friends first to start a chat.</p>
            : friends.map(f => <FriendRow key={f.userId} friend={f} selected={chatSelected.includes(f.userId)} onToggle={toggleChat} />)
          }
          <div style={{ marginTop: '0.85rem' }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.4rem' }}>First message <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></div>
            <textarea
              rows={2} value={chatMsg} onChange={e => setChatMsg(e.target.value)}
              placeholder="What do you want to say about this book?"
              style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid var(--rt-border-md)', borderRadius: 'var(--rt-r3)', padding: '0.65rem 0.8rem', fontFamily: 'var(--rt-font-body)', fontSize: '0.85rem', color: 'var(--rt-navy)', background: 'var(--rt-cream)', resize: 'none', outline: 'none' }}
            />
          </div>
        </div>
        <SheetFooter
          left={<GhostBtn onClick={() => setSubStep('none')}>Cancel</GhostBtn>}
          right={<PrimaryBtn onClick={handleStartChat} disabled={chatStarting || !chatSelected.length || !book.olKey}>{chatStarting ? 'Starting…' : '💬 Start chat →'}</PrimaryBtn>}
        />
      </ModalShell>
    )
  }

  // ── Step 0 — Rate it ──
  if (step === 0) {
    return (
      <ModalShell onClose={onClose} maxWidth={520}>
        <SheetHeader book={book} onClose={onClose}
          stepBar={<StepBar steps={FINISH_STEPS} current={0} />}
        />
        <div style={{ overflowY: 'auto', flex: 1, padding: '1.25rem 1rem' }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '1rem' }}>RATE IT</div>

          {/* Stars */}
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.6rem' }}>How many stars?</div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Stars value={rating} onChange={setRating} size="2.4rem" />
            </div>
          </div>

          {/* DNF pill */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.25rem' }}>
            <button
              onClick={() => setIsDnf(p => !p)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                background: isDnf ? 'var(--rt-navy)' : 'var(--rt-cream)',
                border: `1.5px solid ${isDnf ? 'var(--rt-navy)' : 'var(--rt-border-md)'}`,
                borderRadius: 99, padding: '0.3rem 0.85rem',
                fontSize: '0.75rem', fontWeight: 700,
                color: isDnf ? '#fff' : 'var(--rt-t2)',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: isDnf ? '#fff' : 'var(--rt-t3)',
              }} />
              DNF
            </button>
          </div>

          {/* Date */}
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.5rem' }}>Date finished</div>
            <input
              type="date" value={date} onChange={e => setDate(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', padding: '0.7rem 0.85rem', border: '1.5px solid var(--rt-border-md)', borderRadius: 'var(--rt-r3)', fontFamily: 'var(--rt-font-body)', fontSize: '0.88rem', color: 'var(--rt-navy)', background: 'var(--rt-cream)', outline: 'none' }}
            />
          </div>
        </div>
        <SheetFooter
          left={<GhostBtn onClick={onClose}>Cancel</GhostBtn>}
          right={<PrimaryBtn onClick={() => isDnf ? commitBook() : setStep(1)}>{isDnf ? 'Mark as DNF' : 'Next →'}</PrimaryBtn>}
        />
      </ModalShell>
    )
  }

  // ── Step 1 — Write ──
  if (step === 1) {
    return (
      <ModalShell onClose={onClose} maxWidth={520}>
        <SheetHeader book={book} onClose={onClose}
          stepBar={<StepBar steps={FINISH_STEPS} current={1} />}
        />
        <div style={{ overflowY: 'auto', flex: 1, padding: '1.25rem 1rem' }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.85rem' }}>WRITE</div>

          {/* Share a review toggle */}
          <ToggleSwitch
            checked={shareReview}
            onChange={setShareReview}
            label="Share a review"
            sub="Friends can see this and comment"
          />

          {/* Public review textarea — only when toggled on */}
          {shareReview && (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--rt-navy)', marginBottom: '0.4rem' }}>
                Your review <span style={{ fontWeight: 400, color: 'var(--rt-t3)' }}>(public)</span>
              </div>
              <textarea
                rows={4} value={reviewText} onChange={e => setReviewText(e.target.value)}
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

          {/* Genre */}
          <div style={{ marginBottom: '0.85rem' }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.4rem' }}>Genre</div>
            <select
              value={genre} onChange={e => setGenre(e.target.value)}
              style={{ width: '100%', padding: '0.65rem 0.85rem', border: '1.5px solid var(--rt-border-md)', borderRadius: 'var(--rt-r3)', fontFamily: 'var(--rt-font-body)', fontSize: '0.85rem', color: 'var(--rt-navy)', background: 'var(--rt-white)', outline: 'none' }}
            >
              <option value="">— none —</option>
              {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          {/* Private notes textarea */}
          <div>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--rt-navy)', marginBottom: '0.15rem' }}>
              Only you can see this
              <span style={{ fontWeight: 400, color: 'var(--rt-t3)', textTransform: 'none', letterSpacing: 0 }}> — helps Claude recommend books</span>
            </div>
            <textarea
              rows={4} value={privateNotes} onChange={e => setPrivateNotes(e.target.value)}
              placeholder="What did you think? Even a few words helps…"
              style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid var(--rt-border-md)', borderRadius: 'var(--rt-r3)', padding: '0.65rem 0.85rem', fontFamily: 'var(--rt-font-body)', fontSize: '0.85rem', color: 'var(--rt-navy)', background: 'var(--rt-cream)', resize: 'none', outline: 'none' }}
            />
          </div>
        </div>
        <SheetFooter
          left={<GhostBtn onClick={() => setStep(0)}>← Back</GhostBtn>}
          right={<PrimaryBtn onClick={commitBook}>Save →</PrimaryBtn>}
        />
      </ModalShell>
    )
  }

  // ── Step 2 — Done ──
  return (
    <ModalShell onClose={onClose} maxWidth={520}>
      <SheetHeader book={book} onClose={onClose}
        stepBar={<StepBar steps={FINISH_STEPS} current={2} />}
      />
      <div style={{ overflowY: 'auto', flex: 1, padding: '1.5rem 1rem', textAlign: 'center' }}>
        {/* Done label */}
        <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '1.25rem' }}>DONE</div>

        {/* Cover with tick badge */}
        <div style={{ position: 'relative', display: 'inline-block', marginBottom: '0.85rem' }}>
          {(book.coverId || book.olKey) ? (
            <img
              src={book.coverId
                ? `https://covers.openlibrary.org/b/id/${book.coverId}-M.jpg`
                : `https://covers.openlibrary.org/b/olid/${(book.olKey||'').replace('/works/','')}-M.jpg`}
              style={{ width: 96, height: 140, borderRadius: 8, objectFit: 'cover', boxShadow: '0 4px 20px rgba(0,0,0,0.18)' }}
              alt=""
            />
          ) : (
            <div style={{ width: 96, height: 140, borderRadius: 8, background: 'var(--rt-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem' }}>📖</div>
          )}
          {/* Green tick */}
          <div style={{
            position: 'absolute', bottom: -8, right: -8,
            width: 28, height: 28, borderRadius: '50%',
            background: '#22c55e', border: '2px solid #fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: '0.85rem', fontWeight: 700,
          }}>✓</div>
        </div>

        {/* Title + stars */}
        <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--rt-navy)', marginBottom: '0.35rem' }}>
          {book.title}
        </div>
        {(committed?.rating || 0) > 0 && (
          <div style={{ fontSize: '1.25rem', color: 'var(--rt-amber)', letterSpacing: '1px', marginBottom: '0.35rem' }}>
            {'★'.repeat(committed.rating)}{'☆'.repeat(5 - committed.rating)}
          </div>
        )}
        <div style={{ fontSize: '0.82rem', color: 'var(--rt-t3)', marginBottom: '1.5rem' }}>
          {committed?.status === 'dnf' ? 'Marked as DNF — logged to history.' : 'Logged to your reading history.'}
        </div>

        {/* Action buttons — Recommend + Start a chat */}
        <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <AmberBtn onClick={() => setSubStep('recommend')}>
            📚 Recommend to a friend
          </AmberBtn>
          {book.olKey && (
            <button
              onClick={() => setSubStep('chat')}
              style={{
                flex: 1, background: 'var(--rt-cream)',
                border: '1.5px solid var(--rt-border-md)',
                borderRadius: 'var(--rt-r3)', padding: '0.75rem 1rem',
                fontFamily: 'var(--rt-font-body)', fontSize: '0.88rem', fontWeight: 700,
                color: 'var(--rt-t2)', cursor: 'pointer',
              }}
            >
              💬 Start a chat
            </button>
          )}
        </div>

        {/* Close text link */}
        <button
          onClick={onClose}
          style={{ display: 'block', margin: '1.1rem auto 0', background: 'none', border: 'none', fontSize: '0.82rem', color: 'var(--rt-t3)', cursor: 'pointer', textDecoration: 'underline' }}
        >Close</button>
      </div>

      {/* Done button at bottom */}
      <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--rt-border)', flexShrink: 0 }}>
        <PrimaryBtn onClick={onClose}>Done</PrimaryBtn>
      </div>
    </ModalShell>
  )
}

// ─────────────────────────────────────────────────────────────
// BOOKSHEET — view / edit sheet for existing books
// (opened from My List / history — not the finish workflow)
// ─────────────────────────────────────────────────────────────
export default function BookSheet({ book, onClose, onSaved, onDeleted, user }) {
  const [mode, setMode]         = useState('view')
  const [rating, setRating]     = useState(book.rating || 0)
  const [status, setStatus]     = useState(book.status)
  const [date, setDate]         = useState(book.dateRead || '')
  const [notes, setNotes]       = useState(book.notes || '')
  const [review, setReview]     = useState(book.reviewBody || '')
  const [isPublic, setIsPublic] = useState(book.reviewPublic || false)
  const [genre, setGenre]       = useState(book.genre || '')

  const isRead = book.status === 'read' || book.status === 'dnf'
  const stars  = book.rating ? '★'.repeat(book.rating) + '☆'.repeat(5 - book.rating) : ''

  async function handleSave() {
    const changes = {
      status,
      rating:       status === 'read' ? (rating || null) : null,
      dateRead:     date || null,
      notes:        notes.trim() || null,
      reviewBody:   (isPublic && review.trim()) ? review.trim() : null,
      reviewPublic: isPublic && !!review.trim(),
      genre:        genre || null,
      updatedAt:    new Date().toISOString(),
    }
    if (user && book.id) {
      await sb.from('reading_entries').update({
        status:           changes.status,
        rating:           changes.rating,
        date_finished:    changes.dateRead,
        notes:            changes.notes,
        review_body:      changes.reviewBody,
        review_is_public: changes.reviewPublic,
        genre:            changes.genre,
        updated_at:       changes.updatedAt,
      }).eq('id', book.id).eq('user_id', user.id)
    }
    onSaved(changes)
  }

  const modeSubtitle = {
    view:  book.status === 'reading' ? 'Currently reading' : book.status === 'tbr' ? 'To Read' : 'Reading history',
    edit:  'Edit book',
  }[mode] || 'Book'

  return (
    <ModalShell onClose={onClose} maxWidth={520}>
      {/* Header */}
      <div style={{ padding: '1rem 1rem 0.85rem', borderBottom: '1px solid var(--rt-border)', display: 'flex', gap: '0.85rem', alignItems: 'center', flexShrink: 0 }}>
        {(book.coverId || book.olKey) && (
          <div style={{ width: 40, height: 58, borderRadius: 5, overflow: 'hidden', flexShrink: 0 }}>
            <img src={book.coverId ? `https://covers.openlibrary.org/b/id/${book.coverId}-S.jpg` : `https://covers.openlibrary.org/b/olid/${(book.olKey||'').replace('/works/','')}-S.jpg`}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.1rem' }}>{modeSubtitle}</div>
          <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.92rem', fontWeight: 700, color: 'var(--rt-navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{book.title}</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.3rem', color: 'var(--rt-t3)', padding: '0.25rem', flexShrink: 0, lineHeight: 1 }}>×</button>
      </div>

      <div style={{ overflowY: 'auto', flex: 1, padding: '1.1rem 1rem' }}>

        {/* ── View mode ── */}
        {mode === 'view' && (
          <div>
            {stars
              ? <div style={{ fontSize: '1.4rem', color: 'var(--rt-amber)', letterSpacing: 2, marginBottom: '0.5rem' }}>{stars}</div>
              : <div style={{ fontSize: '0.82rem', color: 'var(--rt-t3)', marginBottom: '0.5rem' }}>No rating yet</div>
            }
            {book.dateRead && <div style={{ fontSize: '0.75rem', color: 'var(--rt-t3)', marginBottom: '0.75rem' }}>Finished {fmtDate(book.dateRead)}</div>}
            {book.notes && (
              <div style={{ marginBottom: '0.75rem' }}>
                <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.3rem' }}>Private notes</div>
                <div style={{ fontSize: '0.86rem', color: 'var(--rt-t2)', lineHeight: 1.55 }}>{book.notes}</div>
              </div>
            )}
            {book.reviewBody && (
              <div style={{ marginBottom: '0.75rem' }}>
                <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.3rem' }}>Review (public)</div>
                <div style={{ fontSize: '0.86rem', color: 'var(--rt-t2)', lineHeight: 1.55 }}>{book.reviewBody}</div>
              </div>
            )}
            {!stars && !book.notes && !book.reviewBody && (
              <div style={{ color: 'var(--rt-t3)', fontSize: '0.83rem', padding: '0.5rem 0 0.75rem' }}>No notes yet.</div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', paddingTop: '0.5rem' }}>
              <button className="rt-ghost-btn" onClick={() => setMode('edit')}>Edit</button>
              <button style={{ background: 'none', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 'var(--rt-r3)', padding: '0.5rem 0.8rem', fontSize: '0.8rem', cursor: 'pointer' }}
                onClick={() => { if (window.confirm(`Remove "${book.title}"?`)) onDeleted() }}>
                Delete
              </button>
            </div>
          </div>
        )}

        {/* ── Edit mode ── */}
        {mode === 'edit' && (
          <div>
            <div style={{ marginBottom: '1rem' }}>
              <label className="rt-field-label">Status</label>
              <select className="rt-input" value={status} onChange={e => setStatus(e.target.value)}>
                <option value="tbr">To Read</option>
                <option value="reading">Currently Reading</option>
                <option value="read">Read</option>
                <option value="dnf">DNF</option>
              </select>
            </div>
            {(status === 'read' || status === 'dnf') && (
              <>
                <div style={{ marginBottom: '1rem' }}>
                  <label className="rt-field-label">Date finished</label>
                  <input type="date" className="rt-input" value={date} onChange={e => setDate(e.target.value)} />
                </div>
                {status === 'read' && (
                  <div style={{ marginBottom: '1rem' }}>
                    <label className="rt-field-label">Rating</label>
                    <Stars value={rating} onChange={setRating} />
                  </div>
                )}
              </>
            )}
            <div style={{ marginBottom: '1rem' }}>
              <label className="rt-field-label">Genre</label>
              <select className="rt-input" value={genre} onChange={e => setGenre(e.target.value)}>
                <option value="">— none —</option>
                {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            {(status === 'read' || status === 'reading') && (
              <>
                <div style={{ marginBottom: '1rem' }}>
                  <label className="rt-field-label">Private notes</label>
                  <textarea className="rt-textarea" rows={3} value={notes} onChange={e => setNotes(e.target.value)} style={{ width: '100%', resize: 'none' }} />
                </div>
                <ToggleSwitch checked={isPublic} onChange={setIsPublic} label="Share public review" sub="Friends can see this" />
                {isPublic && (
                  <div style={{ marginBottom: '1rem' }}>
                    <textarea className="rt-textarea" rows={4} placeholder="Write your review…" value={review} onChange={e => setReview(e.target.value)} style={{ width: '100%', resize: 'none' }} />
                  </div>
                )}
              </>
            )}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <GhostBtn onClick={() => setMode('view')}>← Back</GhostBtn>
              <PrimaryBtn onClick={handleSave}>Save changes</PrimaryBtn>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  )
}
