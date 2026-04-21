import { useState, useEffect, useRef } from 'react'
import { useSocialContext } from '../context/SocialContext'
import { sb } from '../lib/supabase'
import { useChatContext } from '../context/ChatContext'
import { useBooksContext } from '../context/BooksContext'
import { useAuthContext } from '../context/AuthContext'
import { avatarColour, avatarInitial, timeAgo } from '../lib/utils'
import CoverImage from '../components/books/CoverImage'
import BookDetailPanel from '../components/books/BookDetailPanel'
import FriendProfileSheet from '../components/books/FriendProfileSheet'
import FriendProfilePage from '../pages/FriendProfilePage'
import Clubs from '../pages/Clubs'
import AddBookModal from '../components/books/AddBookModal'
import { IcoOpenBook, IcoChat, IcoDoorExit, IcoUsers } from '../components/icons'
import ReportSheet from '../components/ReportSheet'
import { useSwipeTabs } from '../hooks/useSwipeTabs'

const CHAT_TABS = ['chats', 'clubs', 'friends']

// ── Colours ───────────────────────────────────────────────────
const MY_BUBBLE    = { bg: '#DEF0FF', color: '#1a2744' }   // pale blue
const THEIR_BUBBLE = { bg: '#F5F0E8', color: '#1a2744' }   // pale cream


