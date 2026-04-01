import { useState, useEffect } from 'react'
import { sb } from '../../lib/supabase'
import { ModalShell } from './BookSheet'
import { useSocialContext } from '../../context/SocialContext'
import { useChatContext } from '../../context/ChatContext'
import { avatarColour, avatarInitial } from '../../lib/utils'
import { IcoBook, IcoOpenBook, IcoChat, IcoLock, IcoBookmark } from '../../components/icons'

const CACHE_KEY = 'litloop_book_desc_v1'

function descCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') } catch { return {} }
}
function descCacheSet(olKey, data) {
  try {
    const c = descCache()
    c[olKey] = { ...data, _ts: Date.now() }
    const keys = Object.keys(c)
    if (keys.length > 100) {
      keys.sort((a, b) => (c[a]._ts || 0) - (c[b]._ts || 0))
        .slice(0, keys.length - 100)
        .forEach(k => delete c[k])
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(c))
  } catch {}
}

// Strip Goodreads series info: "Title (Series, #N; Series2, #N)" → "Title"
function cleanBookTitle(title) {
  return (title || '')
    .replace(/\s*\([^)]*#\d[^)]*\)/g, '')  // remove (Series, #N)
    .replace(/[:\u2014\u2013].*/u, '')        // strip subtitles after : or —
    .trim()
}

async function fetchOLDetail(book, onCoverFound) {
  let olKey = book.olKey
  let foundCoverId = null
  let foundCoverUrl = null

  if (!olKey || !book.coverId) {
    // Search via Edge Function — handles Google Books + OL server-side
    try {
      const SUPABASE_URL  = import.meta.env.SUPABASE_URL  || 'https://afwvsrjbaxutfonmmxjd.supabase.co'
      const SUPABASE_ANON = import.meta.env.SUPABASE_ANON || ''
      const cleanTitle = cleanBookTitle(book.title || '')
      const res = await fetch(`${SUPABASE_URL}/functions/v1/book-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON}` },
        body: JSON.stringify({ q: cleanTitle }),
      })
      const data = await res.json()
      const match = (data.results || []).find(r =>
        r.title?.toLowerCase().includes(cleanTitle.toLowerCase()) ||
        cleanTitle.toLowerCase().includes(r.title?.toLowerCase())
      )
      if (match) {
        if (!olKey && match.olKey) olKey = match.olKey
        if (!book.coverId && match.coverId) foundCoverId = match.coverId
        if (match.coverUrl) foundCoverUrl = match.coverUrl
      }
    } catch {}
  }

  // Fire cover callback whenever we found one (regardless of whether olKey was pre-set)
  if (foundCoverId || foundCoverUrl) {
    onCoverFound?.(foundCoverId, olKey, foundCoverUrl)
    if (book?.olKey) {
      const update = {}
      if (foundCoverId) update.cover_id = foundCoverId
      if (foundCoverUrl) update.cover_url = foundCoverUrl
      sb.from('books').update(update).eq('ol_key', book.olKey).then(() => {})
    }
  }

  if (!olKey) return null

  const cached = descCache()[olKey]
  if (cached) return cached

  const workRes  = await fetch(`https://openlibrary.org${olKey}.json`)
  const workData = await workRes.json()

  let description = ''
  if (workData.description) {
    description = typeof workData.description === 'string'
      ? workData.description
      : workData.description.value || ''
  }
  description = description
    .replace(/\r\n/g, '\n')
    .replace(/\[.*?\]\(.*?\)/g, '')
    .replace(/----------\n.*/s, '')
    .trim()

  const result = {
    description,
    year:     workData.first_publish_date || '',
    subjects: (workData.subjects || []).filter(s => s.length < 40).slice(0, 8)
  }
  descCacheSet(olKey, result)
  return result
}

// ── Pencil edit icon ──────────────────────────────────────────
function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  )
}

// ── Stars display ─────────────────────────────────────────────
function Stars({ value }) {
  if (!value) return null
  return <span style={{ fontSize: '1.3rem', color: 'var(--rt-amber)', letterSpacing: '1px', lineHeight: 1 }}>{'★'.repeat(value)}{'☆'.repeat(5 - value)}</span>
}