// ── Participant avatars row ───────────────────────────────────
function ParticipantsRow({ participants, currentUserId, onViewProfile }) {
  const [expanded, setExpanded] = useState(false)
  const others = participants.filter(p => p.userId !== currentUserId)

  if (!others.length) return null

  return (
    <div>
      {/* Avatar row — tap to toggle names */}
      <div
        onClick={() => setExpanded(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', userSelect: 'none' }}
      >
        {others.map(p => (
          <div
            key={p.userId}
            title={p.displayName}
            style={{
              width: 30, height: 30, borderRadius: '50%',
              background: avatarColour(p.userId),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.6rem', fontWeight: 700, color: '#fff',
              border: '2px solid rgba(255,255,255,0.25)', flexShrink: 0,
              overflow: 'hidden',
            }}
          >{p.avatarUrl ? <img src={p.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : avatarInitial(p.displayName)}</div>
        ))}
        <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', marginLeft: '0.2rem' }}>
          {expanded ? '▴' : '▾'}
        </span>
      </div>

      {/* Expanded names — clickable pills */}
      {expanded && (
        <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
          {others.map(p => (
            <div
              key={p.userId}
              onClick={e => { e.stopPropagation(); onViewProfile?.(p) }}
              style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'rgba(255,255,255,0.1)', borderRadius: 99, padding: '0.2rem 0.55rem', cursor: onViewProfile ? 'pointer' : 'default' }}
            >
              <div style={{ width: 16, height: 16, borderRadius: '50%', background: avatarColour(p.userId), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.42rem', fontWeight: 700, color: '#fff', flexShrink: 0, overflow: 'hidden' }}>
                {p.avatarUrl ? <img src={p.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : avatarInitial(p.displayName)}
              </div>
              <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>{p.displayName}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Add participants modal ────────────────────────────────────
function AddParticipantsModal({ chat, friends, currentParticipantIds, onAdd, onClose }) {
  const [selected, setSelected] = useState([])
  const [sending, setSending]   = useState(false)
  const available = friends.filter(f => !currentParticipantIds.includes(f.userId))

  function toggle(id) { setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]) }

  async function handleAdd() {
    if (!selected.length) return
    setSending(true)
    await onAdd(selected)
    setSending(false)
    onClose()
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(10,15,30,0.55)', zIndex: 600 }} />
      <div style={{
        position: 'fixed', zIndex: 601,
        background: 'var(--rt-white)', borderRadius: 'var(--rt-r2)',
        boxShadow: '0 8px 40px rgba(10,15,30,0.22)',
        width: '90vw', maxWidth: 400,
        top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '1rem 1.1rem', borderBottom: '1px solid var(--rt-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.95rem', fontWeight: 600, color: 'var(--rt-navy)' }}>Add to chat</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--rt-t3)' }}>×</button>
        </div>
        <div style={{ padding: '0.75rem 1.1rem', maxHeight: 280, overflowY: 'auto' }}>
          {available.length === 0
            ? <p style={{ fontSize: '0.83rem', color: 'var(--rt-t3)', fontStyle: 'italic' }}>All friends already in this chat.</p>
            : available.map(f => (
              <div key={f.userId} onClick={() => toggle(f.userId)} style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.55rem 0', cursor: 'pointer', borderBottom: '1px solid var(--rt-border)' }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: avatarColour(f.userId), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, color: '#fff', flexShrink: 0 }}>{avatarInitial(f.displayName)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--rt-navy)' }}>{f.displayName}</div>
                  {f.username && <div style={{ fontSize: '0.7rem', color: 'var(--rt-t3)' }}>@{f.username}</div>}
                </div>
                <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${selected.includes(f.userId) ? 'var(--rt-navy)' : 'var(--rt-border-md)'}`, background: selected.includes(f.userId) ? 'var(--rt-navy)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.6rem', fontWeight: 700 }}>
                  {selected.includes(f.userId) && '✓'}
                </div>
              </div>
            ))
          }
        </div>
        <div style={{ padding: '0.75rem 1.1rem', borderTop: '1px solid var(--rt-border)', display: 'flex', gap: '0.5rem' }}>
          <button onClick={onClose} style={{ flex: 1, background: 'var(--rt-surface)', border: '1px solid var(--rt-border-md)', borderRadius: 'var(--rt-r3)', padding: '0.6rem', fontSize: '0.83rem', cursor: 'pointer', color: 'var(--rt-t2)' }}>Cancel</button>
          <button onClick={handleAdd} disabled={!selected.length || sending} style={{ flex: 2, background: selected.length ? 'var(--rt-navy)' : 'var(--rt-surface)', color: selected.length ? '#fff' : 'var(--rt-t3)', border: 'none', borderRadius: 'var(--rt-r3)', padding: '0.6rem', fontSize: '0.83rem', fontWeight: 700, cursor: selected.length ? 'pointer' : 'default' }}>
            {sending ? 'Adding…' : `Add ${selected.length || ''} friend${selected.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Chat Thread Modal ─────────────────────────────────────────
export function ChatThreadModal({ chat, user, friends, messages, onClose, onSend, onLoadEarlier, onDeleteMessage, loadParticipants, updateChatName, addParticipants, findExistingChat, onLeaveChat, onDeleteChat, onReport }) {
  const [msgInput, setMsgInput]         = useState('')
  const [participants, setParticipants] = useState([])
  const [participantsLoaded, setParticipantsLoaded] = useState(false)
  const [editingName, setEditingName]   = useState(false)
  const [chatName, setChatName]         = useState(chat.chatName || '')
  const [nameInput, setNameInput]       = useState(chat.chatName || '')
  const [showAddPpl, setShowAddPpl]     = useState(false)
  const [detailBook, setDetailBook]     = useState(null)
  const [showMenu, setShowMenu]         = useState(false)
  const [menuAction, setMenuAction]     = useState(null) // 'leave' | 'delete'
  const messagesEndRef                  = useRef(null)

  useEffect(() => {
    setParticipantsLoaded(false)
    loadParticipants(chat.id).then(p => { setParticipants(p); setParticipantsLoaded(true) })
  }, [chat.id])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    const body = msgInput.trim()
    if (!body) return
    setMsgInput('')
    await onSend(chat.id, body)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  async function handleSaveName() {
    await updateChatName(chat.id, nameInput)
    setChatName(nameInput.trim() || '')
    setEditingName(false)
  }

  async function handleAddParticipants(ids) {
    await addParticipants(chat.id, ids)
    const updated = await loadParticipants(chat.id)
    setParticipants(updated)
  }

  const coverSrc = chat.coverUrl
    || (chat.coverIdRaw ? `https://covers.openlibrary.org/b/id/${chat.coverIdRaw}-S.jpg` : null)
    || (chat.bookOlKey ? `https://covers.openlibrary.org/b/olid/${chat.bookOlKey.replace('/works/', '')}-S.jpg` : null)

  const participantIds = participants.map(p => p.userId)
  const isCreator = participants.find(p => p.userId === user?.id)?.isCreator || false

  async function handleLeave() {
    const result = await onLeaveChat?.(chat.id)
    if (!result?.error) onClose()
  }

  async function handleDelete() {
    const result = await onDeleteChat?.(chat.id)
    if (!result?.error) onClose()
  }

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(10,15,30,0.55)', zIndex: 500 }} />

      {/* Modal */}
      <div style={{
        position: 'fixed', zIndex: 501,
        background: 'var(--rt-cream)',
        borderRadius: 16,
        boxShadow: '0 16px 60px rgba(10,15,30,0.28)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        // Mobile: nearly full screen slide up
        bottom: 0, left: 0, right: 0,
        height: '92vh',
        // Desktop: centred, constrained
      }}
        className="rt-chat-modal"
      >
        <style>{`
          @media (min-width: 640px) {
            .rt-chat-modal {
              top: 50% !important;
              left: 50% !important;
              bottom: auto !important;
              right: auto !important;
              transform: translate(-50%, -50%) !important;
              width: min(680px, 92vw) !important;
              height: min(82vh, 700px) !important;
            }
          }
        `}</style>

        {/* Header */}
        <div style={{ background: 'linear-gradient(160deg, var(--rt-navy), #2A4A6B)', padding: '0.85rem 1rem', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {/* Close */}
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', fontSize: '1rem', flexShrink: 0 }}>←</button>

            {/* Cover */}
            {coverSrc
              ? <img src={coverSrc} style={{ width: 36, height: 52, borderRadius: 5, objectFit: 'cover', flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }} alt="" onError={e => e.target.style.display='none'} />
              : <div style={{ width: 36, height: 52, borderRadius: 5, background: 'rgba(255,255,255,0.1)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IcoOpenBook size={20} color="rgba(255,255,255,0.5)" /></div>
            }

            {/* Title + chat name */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Chat name row — tappable independently */}
              {editingName ? (
                <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', marginBottom: '0.3rem' }}>
                  <input
                    autoFocus
                    value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false) }}
                    placeholder="Chat name…"
                    style={{ flex: 1, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.35)', borderRadius: 8, padding: '0.45rem 0.65rem', color: '#fff', fontSize: '0.85rem', fontFamily: 'var(--rt-font-body)', outline: 'none' }}
                  />
                  <button onClick={handleSaveName} style={{ background: 'var(--rt-amber-lt)', border: 'none', borderRadius: 6, padding: '0.4rem 0.6rem', color: '#fff', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Save</button>
                  <button onClick={() => setEditingName(false)} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 6, padding: '0.4rem 0.5rem', color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', cursor: 'pointer' }}>✕</button>
                </div>
              ) : (
                <button
                  onClick={() => setEditingName(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '0.35rem 0.65rem', cursor: 'pointer', marginBottom: '0.3rem', maxWidth: '100%', width: '100%', textAlign: 'left' }}
                >
                  <span style={{ fontSize: '0.78rem', color: chatName ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.4)', fontWeight: chatName ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {chatName || 'Add a chat name…'}
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.7rem', flexShrink: 0 }}>✎</span>
                </button>
              )}
              {/* Book title — separate click target */}
              <div
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  const b = { title: chat.bookTitle, author: chat.bookAuthor, coverId: chat.coverIdRaw, olKey: chat.bookOlKey, status: null }
                  setDetailBook(b)
                }}
              >
                <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.88rem', fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chat.bookTitle}</div>
                {chat.bookAuthor && <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.45)', marginTop: '0.05rem' }}>{chat.bookAuthor}</div>}
              </div>
            </div>

            {/* ⋯ menu */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <button onClick={e => { e.stopPropagation(); setShowMenu(v => !v) }}
                style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', fontSize: '1.1rem' }}>⋯</button>
              {showMenu && (
                <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: 'var(--rt-white)', borderRadius: 'var(--rt-r3)', border: '1px solid var(--rt-border)', boxShadow: '0 8px 24px rgba(10,15,30,0.18)', zIndex: 10, minWidth: 160, overflow: 'hidden' }}
                  onClick={e => e.stopPropagation()}>
                  <button onClick={async () => {
                    const p = await loadParticipants(chat.id)
                    setParticipants(p); setParticipantsLoaded(true)
                    setShowAddPpl(true); setShowMenu(false)
                  }}
                    style={{ width: '100%', padding: '0.75rem 1rem', background: 'none', border: 'none', textAlign: 'left', fontSize: '0.85rem', color: 'var(--rt-navy)', fontWeight: 600, cursor: 'pointer', borderBottom: '1px solid var(--rt-border)' }}>
                    + Add members
                  </button>
                  {onReport && participants.filter(p => p.userId !== user?.id).map(p => (
                    <button key={p.userId}
                      onClick={() => { onReport({ reportedUserId: p.userId, contentType: 'user', contentId: null }); setShowMenu(false) }}
                      style={{ width: '100%', padding: '0.75rem 1rem', background: 'none', border: 'none', textAlign: 'left', fontSize: '0.85rem', color: 'var(--rt-t2)', fontWeight: 500, cursor: 'pointer', borderBottom: '1px solid var(--rt-border)' }}>
                      Report {p.displayName.split(' ')[0]}
                    </button>
                  ))}
                  <button onClick={() => { setMenuAction('leave'); setShowMenu(false) }}
                    style={{ width: '100%', padding: '0.75rem 1rem', background: 'none', border: 'none', textAlign: 'left', fontSize: '0.85rem', color: '#dc2626', fontWeight: 600, cursor: 'pointer' }}>
                    <IcoDoorExit size={14} color="#dc2626" style={{ marginRight: '0.35rem', verticalAlign: 'middle' }} /> Leave chat
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Confirm dialog */}
          {menuAction && (
            <div style={{ marginTop: '0.65rem', background: 'rgba(255,255,255,0.1)', borderRadius: 'var(--rt-r3)', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ flex: 1, fontSize: '0.8rem', color: '#fff' }}>Leave this chat?</span>
              <button onClick={() => setMenuAction(null)}
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 6, padding: '0.35rem 0.65rem', color: '#fff', fontSize: '0.75rem', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleLeave}
                style={{ background: '#dc2626', border: 'none', borderRadius: 6, padding: '0.35rem 0.65rem', color: '#fff', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>Leave</button>
            </div>
          )}

          {/* Participants row */}
          <div style={{ marginTop: '0.65rem' }}>
            <ParticipantsRow
              participants={participants}
              currentUserId={user?.id}
              onViewProfile={p => onViewProfile?.({ userId: p.userId, displayName: p.displayName, username: p.username, avatarUrl: p.avatarUrl })}
            />
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1rem 0.5rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {messages.length > 0 && (
            <button onClick={() => onLoadEarlier(chat.id)} style={{ alignSelf: 'center', background: 'none', border: '1px solid var(--rt-border-md)', borderRadius: 99, padding: '0.3rem 0.9rem', fontSize: '0.72rem', color: 'var(--rt-t3)', cursor: 'pointer', marginBottom: '0.35rem', flexShrink: 0 }}>
              Load earlier
            </button>
          )}
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--rt-t3)', fontSize: '0.85rem', padding: '2rem' }}>Start the conversation!</div>
          )}

          {messages.map((msg, i) => {
            const isMe      = msg.user_id === user?.id
            const sender    = participants.find(p => p.userId === msg.user_id)
            const name      = sender?.displayName || 'Friend'
            const colour    = avatarColour(msg.user_id)
            const prevMsg   = messages[i - 1]
            const showName  = !isMe && (!prevMsg || prevMsg.user_id !== msg.user_id)
            const bubble    = isMe ? MY_BUBBLE : THEIR_BUBBLE

            return (
              <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', marginBottom: '0.1rem' }}>
                {showName && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.2rem', paddingLeft: '0.25rem' }}>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', background: colour, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.45rem', fontWeight: 700, color: '#fff', flexShrink: 0, overflow: 'hidden' }}>
                      {sender?.avatarUrl ? <img src={sender.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : avatarInitial(name)}
                    </div>
                    <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--rt-t3)' }}>{name}</div>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.3rem', flexDirection: isMe ? 'row-reverse' : 'row', maxWidth: '75%' }}>
                  <div>
                    <div style={{
                      padding: '0.55rem 0.85rem',
                      borderRadius: isMe ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                      background: bubble.bg,
                      color: bubble.color,
                      fontSize: '0.88rem', lineHeight: 1.5,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                    }}>
                      {msg.is_deleted || msg.isDeleted
                        ? <span style={{ opacity: 0.5, fontStyle: 'italic' }}>Message deleted</span>
                        : msg.body
                      }
                    </div>
                    <div style={{ fontSize: '0.6rem', color: 'var(--rt-t3)', marginTop: '0.15rem', textAlign: isMe ? 'right' : 'left', paddingInline: '0.25rem' }}>
                      {timeAgo(msg.created_at || msg.createdAt)}
                    </div>
                  </div>
                  {isMe && !(msg.is_deleted || msg.isDeleted) && (
                    <button onClick={() => onDeleteMessage(chat.id, msg.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.25, fontSize: '0.7rem', color: 'var(--rt-t3)', padding: '0 0.1rem', marginBottom: '1rem' }} title="Delete">×</button>
                  )}
                </div>
              </div>
            )
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="rt-chat-input-row" style={{ background: 'var(--rt-white)', borderTop: '1px solid var(--rt-border)', padding: '0.75rem 1rem', display: 'flex', gap: '0.6rem', alignItems: 'flex-end', flexShrink: 0 }}>
          <textarea
            className="rt-input"
            rows={1}
            style={{ flex: 1, resize: 'none', maxHeight: 120, overflowY: 'auto', lineHeight: 1.4, padding: '0.5rem 0.75rem', fontFamily: 'var(--rt-font-body)', fontSize: '0.9rem' }}
            placeholder="Message…"
            value={msgInput}
            onChange={e => {
              setMsgInput(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
            }}
            onKeyDown={handleKeyDown}
          />
          <button className="rt-submit-btn" onClick={handleSend} disabled={!msgInput.trim()} style={{ flexShrink: 0, marginBottom: 1 }}>Send</button>
        </div>

        {/* Book detail panel */}
        {detailBook && (
          <BookDetailPanel
            book={detailBook}
            location="community-chat"
            user={user}
            existingChatId={findExistingChat(detailBook.olKey)?.id}
            onClose={() => setDetailBook(null)}
            onViewChat={() => setDetailBook(null)}
            onStartChat={() => setDetailBook(null)}
            onAddToTBR={() => setDetailBook(null)}
          />
        )}
      </div>

      {/* Add participants */}
      {showAddPpl && (
        <AddParticipantsModal
          chat={chat}
          friends={friends}
          currentParticipantIds={participantIds}
          onAdd={handleAddParticipants}
          onClose={() => setShowAddPpl(false)}
          onCoverUpdate={(id, coverId, olKey) => updateBook(id, { coverId, _olKey: olKey })}
        />      )}
    </>
  )
}


function PendingInvitesBanner({ pending, onDismissAll, onDismissOne }) {
  const [expanded, setExpanded] = useState(false)
  if (!pending.length) return null
  const label = pending.length === 1
    ? `${pending[0].addresseeName} hasn't accepted yet`
    : `${pending.length} friend requests pending`
  return (
    <div style={{ background: 'var(--rt-surface)', border: '0.5px solid var(--rt-border-md)', borderRadius: 'var(--rt-r3)', marginBottom: '0.75rem', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem 0.85rem', cursor: pending.length > 1 ? 'pointer' : 'default' }}
        onClick={() => pending.length > 1 && setExpanded(v => !v)}>
        <span style={{ flex: 1, fontSize: '0.82rem', color: 'var(--rt-t3)', fontStyle: 'italic' }}>{label}</span>
        {pending.length > 1 && <span style={{ fontSize: '0.65rem', color: 'var(--rt-t3)' }}>{expanded ? '▲' : '▼'}</span>}
        <button onClick={e => { e.stopPropagation(); onDismissAll() }}
          style={{ background: 'none', border: 'none', color: 'var(--rt-t3)', fontSize: '1rem', cursor: 'pointer', padding: '0 0.1rem', lineHeight: 1, flexShrink: 0 }}>×</button>
      </div>
      {expanded && (
        <div style={{ borderTop: '0.5px solid var(--rt-border)', padding: '0.25rem 0' }}>
          {pending.map(p => (
            <div key={p.friendshipId} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.4rem 0.85rem' }}>
              <span style={{ flex: 1, fontSize: '0.8rem', color: 'var(--rt-t2)' }}>{p.addresseeName}</span>
              <button onClick={() => onDismissOne(p.friendshipId)}
                style={{ background: 'none', border: 'none', color: 'var(--rt-t3)', fontSize: '0.9rem', cursor: 'pointer', padding: '0 0.1rem', lineHeight: 1 }}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Chat({ onNavigate, onAddFriend, onOpenChatWithFriend, initialFriendProfile = null, onClearFriendProfile }) {
  const { user }                                 = useAuthContext()
  const { books, addBook, findDuplicate }        = useBooksContext()
  const {
    friends = [], pending = [], outgoingPending = [], feed,
    sendFriendRequest, acceptFriendRequest, declineFriendRequest,
    removeFriend, acceptRecToTBR, generateInviteLink, loaded: socialLoaded,
    submitReport,
  }                                              = useSocialContext()
  const {
    chats = [], messages,
    openThread, closeThread, sendMessage, deleteMessage,
    loadEarlier, startOrOpenChat, totalUnread, markChatRead,
    loadParticipants, updateChatName, addParticipants,
    leaveChat,
  }                                              = useChatContext()

  const [chatTab, setChatTab]                 = useState('chats')
  const swipeRef = useSwipeTabs(CHAT_TABS, chatTab, setChatTab)
  const [addFriendInput, setAddFriendInput]   = useState('')
  const [addFriendMsg, setAddFriendMsg]       = useState(null)
  const [addFriendLoading, setAddFriendLoading] = useState(false)
  const [friendSearchResults, setFriendSearchResults] = useState([])
  const [friendSearching, setFriendSearching] = useState(false)
  const [sentRequests, setSentRequests]       = useState(new Set())
  const friendSearchTimer                     = useRef(null)
  const [dismissedAccepted, setDismissedAccepted] = useState(new Set())
  const [friendSheet, setFriendSheet]         = useState(null)
  const [friendProfileFriend, setFriendProfileFriend] = useState(initialFriendProfile)
  const [addModal, setAddModal]               = useState(false)
  const [activeChatModal, setActiveChatModal] = useState(null)
  const [reportTarget, setReportTarget]       = useState(null)

  function openChatModal(chat) {
    openThread(chat.id)
    markChatRead(chat.id)
    setActiveChatModal(chat)
  }

  function closeChatModal() {
    closeThread()
    setActiveChatModal(null)
  }

  async function handleSend(chatId, body) {
    await sendMessage(chatId, body)
  }

  async function handleAddFriend(e) {
    e.preventDefault()
    const username = addFriendInput.trim().replace(/^@/, '')
    if (!username) return
    setAddFriendLoading(true); setAddFriendMsg(null)
    const { error } = await sendFriendRequest(username)
    if (error) setAddFriendMsg({ type: 'error', text: error })
    else { setAddFriendMsg({ type: 'success', text: `Request sent to @${username}!` }); setAddFriendInput('') }
    setAddFriendLoading(false)
  }

  function handleFriendSearchInput(val) {
    setAddFriendInput(val)
    setAddFriendMsg(null)
    clearTimeout(friendSearchTimer.current)
    if (val.trim().length < 2) { setFriendSearchResults([]); return }
    setFriendSearching(true)
    friendSearchTimer.current = setTimeout(async () => {
      try {
        const { data } = await sb.rpc('search_users', { p_query: val.trim().replace(/^@/, ''), p_current_user_id: user?.id, p_limit: 8 })
        setFriendSearchResults(data || [])
      } catch { setFriendSearchResults([]) }
      setFriendSearching(false)
    }, 350)
  }

  async function sendRequestToUser(username, userId) {
    const { error } = await sendFriendRequest(username)
    if (!error) setSentRequests(prev => new Set([...prev, userId]))
    else setAddFriendMsg({ type: 'error', text: error })
  }


  function findExistingChat(olKey) {
    if (!olKey || !chats) return null
    return chats.find(c => c.bookOlKey === olKey) || null
  }

  // ── Friend profile full page overlay ──
  if (friendProfileFriend) {
    return (
      <FriendProfilePage
        friend={friendProfileFriend}
        chats={chats}
        user={user}
        books={books}
        onBack={() => { setFriendProfileFriend(null); onClearFriendProfile?.() }}
        onStartChat={async b => {
          const chatId = await startOrOpenChat(b.olKey, b.title, b.author, b.coverId, [friendProfileFriend.userId])
          return chatId
        }}
        onOpenChatModal={(chatOrStub) => {
          setFriendProfileFriend(null)
          onClearFriendProfile?.()
          // Accept either a full chat object or a stub with id
          const c = typeof chatOrStub === 'object' && chatOrStub.bookTitle
            ? chatOrStub
            : chats.find(x => x.id === (chatOrStub?.id || chatOrStub))
          if (c) openChatModal(c)
        }}
        onViewChat={chatId => { 
          const c = chats.find(x => x.id === chatId)
          if (c) { 
            setFriendProfileFriend(null)
            onClearFriendProfile?.()
            openChatModal(c) 
          } 
        }}
        onAddToTBR={({ title, author, olKey, coverId }) => addBook({ title, author, status: 'tbr', olKey, coverId })}
        onAddFriend={async f => {
          const result = await sendFriendRequest(f.username || f.userId)
          return result
        }}
      />
    )
  }

  return (
    <div ref={swipeRef} className="rt-page" style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 100px)' }}>
      <ReportSheet
        open={!!reportTarget}
        onClose={() => setReportTarget(null)}
        title="Report"
        onSubmit={async (reason, note) => {
          await submitReport?.({ ...reportTarget, reason, note })
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 1rem' }}>
        <h2 style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.35rem', fontWeight: 600, color: 'var(--rt-navy)', margin: 0 }}>Chat</h2>
        <button onClick={onAddFriend} style={{ background: 'var(--rt-amber-pale)', border: 'none', borderRadius: 99, padding: '0.25rem 0.75rem', fontSize: '0.7rem', fontWeight: 700, color: 'var(--rt-amber)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <span style={{ fontSize: '0.9rem', lineHeight: 1 }}>+</span> Add Friend
        </button>
      </div>


      {/* ── Side A: Outgoing friend requests — collapsed into one banner ── */}
      {(() => {
        const accepted = (outgoingPending || []).filter(op => friends.find(f => f.userId === op.addresseeId) && !dismissedAccepted.has(op.friendshipId))
        const stillPending = (outgoingPending || []).filter(op => !friends.find(f => f.userId === op.addresseeId) && !dismissedAccepted.has(op.friendshipId))

        return (
          <>
            {/* Accepted notifications — one per person */}
            {accepted.map(op => (
              <div key={op.friendshipId} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', background: 'var(--rt-green-pale, #eafaf1)', border: '1.5px solid var(--rt-green, #27ae60)', borderRadius: 'var(--rt-r3)', padding: '0.6rem 0.85rem', marginBottom: '0.5rem', fontSize: '0.82rem' }}>
                <span style={{ color: 'var(--rt-green, #27ae60)', flexShrink: 0 }}>✓</span>
                <span style={{ flex: 1, color: 'var(--rt-navy)', fontWeight: 500 }}>
                  <strong>{op.addresseeName}</strong> accepted your request
                </span>
                <button onClick={() => { onOpenChatWithFriend?.(op.addresseeId); setDismissedAccepted(s => new Set([...s, op.friendshipId])) }}
                  style={{ background: 'var(--rt-navy)', color: '#fff', border: 'none', borderRadius: 99, padding: '0.25rem 0.65rem', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>Message →</button>
                <button onClick={() => setDismissedAccepted(s => new Set([...s, op.friendshipId]))}
                  style={{ background: 'none', border: 'none', color: 'var(--rt-t3)', fontSize: '1rem', cursor: 'pointer', padding: '0 0.1rem', lineHeight: 1 }}>×</button>
              </div>
            ))}

            {/* Pending invites — collapsed into one row */}
            {stillPending.length > 0 && (
              <PendingInvitesBanner
                pending={stillPending}
                onDismissAll={() => setDismissedAccepted(s => new Set([...s, ...stillPending.map(p => p.friendshipId)]))}
                onDismissOne={id => setDismissedAccepted(s => new Set([...s, id]))}
              />
            )}
          </>
        )
      })()}

      {/* Sub-tabs */}
      <div style={{ display: 'flex', borderBottom: '2px solid var(--rt-border)', marginBottom: '1.25rem' }}>
        {[['chats', 'Chat', totalUnread], ['clubs', 'Clubs', 0], ['friends', 'Friends', friends.length]].map(([id, label, count]) => (
          <button
            key={id}
            onClick={() => setChatTab(id)}
            style={{
              flex: 1, fontFamily: 'var(--rt-font-body)', fontSize: '0.88rem',
              fontWeight: chatTab === id ? 600 : 500,
              color: chatTab === id ? 'var(--rt-navy)' : 'var(--rt-t3)',
              background: 'none', border: 'none',
              borderBottom: `2.5px solid ${chatTab === id ? 'var(--rt-amber)' : 'transparent'}`,
              marginBottom: -2, padding: '0.6rem 0.5rem', cursor: 'pointer',
              transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
            }}
          >
            {label}
            {count > 0 && (
              <span style={{ background: chatTab === id ? 'var(--rt-amber)' : 'var(--rt-border-md)', color: chatTab === id ? '#fff' : 'var(--rt-t3)', borderRadius: 99, fontSize: '0.62rem', fontWeight: 700, padding: '0.1em 0.5em', lineHeight: '1.6', transition: 'all 0.15s' }}>{count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── CHATS TAB ── */}
      {chatTab === 'chats' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1 }}>
            {chats.length === 0 ? (
              <div className="rt-card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
                <div style={{ marginBottom: '0.5rem' }}><IcoChat size={36} color="var(--rt-t3)" /></div>
                <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--rt-navy)', marginBottom: '0.35rem' }}>No chats yet</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--rt-t3)' }}>
                  Start a book chat from any book's detail panel, or{' '}
                  <button onClick={() => onAddFriend?.()} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--rt-amber)', fontWeight: 700, fontSize: 'inherit', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}>add a friend</button>
                  {' '}to get started.
                </div>
              </div>
            ) : (
              chats.map(chat => {
                const otherParticipants = (chat.participants || []).filter(p => p.userId !== user?.id)
                return (
                  <div
                    key={chat.id}
                    className="rt-card"
                    style={{ display: 'flex', gap: '0.85rem', alignItems: 'flex-start', cursor: 'pointer', marginBottom: '0.5rem' }}
                    onClick={() => openChatModal(chat)}
                  >
                    <CoverImage
                      coverId={chat.coverIdRaw}
                      olKey={chat.bookOlKey}
                      coverUrl={chat.coverUrl}
                      title={chat.bookTitle}
                      size="M"
                      style={{ borderRadius: 6, flexShrink: 0 }}
                    />
                    <div className="rt-chat-list-body" style={{ flex: 1, minWidth: 0 }}>
                      {/* Top row: chat name + participant avatars */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.1rem' }}>
                        <div style={{ minWidth: 0 }}>
                          {chat.chatName && <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--rt-amber)', marginBottom: '0.1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chat.chatName}</div>}
                          <div className="rt-chat-list-title">{chat.bookTitle}</div>
                        </div>
                        {/* Participant avatars — overlapping */}
                        {otherParticipants.length > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0, marginTop: '0.1rem' }}>
                            {otherParticipants.slice(0, 4).map((p, idx) => (
                              <div key={p.userId} title={p.displayName} style={{ width: 22, height: 22, borderRadius: '50%', background: avatarColour(p.userId), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.5rem', fontWeight: 700, color: '#fff', flexShrink: 0, overflow: 'hidden', border: '2px solid var(--rt-white)', marginLeft: idx === 0 ? 0 : -6, zIndex: otherParticipants.length - idx, position: 'relative' }}>
                                {p.avatarUrl ? <img src={p.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : avatarInitial(p.displayName)}
                              </div>
                            ))}
                            {otherParticipants.length > 4 && <span style={{ fontSize: '0.6rem', color: 'var(--rt-t3)', marginLeft: '0.25rem' }}>+{otherParticipants.length - 4}</span>}
                          </div>
                        )}
                      </div>
                      {chat.bookAuthor && <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)', marginBottom: '0.15rem' }}>{chat.bookAuthor}</div>}
                      {chat.lastMessagePreview && <div className="rt-chat-list-preview">{chat.lastMessagePreview}</div>}
                      {/* Bottom row: timestamp + unread — bottom right */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.4rem', marginTop: '0.3rem' }}>
                        {chat.unread > 0 && <div className="rt-chat-unread">{chat.unread}</div>}
                        {chat.lastMessageAt && <div style={{ fontSize: '0.68rem', color: 'var(--rt-t3)' }}>{timeAgo(chat.lastMessageAt)}</div>}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* ── FRIENDS TAB ── */}
      {chatTab === 'clubs' && (
        <div style={{ flex: 1 }}>
          <Clubs onOpenChatModal={openChatModal} />
        </div>
      )}

      {chatTab === 'friends' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1 }}>
            {pending.length > 0 && (
              <div className="rt-card" style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-amber)', marginBottom: '0.6rem' }}>Friend requests ({pending.length})</div>
                {pending.map(p => (
                  <div key={p.friendshipId} className="rt-pending-request-item">
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: avatarColour(p.requesterId), display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#fff', fontSize: '0.7rem', flexShrink: 0 }}>
                      {avatarInitial(p.requesterName)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--rt-navy)' }}>{p.requesterName}</div>
                      {p.requesterUsername && <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)' }}>@{p.requesterUsername}</div>}
                    </div>
                    <button className="rt-friend-action rt-friend-action--accept" onClick={() => acceptFriendRequest(p.friendshipId)}>Accept</button>
                    <button className="rt-friend-action" onClick={() => declineFriendRequest(p.friendshipId)}>Decline</button>
                  </div>
                ))}
              </div>
            )}

            <div className="rt-card" style={{ marginBottom: '1rem' }}>
              <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.88rem', fontWeight: 700, color: 'var(--rt-navy)', marginBottom: '0.65rem' }}>Add a friend</div>
              <div style={{ position: 'relative' }}>
                <input
                  className="rt-input"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  placeholder="Search by name or @handle…"
                  value={addFriendInput}
                  onChange={e => handleFriendSearchInput(e.target.value)}
                  autoComplete="off"
                />
                {friendSearching && <div style={{ position: 'absolute', right: '0.9rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: 'var(--rt-t3)' }}>Searching…</div>}
              </div>
              {friendSearchResults.length > 0 && (
                <div style={{ border: '0.5px solid var(--rt-border-md)', borderRadius: 'var(--rt-r3)', overflow: 'hidden', marginTop: '0.5rem' }}>
                  {friendSearchResults.map((f, i) => {
                    const alreadyFriend = friends.some(fr => fr.userId === f.id)
                    const sent = sentRequests.has(f.id)
                    return (
                      <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.6rem 0.85rem', borderBottom: i < friendSearchResults.length - 1 ? '0.5px solid var(--rt-border)' : 'none', background: 'var(--rt-white)' }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: avatarColour(f.id), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 700, color: '#fff', flexShrink: 0, overflow: 'hidden' }}>
                          {f.avatar_url ? <img src={f.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : avatarInitial(f.display_name || f.username)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--rt-navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.display_name || f.username}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--rt-t3)' }}>@{f.username}{f.mutual_friends > 0 ? ` · ${f.mutual_friends} mutual` : ''}</div>
                        </div>
                        {alreadyFriend ? (
                          <span style={{ fontSize: '0.72rem', color: 'var(--rt-t3)', fontWeight: 600 }}>Friends</span>
                        ) : (
                          <button
                            onClick={() => sendRequestToUser(f.username, f.id)}
                            disabled={sent}
                            style={{ flexShrink: 0, background: sent ? 'var(--rt-surface)' : 'var(--rt-amber)', color: sent ? 'var(--rt-t3)' : '#fff', border: 'none', borderRadius: 99, padding: '0.25rem 0.75rem', fontSize: '0.72rem', fontWeight: 700, cursor: sent ? 'default' : 'pointer' }}>
                            {sent ? 'Sent ✓' : 'Add'}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
              {addFriendMsg && <p style={{ fontSize: '0.8rem', marginTop: '0.4rem', color: addFriendMsg.type === 'error' ? '#991b1b' : '#166534' }}>{addFriendMsg.text}</p>}
            </div>

            {!socialLoaded ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--rt-t3)', fontSize: '0.85rem' }}>Loading…</div>
            ) : friends.length === 0 ? (
              <div className="rt-card" style={{ textAlign: 'center', padding: '2rem' }}>
                <div style={{ marginBottom: '0.4rem' }}><IcoUsers size={34} color="var(--rt-t3)" /></div>
                <div style={{ fontSize: '0.85rem', color: 'var(--rt-t3)' }}>
                  No friends yet —{' '}
                  <button onClick={() => onAddFriend?.()} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--rt-amber)', fontWeight: 700, fontSize: 'inherit', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}>add one</button>
                  {' '}above or share your invite link.
                </div>
              </div>
            ) : (
              <div className="rt-card">
                {friends.map(f => (
                  <div key={f.userId} className="rt-friend-card" onClick={() => setFriendSheet(f)}>
                    <div className="rt-friend-avatar" style={{ background: avatarColour(f.userId) }}>{avatarInitial(f.displayName)}</div>
                    <div className="rt-friend-info">
                      <div className="rt-friend-name">{f.displayName}</div>
                      {f.username && <div className="rt-friend-sub">@{f.username}</div>}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--rt-t3)' }}>›</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Friend profile sheet */}
      {friendSheet && (
        <FriendProfileSheet
          friend={friendSheet}
          chats={chats}
          user={user}
          books={books}
          onClose={() => setFriendSheet(null)}
          onAddToTBR={({ title, author, olKey, coverId, recId }) => {
            const dup = findDuplicate(title, author)
            if (dup) {
              if (dup.status === 'tbr' || dup.status === 'reading') {
                const label = dup.status === 'tbr' ? 'your To Read list' : 'Currently Reading'
                alert(`"${dup.title}" is already in ${label}.`)
                return
              }
              if (!window.confirm(`You've already read "${dup.title}". Add it again as a reread?`)) return
            }
            addBook({ title, author, status: 'tbr', olKey, coverId, recId })
            setFriendSheet(null)
          }}
          onStartChat={b => {
            startOrOpenChat(b.olKey, b.title, b.author, b.coverId, [friendSheet.userId])
              .then(chatId => {
                if (!chatId) return
                const stub = { id: chatId, bookTitle: b.title, bookAuthor: b.author, coverIdRaw: b.coverId, coverUrl: b.coverUrl || null, bookOlKey: b.olKey }
                const chat = chats.find(c => c.id === chatId) || stub
                setFriendSheet(null)
                openChatModal(chat)
              })
          }}
          onViewChat={chatId => {
            const chat = chats.find(c => c.id === chatId)
            if (chat) { openChatModal(chat) }
            setFriendSheet(null)
          }}
          onOpenChatModal={(chatId, book) => {
            setFriendSheet(null)
            const stub = { id: chatId, bookTitle: book?.title, bookAuthor: book?.author, coverIdRaw: book?.coverId, coverUrl: book?.coverUrl || null, bookOlKey: book?.olKey }
            openChatModal(chats.find(c => c.id === chatId) || stub)
          }}
          onViewProfile={friend => { setFriendProfileFriend(friend) }}
        />
      )}

      {/* Chat thread modal */}
      {activeChatModal && (
        <ChatThreadModal
          chat={activeChatModal}
          user={user}
          friends={friends}
          messages={messages}
          onClose={closeChatModal}
          onSend={handleSend}
          onLoadEarlier={loadEarlier}
          onDeleteMessage={deleteMessage}
          loadParticipants={loadParticipants}
          updateChatName={updateChatName}
          addParticipants={addParticipants}
          findExistingChat={findExistingChat}
          onLeaveChat={leaveChat}
          onReport={(target) => setReportTarget(target)}
        />
      )}

      {addModal && (
        <AddBookModal defaultStatus="tbr" books={books} onAdd={async d => { await addBook(d); setAddModal(false) }} onClose={() => setAddModal(false)} user={user} />
      )}
    </div>
  )
}