// ── Inline Recommend modal ────────────────────────────────────
// - Friends who've already read the book → show "Chat about it" instead
// - Friends you've already recommended to → show "Already recommended"
// - Friends who recommended this to you → shown at top with note
function RecommendModal({ book, friends, user, sendRecommendation, recs, onClose, onStartChatWith }) {
  const [selected, setSelected] = useState(new Set())
  const [note, setNote]         = useState('')
  const [sending, setSending]   = useState(false)
  const [sent, setSent]         = useState(false)

  // Build sets for quick lookup
  // recs sent BY me for this book
  const alreadySentTo = new Set(
    (recs || [])
      .filter(r => r.from_user_id === user?.id && (r.book_ol_key === book.olKey || r.book_title === book.title))
      .map(r => r.to_user_id)
  )
  // friends who've read this book (have it in their reading history via feed or social data)
  // We approximate via the "also read" data already on recs
  const alreadyReadBy = new Set(
    (recs || [])
      .filter(r => r.to_user_id === user?.id && (r.book_ol_key === book.olKey || r.book_title === book.title))
      .map(r => r.from_user_id)
  )

  function toggle(id) {
    if (alreadySentTo.has(id) || alreadyReadBy.has(id)) return
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function handleSend() {
    if (!selected.size) return
    setSending(true)
    await sendRecommendation(book, [...selected], note, user)
    setSending(false); setSent(true)
    setTimeout(onClose, 1200)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 400, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--rt-white)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, padding: '1.25rem', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
          <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1rem', fontWeight: 600, color: 'var(--rt-navy)' }}>Recommend to a friend</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--rt-t3)', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--rt-t3)', marginBottom: '1rem' }}>{book.title}</div>

        {sent ? (
          <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--rt-teal)', fontWeight: 700, fontSize: '1rem' }}>✓ Sent!</div>
        ) : (
          <>
            <div style={{ overflowY: 'auto', flex: 1, marginBottom: '0.75rem' }}>
              {!friends?.length ? (
                <div style={{ color: 'var(--rt-t3)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem' }}>Add friends first to recommend books.</div>
              ) : friends.map(f => {
                const sel         = selected.has(f.userId)
                const sentAlready = alreadySentTo.has(f.userId)
                const hasRead     = alreadyReadBy.has(f.userId)

                return (
                  <div key={f.userId} onClick={() => toggle(f.userId)}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0', borderBottom: '1px solid var(--rt-border)', cursor: sentAlready || hasRead ? 'default' : 'pointer', opacity: sentAlready ? 0.6 : 1 }}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: avatarColour(f.userId), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                      {avatarInitial(f.displayName || f.username || '?')}
                    </div>
                    <span style={{ flex: 1, fontSize: '0.9rem', fontWeight: 600, color: 'var(--rt-navy)' }}>{f.displayName || f.username}</span>

                    {sentAlready ? (
                      <span style={{ fontSize: '0.7rem', color: 'var(--rt-t3)', fontStyle: 'italic' }}>Already recommended</span>
                    ) : hasRead ? (
                      <button
                        onClick={e => { e.stopPropagation(); onStartChatWith?.(f.userId); onClose() }}
                        style={{ fontSize: '0.7rem', background: 'var(--rt-amber-pale)', color: 'var(--rt-amber)', border: 'none', borderRadius: 99, padding: '0.2rem 0.6rem', fontWeight: 700, cursor: 'pointer' }}
                      >Chat about it</button>
                    ) : (
                      <div style={{ width: 22, height: 22, borderRadius: 5, border: `2px solid ${sel ? 'var(--rt-amber)' : 'var(--rt-border-md)'}`, background: sel ? 'var(--rt-amber)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {sel && <span style={{ color: '#fff', fontSize: '0.72rem', fontWeight: 700 }}>✓</span>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <textarea value={note} onChange={e => setNote(e.target.value)}
              placeholder="Add a note (optional)…"
              style={{ width: '100%', borderRadius: 'var(--rt-r3)', border: '1px solid var(--rt-border-md)', padding: '0.6rem 0.75rem', fontSize: '0.85rem', fontFamily: 'inherit', resize: 'none', marginBottom: '0.75rem', boxSizing: 'border-box', minHeight: 68 }} />
            <button onClick={handleSend} disabled={!selected.size || sending}
              style={{ width: '100%', background: selected.size ? 'var(--rt-navy)' : 'var(--rt-surface)', color: selected.size ? '#fff' : 'var(--rt-t3)', border: 'none', borderRadius: 'var(--rt-r3)', padding: '0.85rem', fontWeight: 700, fontSize: '0.9rem', cursor: selected.size ? 'pointer' : 'default' }}>
              {sending ? 'Sending…' : `Send to ${selected.size || ''} friend${selected.size !== 1 ? 's' : ''}`}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Inline Chat friend picker ─────────────────────────────────
// ── Inline Chat friend picker ─────────────────────────────────
// Three tiers: existing chats on this book → friends who've read it → all other friends
// If existing chat found for book+friend combo: ask add-to-existing or new chat
function ChatFriendPicker({ book, friends, startOrOpenChat, onOpenChatModal, onClose, existingChats }) {
  const { myUsername, myDisplayName } = useSocialContext()
  const [selected, setSelected]     = useState(new Set())
  const [starting, setStarting]     = useState(false)
  // For the "new vs existing" decision step
  const [pendingFriendIds, setPendingFriendIds] = useState(null)
  const [chatName, setChatName]     = useState('')
  const [step, setStep]             = useState('pick') // 'pick' | 'confirm-existing' | 'name-new'

  // Existing chats on this book (any participant overlap)
  const bookChats = (existingChats || []).filter(c =>
    book.olKey ? c.bookOlKey === book.olKey : c.bookTitle === book.title
  )
  // Friend IDs already in a chat about this book
  const friendsInChat = new Set(bookChats.flatMap(c => c.participantIds || []))

  function toggle(id) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function handleStart() {
    if (!selected.size) return
    const friendIds = [...selected]

    // Check if a chat about this book already exists
    const hasExisting = bookChats.length > 0

    if (hasExisting) {
      setPendingFriendIds(friendIds)
      setStep('confirm-existing')
      return
    }

    // Auto-name: "me & friend" or "me & friend1 & friend2"
    const selectedFriends = friends.filter(f => friendIds.includes(f.userId))
    const myName = myDisplayName || myUsername || 'me'
    const friendNames = selectedFriends.map(f => f.displayName || f.username || 'friend')
    const autoName = friendIds.length === 1
      ? `${myName} & ${friendNames[0]}`
      : `${myName} & ${friendNames.slice(0, 2).join(' & ')}${friendIds.length > 2 ? ` +${friendIds.length - 2}` : ''}`

    await createChat(friendIds, autoName)
  }

  async function createChat(friendIds, name) {
    setStarting(true)
    const chatId = await startOrOpenChat(book.olKey, book.title, book.author, book.coverId, friendIds, null, name)
    setStarting(false)
    if (chatId) {
      // Build full chat object so AppShell doesn't need to look it up in stale list
      const chatObj = {
        id:          chatId,
        bookOlKey:   book.olKey   || null,
        bookTitle:   book.title   || '',
        bookAuthor:  book.author  || '',
        coverIdRaw:  book.coverId || null,
        chatName:    name         || null,
      }
      onOpenChatModal?.(chatObj, book)
    }
    onClose()
  }

  async function addToExisting() {
    const chat = bookChats[0]
    setStarting(true)
    // Add the new friends to the existing chat
    const { sb } = await import('../../lib/supabase')
    for (const fid of pendingFriendIds) {
      await sb.from('chat_participants').upsert(
        { chat_id: chat.id, user_id: fid },
        { onConflict: 'chat_id,user_id', ignoreDuplicates: true }
      )
    }
    setStarting(false)
    onOpenChatModal?.(chat, book)
    onClose()
  }

  // Tier labels
  const friendsWithChat    = friends.filter(f => friendsInChat.has(f.userId))
  const friendsWithoutChat = friends.filter(f => !friendsInChat.has(f.userId))

  function FriendRow({ f }) {
    const sel = selected.has(f.userId)
    const inChat = friendsInChat.has(f.userId)
    return (
      <div onClick={() => toggle(f.userId)}
        style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0', borderBottom: '1px solid var(--rt-border)', cursor: 'pointer' }}>
        <div style={{ width: 34, height: 34, borderRadius: '50%', background: avatarColour(f.userId), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
          {avatarInitial(f.displayName || f.username || '?')}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--rt-navy)' }}>{f.displayName || f.username}</div>
          {inChat && <div style={{ fontSize: '0.65rem', color: 'var(--rt-teal)' }}>Already chatting about this book</div>}
        </div>
        <div style={{ width: 22, height: 22, borderRadius: 5, border: `2px solid ${sel ? 'var(--rt-amber)' : 'var(--rt-border-md)'}`, background: sel ? 'var(--rt-amber)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {sel && <span style={{ color: '#fff', fontSize: '0.72rem', fontWeight: 700 }}>✓</span>}
        </div>
      </div>
    )
  }

  if (step === 'confirm-existing') {
    const existingChat = bookChats[0]
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 400, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
        <div style={{ background: 'var(--rt-white)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, padding: '1.25rem' }} onClick={e => e.stopPropagation()}>
          <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1rem', fontWeight: 600, color: 'var(--rt-navy)', marginBottom: '0.4rem' }}>Chat already exists</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--rt-t3)', marginBottom: '1.25rem' }}>
            You already have a chat about <strong>{book.title}</strong>{existingChat?.chatName ? ` called "${existingChat.chatName}"` : ''}. What would you like to do?
          </div>
          <button onClick={addToExisting} disabled={starting}
            style={{ width: '100%', background: 'var(--rt-navy)', color: '#fff', border: 'none', borderRadius: 'var(--rt-r3)', padding: '0.85rem', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', marginBottom: '0.65rem' }}>
            {starting ? 'Adding…' : 'Add to existing chat'}
          </button>
          <button onClick={() => setStep('name-new')}
            style={{ width: '100%', background: 'var(--rt-surface)', color: 'var(--rt-navy)', border: '1px solid var(--rt-border)', borderRadius: 'var(--rt-r3)', padding: '0.85rem', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', marginBottom: '0.65rem' }}>
            Start a new chat
          </button>
          <button onClick={() => setStep('pick')} style={{ width: '100%', background: 'none', border: 'none', color: 'var(--rt-t3)', fontSize: '0.85rem', cursor: 'pointer', padding: '0.4rem' }}>← Back</button>
        </div>
      </div>
    )
  }

  if (step === 'name-new') {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 400, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
        <div style={{ background: 'var(--rt-white)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, padding: '1.25rem' }} onClick={e => e.stopPropagation()}>
          <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1rem', fontWeight: 600, color: 'var(--rt-navy)', marginBottom: '0.4rem' }}>Name this chat</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--rt-t3)', marginBottom: '1rem' }}>Give this chat a name to tell it apart from your other {book.title} chats.</div>
          <input
            className="rt-input"
            style={{ width: '100%', marginBottom: '1rem', boxSizing: 'border-box' }}
            placeholder="e.g. Book club crew, Weekend reads…"
            value={chatName}
            onChange={e => setChatName(e.target.value)}
            autoFocus
          />
          <button onClick={() => createChat(pendingFriendIds, chatName.trim() || null)} disabled={starting}
            style={{ width: '100%', background: 'var(--rt-navy)', color: '#fff', border: 'none', borderRadius: 'var(--rt-r3)', padding: '0.85rem', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', marginBottom: '0.65rem' }}>
            {starting ? 'Starting…' : 'Start chat'}
          </button>
          <button onClick={() => setStep('confirm-existing')} style={{ width: '100%', background: 'none', border: 'none', color: 'var(--rt-t3)', fontSize: '0.85rem', cursor: 'pointer', padding: '0.4rem' }}>← Back</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 400, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--rt-white)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, padding: '1.25rem', maxHeight: '75vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
          <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1rem', fontWeight: 600, color: 'var(--rt-navy)' }}>Chat about this book</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--rt-t3)', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--rt-t3)', marginBottom: '1rem' }}>{book.title}</div>

        <div style={{ overflowY: 'auto', flex: 1, marginBottom: '0.75rem' }}>
          {!friends?.length ? (
            <div style={{ color: 'var(--rt-t3)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem' }}>Add friends to start a chat.</div>
          ) : (
            <>
              {friendsWithChat.length > 0 && (
                <>
                  <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--rt-teal)', padding: '0.4rem 0 0.2rem' }}>Already chatting</div>
                  {friendsWithChat.map(f => <FriendRow key={f.userId} f={f} />)}
                </>
              )}
              {friendsWithoutChat.length > 0 && (
                <>
                  {friendsWithChat.length > 0 && <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--rt-t3)', padding: '0.75rem 0 0.2rem' }}>Other friends</div>}
                  {friendsWithoutChat.map(f => <FriendRow key={f.userId} f={f} />)}
                </>
              )}
            </>
          )}
        </div>

        <button onClick={handleStart} disabled={!selected.size || starting}
          style={{ width: '100%', background: selected.size ? 'var(--rt-navy)' : 'var(--rt-surface)', color: selected.size ? '#fff' : 'var(--rt-t3)', border: 'none', borderRadius: 'var(--rt-r3)', padding: '0.85rem', fontWeight: 700, fontSize: '0.9rem', cursor: selected.size ? 'pointer' : 'default' }}>
          {starting ? 'Starting…' : `Chat with ${selected.size || ''} friend${selected.size !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  )
}

export default function BookDetailPanel({
  book,
  location,
  onClose,
  onMarkFinished,
  onStartReading,
  onRecommend,
  onStartChat,
  onViewChat,
  onAddToTBR,
  onEdit,
  existingChatId,
  user,
  onOpenChatModal,
  friendName,
  onCoverUpdate,
  onProgressLogged,
  onShareMoment,
}) {
  const { friends, sendRecommendation, recs } = useSocialContext()
  const { startOrOpenChat, chats } = useChatContext()

  const [olData, setOlData]               = useState(null)
  const [loading, setLoading]             = useState(true)
  const [expanded, setExpanded]           = useState(false)
  const [showRecommend, setShowRecommend] = useState(false)
  const [showChatPicker, setShowChatPicker] = useState(false)
  const [showProgress, setShowProgress]   = useState(false)
  const [progressPage, setProgressPage]   = useState(book?.currentPage ? String(book.currentPage) : '')
  const [progressTotal, setProgressTotal] = useState(book?.totalPages ? String(book.totalPages) : '')
  const [progressPct, setProgressPct]     = useState(book?.currentPage ? String(book.currentPage) : '')
  const [shareAsMoment, setShareAsMoment] = useState(false)
  const [savingProgress, setSavingProgress] = useState(false)
  const [coverIdLive, setCoverIdLive]     = useState(book?.coverId || null)
  const [olKeyLive, setOlKeyLive]         = useState(book?.olKey || null)

  useEffect(() => { setCoverIdLive(book?.coverId || null) }, [book?.coverId])
  useEffect(() => { setOlKeyLive(book?.olKey || null) }, [book?.olKey])

  useEffect(() => {
    setLoading(true); setOlData(null); setExpanded(false)
    fetchOLDetail(book, (coverId, discoveredOlKey) => {
      if (!coverId) return
      // Update local display immediately
      setCoverIdLive(coverId)
      if (discoveredOlKey) setOlKeyLive(discoveredOlKey)
      // Update in-memory books state so list view shows cover without refetch
      onCoverUpdate?.(book.id, coverId, discoveredOlKey)
      // Write cover back to books table using the discovered olKey
      // (book.olKey may be null for Goodreads imports — discoveredOlKey is always populated)
      const writeKey = discoveredOlKey || book?.olKey
      if (writeKey) {
        sb.from('books')
          .update({ cover_id: coverId })
          .eq('ol_key', writeKey)
          .then(({ error: e }) => { if (e) console.error('[Cover] writeback error:', e) })
      }
    })
      .then(d => { setOlData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [book?.id, book?.olKey])

  const description = olData?.description || ''
  const LIMIT       = 400
  const truncated   = !expanded && description.length > LIMIT
  const shownDesc   = truncated ? description.slice(0, LIMIT) + '…' : description

  const statusBadges = {
    reading: 'Currently reading',
    read:    '✓ Read',
    tbr:     'On your list',
    dnf:     'Did not finish'
  }

  const isHistory = location === 'mylist-history' || location === 'mylist-dnf'
  const isTBR     = location === 'mylist-tbr'
  const isReading = location === 'mylist-reading' || location === 'home-reading'
  const hasChat   = !!existingChatId

  return (
    <ModalShell onClose={onClose} maxWidth={600}>

      {/* ── Navy hero ── */}
      <div style={{ background: 'linear-gradient(160deg, var(--rt-navy) 0%, #2A4A6B 100%)', padding: '1.5rem 1.25rem 1.25rem', position: 'relative', flexShrink: 0 }}>
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: '0.85rem', right: '0.85rem', background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', fontSize: '1rem' }}
        >×</button>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
          <div style={{ flexShrink: 0 }}>
            {coverIdLive
              ? <img src={`https://covers.openlibrary.org/b/id/${coverIdLive}-M.jpg`}
                  style={{ width: 80, height: 116, borderRadius: 8, objectFit: 'cover', boxShadow: '0 4px 16px rgba(0,0,0,0.35)' }} alt={book.title} />
              : <div style={{ width: 80, height: 116, borderRadius: 8, background: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', color: 'rgba(255,255,255,0.3)' }}>
                  {loading ? '…' : <IcoBook size={32} color="rgba(255,255,255,0.3)" />}
                </div>
            }
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.1rem', fontWeight: 700, color: '#fff', lineHeight: 1.3, marginBottom: '0.3rem' }}>{book.title}</div>
            {book.author && <div style={{ fontSize: '0.83rem', color: 'rgba(255,255,255,0.6)', marginBottom: '0.35rem' }}>by {book.author}</div>}

            {olData?.year && <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', marginBottom: '0.4rem' }}>First published {olData.year}</div>}
            {book.status && (
              <span style={{ display: 'inline-block', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)', padding: '0.2em 0.6em', borderRadius: '99px' }}>
                {statusBadges[book.status] || book.status}
              </span>
            )}
            {isReading && (
              <button
                onClick={() => setShowProgress(true)}
                style={{ display: 'block', marginTop: '0.4rem', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}
              >
                {book.currentPage ? '↻ Update progress' : '+ Log progress'}
              </button>
            )}
          </div>
        </div>

        {/* Progress bar — shown when reading and progress logged */}
        {isReading && book.currentPage && (
          <div style={{ marginTop: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: 'var(--rt-amber)', borderRadius: 99, width: `${Math.min(100, book.currentPage)}%` }} />
              </div>
              <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap' }}>
                {book.currentPage}%
              </span>
            </div>
          </div>
        )}

        {/* Stars in hero if read */}
        {book.rating > 0 && (
          <div style={{ marginTop: '0.85rem' }}>
            <Stars value={book.rating} />
          </div>
        )}
      </div>

      {/* ── Scrollable body ── */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '1.1rem 1.25rem' }}>

        {/* FRIEND REVIEW — shown when opened from feed */}
        {(friendName || book.friendName) && (book.rating || book.reviewBody) && (
          <div style={{ marginBottom: '1.1rem', padding: '0.85rem 1rem', background: '#F5F0E8', borderRadius: 'var(--rt-r3)', border: '1px solid var(--rt-border)' }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.45rem' }}>
              {friendName || book.friendName}'s review
            </div>
            {book.rating > 0 && <div style={{ marginBottom: '0.45rem' }}><Stars value={book.rating} /></div>}
            {book.reviewBody && (
              <div style={{ fontSize: '0.88rem', color: 'var(--rt-t2)', lineHeight: 1.6, fontStyle: 'italic', borderLeft: '3px solid var(--rt-border-md)', paddingLeft: '0.75rem' }}>
                {book.reviewBody}
              </div>
            )}
          </div>
        )}

        {/* MY REVIEW — empty state CTA for read books with no rating/review */}
        {isHistory && !book.rating && !book.reviewBody && (
          <button
            onClick={() => { onClose(); onEdit?.('edit') }}
            style={{ width: '100%', marginBottom: '1.1rem', padding: '0.75rem 1rem', background: 'var(--rt-cream)', border: '1.5px dashed var(--rt-border-md)', borderRadius: 'var(--rt-r3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.6rem', textAlign: 'left' }}
          >
            <PencilIcon />
            <div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--rt-navy)' }}>Add a rating or review</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--rt-t3)', marginTop: '0.1rem' }}>How did you find this one?</div>
            </div>
          </button>
        )}

        {/* MY REVIEW — shown for history/dnf at top, with edit pencil */}
        {isHistory && (book.rating || book.reviewBody) && (
          <div style={{ marginBottom: '1.1rem', padding: '0.85rem 1rem', background: 'var(--rt-cream)', borderRadius: 'var(--rt-r3)', border: '1px solid var(--rt-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)' }}>My review</div>
              <button
                onClick={() => { onClose(); onEdit?.('edit') }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--rt-t3)', fontSize: '0.72rem', padding: '0.1rem 0.25rem', borderRadius: 4 }}
                title="Edit review"
              >
                <PencilIcon /> Edit
              </button>
            </div>
            {book.rating > 0 && <div style={{ marginBottom: '0.45rem' }}><Stars value={book.rating} /></div>}
            {book.reviewBody && (
              <div style={{ borderLeft: '3px solid var(--rt-border-md)', paddingLeft: '0.75rem' }}>
                <div style={{ fontSize: '0.88rem', color: 'var(--rt-t2)', lineHeight: 1.6, fontStyle: 'italic' }}>{book.reviewBody}</div>
              </div>
            )}
          </div>
        )}

        {/* ABOUT THIS BOOK */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)' }}>About this book</div>
            {(book.olKey || olKeyLive) && book.reviewPublic && (() => {
              const key   = (book.olKey || olKeyLive || '').replace('/works/', '').toLowerCase()
              const clean = (book.title || '').replace(/\s*\(.*?\)\s*/g, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')
              const slug  = key + (clean ? '-' + clean : '')
              return <a href={`https://app.litloop.co/book/${slug}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.72rem', color: 'var(--rt-t3)', textDecoration: 'underline', textUnderlineOffset: 2 }}>View book page ↗</a>
            })()}
          </div>
          {loading ? (
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', color: 'var(--rt-t3)', fontSize: '0.82rem' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--rt-border-md)', animation: 'pulse 1.2s ease infinite' }}/>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--rt-border-md)', animation: 'pulse 1.2s ease infinite 0.2s' }}/>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--rt-border-md)', animation: 'pulse 1.2s ease infinite 0.4s' }}/>
              <span style={{ marginLeft: 4 }}>Loading…</span>
            </div>
          ) : description ? (
            <>
              <p style={{ fontSize: '0.88rem', color: 'var(--rt-t2)', lineHeight: 1.65, margin: 0 }}>{shownDesc}</p>
              {truncated && (
                <button onClick={() => setExpanded(true)} style={{ background: 'none', border: 'none', color: 'var(--rt-amber)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', padding: '0.35rem 0 0' }}>
                  Read more ↓
                </button>
              )}
            </>
          ) : (
            <p style={{ fontSize: '0.85rem', color: 'var(--rt-t3)', fontStyle: 'italic', margin: 0 }}>No description available.</p>
          )}
        </div>

        {/* SUBJECTS */}
        {olData?.subjects?.length > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.4rem' }}>Subjects</div>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {olData.subjects.map(s => (
                <span key={s} style={{ fontSize: '0.72rem', padding: '0.2em 0.6em', background: 'var(--rt-surface)', border: '1px solid var(--rt-border)', borderRadius: '99px', color: 'var(--rt-t2)' }}>{s}</span>
              ))}
            </div>
          </div>
        )}

        {/* Private notes (not shown in review section above) */}
        {book.notes && (
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><IcoLock size={10} color="var(--rt-t3)" /> Private notes</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--rt-t2)', lineHeight: 1.55, fontStyle: 'italic' }}>{book.notes}</div>
          </div>
        )}
      </div>

      {/* ── Footer actions ── */}
      <div style={{ padding: '0.85rem 1.25rem', borderTop: '1px solid var(--rt-border)', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', flexShrink: 0 }}>

        {/* TBR */}
        {isTBR && <>
          <button className="rt-bdp-btn rt-bdp-btn--primary" style={{ flex: 1 }}
            onClick={() => { onClose(); onStartReading?.() }}>Start reading</button>
          {user && <button className="rt-bdp-btn rt-bdp-btn--amber" style={{ flex: 1 }}
            onClick={() => setShowRecommend(true)}>Recommend</button>}
          {user && <button className="rt-bdp-btn rt-bdp-btn--ghost" style={{ flex: 1 }}
            onClick={() => setShowChatPicker(true)}>Chat</button>}
        </>}

        {/* Currently reading */}
        {isReading && <>
          <button className="rt-bdp-btn rt-bdp-btn--primary" style={{ flex: 1 }}
            onClick={() => { onClose(); onMarkFinished?.() }}>✓ Mark finished</button>
          {user && <button className="rt-bdp-btn rt-bdp-btn--amber" style={{ flex: 1 }}
            onClick={() => setShowRecommend(true)}>Recommend</button>}
          {user && <button className="rt-bdp-btn rt-bdp-btn--ghost" style={{ flex: 1 }}
            onClick={() => setShowChatPicker(true)}>Chat</button>}
        </>}

        {/* History / DNF */}
        {isHistory && <>
          {user && <button className="rt-bdp-btn rt-bdp-btn--amber" style={{ flex: 1 }}
            onClick={() => setShowRecommend(true)}>Recommend</button>}
          {user && <button className="rt-bdp-btn rt-bdp-btn--primary" style={{ flex: 1 }}
            onClick={() => setShowChatPicker(true)}>Chat</button>}
        </>}

        {/* Home feed — add to list + chat */}
        {location === 'home-feed' && <>
          <button className="rt-bdp-btn rt-bdp-btn--primary" style={{ flex: 1 }}
            onClick={() => { onClose(); onAddToTBR?.() }}>+ Add to list</button>
          {user && <button className="rt-bdp-btn rt-bdp-btn--amber" style={{ flex: 1 }}
            onClick={() => setShowChatPicker(true)}>Chat</button>}
        </>}

        {/* Community chat view */}
        {location === 'community-chat' && <>
          {user && <button className="rt-bdp-btn rt-bdp-btn--primary" style={{ flex: 1 }}
            onClick={() => setShowChatPicker(true)}>Chat</button>}
          <button className="rt-bdp-btn rt-bdp-btn--ghost" style={{ flex: 1 }}
            onClick={() => { onClose(); onAddToTBR?.() }}>+ Add to list</button>
        </>}
      </div>

      {/* ── Inline modals ── */}
      {showRecommend && (
        <RecommendModal
          book={book}
          friends={friends}
          user={user}
          recs={recs}
          sendRecommendation={sendRecommendation}
          onClose={() => setShowRecommend(false)}
          onStartChatWith={(friendId) => {
            setShowRecommend(false)
            setShowChatPicker(true)
          }}
        />
      )}
      {showChatPicker && (
        <ChatFriendPicker
          book={book}
          friends={friends}
          startOrOpenChat={startOrOpenChat}
          onOpenChatModal={onOpenChatModal}
          onClose={() => setShowChatPicker(false)}
          existingChats={chats}
        />
      )}

      {/* ── Log Progress modal ── */}
      {showProgress && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,15,30,0.55)', zIndex: 500, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <style>{`
            @media (min-width: 640px) {
              .rt-progress-modal { border-radius: 16px !important; max-width: 380px !important; margin-bottom: auto !important; margin-top: auto !important; }
            }
          `}</style>
          <div className="rt-progress-modal" style={{ background: 'var(--rt-white)', borderRadius: '16px 16px 0 0', padding: '1.25rem 1.25rem 2rem', width: '100%', maxWidth: 480 }}>
            <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1rem', fontWeight: 600, color: 'var(--rt-navy)', marginBottom: '0.25rem' }}>Log progress</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--rt-t3)', marginBottom: '1.1rem' }}>{book.title}</div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--rt-t3)', marginBottom: '0.35rem' }}>% done</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={progressPct}
                  onChange={e => setProgressPct(e.target.value)}
                  placeholder="e.g. 57"
                  autoFocus
                  style={{ flex: 1, padding: '0.6rem 0.75rem', border: '1.5px solid var(--rt-border-md)', borderRadius: 8, fontSize: '1.1rem', color: 'var(--rt-navy)', outline: 'none', fontFamily: 'var(--rt-font-body)' }}
                />
                <span style={{ fontSize: '1.1rem', color: 'var(--rt-t3)', fontWeight: 600 }}>%</span>
              </div>
              {progressPct && (
                <div style={{ marginTop: '0.5rem' }}>
                  <div style={{ height: 4, background: 'var(--rt-border)', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: 'var(--rt-amber)', borderRadius: 99, width: `${Math.min(100, parseInt(progressPct) || 0)}%`, transition: 'width 0.2s' }} />
                  </div>
                </div>
              )}
            </div>

            {/* Share as moment toggle */}
            <div
              onClick={() => setShareAsMoment(v => !v)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 0', borderTop: '1px solid var(--rt-border)', borderBottom: '1px solid var(--rt-border)', marginBottom: '1rem', cursor: 'pointer' }}
            >
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--rt-navy)' }}>Share as a moment</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)' }}>Post a reading update to your friends</div>
              </div>
              <div style={{ width: 40, height: 24, borderRadius: 99, background: shareAsMoment ? 'var(--rt-amber)' : 'var(--rt-border-md)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: 3, left: shareAsMoment ? 19 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={() => { setShowProgress(false); setShareAsMoment(false) }}
                style={{ flex: 1, padding: '0.75rem', border: '1px solid var(--rt-border-md)', borderRadius: 99, background: 'none', fontSize: '0.88rem', color: 'var(--rt-t2)', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                disabled={!progressPct || savingProgress}
                onClick={async () => {
                  if (!progressPct || !user) return
                  setSavingProgress(true)
                  const pct = Math.min(100, parseInt(progressPct) || 0)
                  // Write to DB — store pct in current_page field (0-100), total_pages=100
                  await sb.from('reading_entries')
                    .update({ current_page: pct, total_pages: 100, updated_at: new Date().toISOString() })
                    .eq('user_id', user.id)
                    .eq('status', 'reading')
                    .eq('book_id', book.cloudId || book.id)
                  setSavingProgress(false)
                  onProgressLogged?.({ currentPage: pct, totalPages: 100 })
                  setShowProgress(false)
                  if (shareAsMoment) {
                    setShareAsMoment(false)
                    onShareMoment?.({ book, page: null, pct })
                  }
                }}
                style={{ flex: 2, padding: '0.75rem', border: 'none', borderRadius: 99, background: progressPct ? 'var(--rt-navy)' : 'var(--rt-surface)', color: progressPct ? '#fff' : 'var(--rt-t3)', fontSize: '0.88rem', fontWeight: 700, cursor: progressPct ? 'pointer' : 'default', transition: 'all 0.15s' }}
              >
                {savingProgress ? 'Saving…' : shareAsMoment ? 'Save & share moment' : 'Save progress'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ModalShell>
  )
}