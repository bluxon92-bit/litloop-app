import { useState, useEffect, useRef } from 'react'
import { useSocialContext } from '../context/SocialContext'
import { useChatContext } from '../context/ChatContext'
import { useBooksContext } from '../context/BooksContext'
import { useAuthContext } from '../context/AuthContext'
import { avatarColour, avatarInitial, timeAgo } from '../lib/utils'
import BookDetailPanel from '../components/books/BookDetailPanel'
import FriendProfileSheet from '../components/books/FriendProfileSheet'
import AddBookModal from '../components/books/AddBookModal'
import { IcoOpenBook, IcoChat, IcoDoorExit, IcoUsers } from '../components/icons'

// ── Colours ───────────────────────────────────────────────────
const MY_BUBBLE    = { bg: '#DEF0FF', color: '#1a2744' }   // pale blue
const THEIR_BUBBLE = { bg: '#F5F0E8', color: '#1a2744' }   // pale cream


// ── Participant avatars row ───────────────────────────────────
function ParticipantsRow({ participants, currentUserId, onAdd }) {
  const [expanded, setExpanded] = useState(false)
  const others = participants.filter(p => p.userId !== currentUserId)
  const MAX_SHOW = 3
  const visible  = others.slice(0, MAX_SHOW)
  const overflow = others.length - MAX_SHOW

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'nowrap' }}>
        {visible.map(p => (
          <div
            key={p.userId}
            title={p.displayName}
            style={{
              width: 22, height: 22, borderRadius: '50%',
              background: avatarColour(p.userId),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.5rem', fontWeight: 700, color: '#fff',
              border: '1.5px solid rgba(255,255,255,0.3)', flexShrink: 0,
            }}
          >{avatarInitial(p.displayName)}</div>
        ))}
        {overflow > 0 && (
          <button
            onClick={() => setExpanded(e => !e)}
            style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 99, padding: '0.1rem 0.45rem', fontSize: '0.58rem', fontWeight: 700, color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >+{overflow}</button>
        )}
        <button
          onClick={onAdd}
          style={{ marginLeft: '0.2rem', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 99, padding: '0.15rem 0.5rem', fontSize: '0.6rem', fontWeight: 700, color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }}
        >+ Add</button>
      </div>

      {/* Expanded participant list */}
      {expanded && others.length > MAX_SHOW && (
        <div
          onClick={() => setExpanded(false)}
          style={{
            position: 'absolute', top: '100%', left: 0, zIndex: 10, marginTop: '0.35rem',
            background: 'var(--rt-white)', borderRadius: 'var(--rt-r3)',
            border: '1px solid var(--rt-border-md)', boxShadow: 'var(--rt-s2)',
            padding: '0.5rem 0.75rem', minWidth: 160,
          }}
        >
          {others.map(p => (
            <div key={p.userId} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0' }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', background: avatarColour(p.userId), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.5rem', fontWeight: 700, color: '#fff', flexShrink: 0 }}>{avatarInitial(p.displayName)}</div>
              <span style={{ fontSize: '0.78rem', color: 'var(--rt-navy)', fontWeight: 500 }}>{p.displayName}</span>
              {p.username && <span style={{ fontSize: '0.65rem', color: 'var(--rt-t3)' }}>@{p.username}</span>}
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
          <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.95rem', fontWeight: 700, color: 'var(--rt-navy)' }}>Add to chat</div>
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
export function ChatThreadModal({ chat, user, friends, messages, onClose, onSend, onLoadEarlier, onDeleteMessage, loadParticipants, updateChatName, addParticipants, findExistingChat, onLeaveChat, onDeleteChat }) {
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

  const coverSrc = chat.coverIdRaw
    ? `https://covers.openlibrary.org/b/id/${chat.coverIdRaw}-S.jpg`
    : chat.bookOlKey
      ? `https://covers.openlibrary.org/b/olid/${chat.bookOlKey.replace('/works/', '')}-S.jpg`
      : null

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
              onAdd={async () => {
                // Always ensure fresh participants before opening add modal
                const p = await loadParticipants(chat.id)
                setParticipants(p)
                setParticipantsLoaded(true)
                setShowAddPpl(true)
              }}
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
                    <div style={{ width: 18, height: 18, borderRadius: '50%', background: colour, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.45rem', fontWeight: 700, color: '#fff', flexShrink: 0 }}>{avatarInitial(name)}</div>
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
        <div className="rt-chat-input-row" style={{ background: 'var(--rt-white)', borderTop: '1px solid var(--rt-border)', padding: '0.75rem 1rem', display: 'flex', gap: '0.6rem', flexShrink: 0 }}>
          <input
            className="rt-input"
            style={{ flex: 1 }}
            placeholder="Message…"
            value={msgInput}
            onChange={e => setMsgInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button className="rt-submit-btn" onClick={handleSend} disabled={!msgInput.trim()}>Send</button>
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

// ── Main Chat page ────────────────────────────────────────────
export default function Chat({ onNavigate, onAddFriend, onOpenChatWithFriend }) {
  const { user }                                 = useAuthContext()
  const { books, addBook, findDuplicate }        = useBooksContext()
  const {
    friends = [], pending = [], outgoingPending = [], feed,
    sendFriendRequest, acceptFriendRequest, declineFriendRequest,
    removeFriend, acceptRecToTBR, generateInviteLink, loaded: socialLoaded
  }                                              = useSocialContext()
  const {
    chats = [], messages,
    openThread, closeThread, sendMessage, deleteMessage,
    loadEarlier, startOrOpenChat, totalUnread, markChatRead,
    loadParticipants, updateChatName, addParticipants,
    leaveChat,
  }                                              = useChatContext()

  const [chatTab, setChatTab]                 = useState('chats')
  const [addFriendInput, setAddFriendInput]   = useState('')
  const [addFriendMsg, setAddFriendMsg]       = useState(null)
  const [addFriendLoading, setAddFriendLoading] = useState(false)
  const [dismissedAccepted, setDismissedAccepted] = useState(new Set()) // friendshipIds dismissed by user
  const [friendSheet, setFriendSheet]         = useState(null)
  const [addModal, setAddModal]               = useState(false)
  const [activeChatModal, setActiveChatModal] = useState(null)  // chat object for modal

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


  function findExistingChat(olKey) {
    if (!olKey || !chats) return null
    return chats.find(c => c.bookOlKey === olKey) || null
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 100px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 1.25rem' }}>
        <h2 style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.6rem', fontWeight: 700, color: 'var(--rt-navy)', margin: 0 }}>Chat</h2>
        <button onClick={onAddFriend} style={{ background: 'var(--rt-amber-pale)', border: 'none', borderRadius: 99, padding: '0.25rem 0.75rem', fontSize: '0.7rem', fontWeight: 700, color: 'var(--rt-amber)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <span style={{ fontSize: '0.9rem', lineHeight: 1 }}>+</span> Add Friend
        </button>
      </div>


      {/* ── Side A: Outgoing friend request banners ── */}
      {(outgoingPending || []).map(op => {
        const justAccepted = friends.find(f => f.userId === op.addresseeId)
        const dismissed    = dismissedAccepted.has(op.friendshipId)
        if (justAccepted && dismissed) return null

        if (justAccepted) {
          // Show "accepted" banner — dismissed per session
          return (
            <div key={op.friendshipId} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', background: 'var(--rt-green-pale, #eafaf1)', border: '1.5px solid var(--rt-green, #27ae60)', borderRadius: 'var(--rt-r3)', padding: '0.6rem 0.85rem', marginBottom: '0.75rem', fontSize: '0.82rem' }}>
              <span style={{ color: 'var(--rt-green, #27ae60)', fontSize: '1rem', flexShrink: 0 }}>✓</span>
              <span style={{ flex: 1, color: 'var(--rt-navy)', fontWeight: 500 }}>
                <strong>{op.addresseeName}</strong> accepted your request — send them a message
              </span>
              <button
                onClick={() => { onOpenChatWithFriend?.(op.addresseeId); setDismissedAccepted(s => new Set([...s, op.friendshipId])) }}
                style={{ background: 'var(--rt-navy)', color: '#fff', border: 'none', borderRadius: 99, padding: '0.25rem 0.65rem', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}
              >Message →</button>
              <button
                onClick={() => setDismissedAccepted(s => new Set([...s, op.friendshipId]))}
                style={{ background: 'none', border: 'none', color: 'var(--rt-t3)', fontSize: '1rem', cursor: 'pointer', padding: '0 0.1rem', lineHeight: 1, flexShrink: 0 }}
                aria-label="Dismiss"
              >×</button>
            </div>
          )
        }

        // Still pending
        return (
          <div key={op.friendshipId} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', background: 'var(--rt-surface)', border: '1.5px solid var(--rt-border)', borderRadius: 'var(--rt-r3)', padding: '0.6rem 0.85rem', marginBottom: '0.75rem', fontSize: '0.82rem' }}>
            <span style={{ flex: 1, color: 'var(--rt-t3)', fontStyle: 'italic' }}>
              <strong style={{ color: 'var(--rt-navy)', fontStyle: 'normal' }}>{op.addresseeName}</strong> hasn't accepted yet
            </span>
          </div>
        )
      })}

      {/* Sub-tabs */}
      <div style={{ display: 'flex', borderBottom: '2px solid var(--rt-border)', marginBottom: '1.25rem' }}>
        {[['chats', 'Chat', totalUnread], ['friends', 'Friends', friends.length]].map(([id, label, count]) => (
          <button
            key={id}
            onClick={() => setChatTab(id)}
            style={{
              flex: 1, fontFamily: 'var(--rt-font-body)', fontSize: '0.88rem',
              fontWeight: chatTab === id ? 700 : 500,
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
                <div style={{ fontSize: '0.8rem', color: 'var(--rt-t3)' }}>Start a book chat from any book's detail panel.</div>
              </div>
            ) : (
              chats.map(chat => {
                const coverSrc = chat.coverIdRaw
                  ? `https://covers.openlibrary.org/b/id/${chat.coverIdRaw}-S.jpg`
                  : chat.bookOlKey
                    ? `https://covers.openlibrary.org/b/olid/${chat.bookOlKey.replace('/works/', '')}-S.jpg`
                    : null
                return (
                  <div
                    key={chat.id}
                    className="rt-card"
                    style={{ display: 'flex', gap: '0.85rem', alignItems: 'center', cursor: 'pointer', marginBottom: '0.5rem' }}
                    onClick={() => openChatModal(chat)}
                  >
                    {coverSrc
                      ? <img src={coverSrc} className="rt-chat-list-cover" alt="" onError={e => e.target.style.display='none'} />
                      : <div className="rt-chat-list-cover--ph"><IcoOpenBook size={20} color="var(--rt-t3)" /></div>
                    }
                    <div className="rt-chat-list-body">
                      {chat.chatName && <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--rt-amber)', marginBottom: '0.1rem' }}>{chat.chatName}</div>}
                      <div className="rt-chat-list-title">{chat.bookTitle}</div>
                      {chat.bookAuthor && <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)', marginBottom: '0.15rem' }}>{chat.bookAuthor}</div>}
                      {chat.lastMessagePreview && <div className="rt-chat-list-preview">{chat.lastMessagePreview}</div>}
                    </div>
                    <div className="rt-chat-list-meta">
                      {chat.lastMessageAt && <div>{timeAgo(chat.lastMessageAt)}</div>}
                      {chat.unread > 0 && <div className="rt-chat-unread">{chat.unread}</div>}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* ── FRIENDS TAB ── */}
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
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input className="rt-input" style={{ flex: 1, minWidth: 0 }} placeholder="@username" value={addFriendInput} onChange={e => setAddFriendInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAddFriend(e) }} />
                <button onClick={handleAddFriend} disabled={addFriendLoading} style={{ flexShrink: 0, background: 'var(--rt-navy)', color: '#fff', border: 'none', borderRadius: 'var(--rt-r3)', padding: '0.7rem 1.25rem', fontFamily: 'var(--rt-font-body)', fontSize: '0.88rem', fontWeight: 700, cursor: addFriendLoading ? 'default' : 'pointer', opacity: addFriendLoading ? 0.6 : 1 }}>
                  {addFriendLoading ? '…' : 'Add'}
                </button>
              </div>
              {addFriendMsg && <p style={{ fontSize: '0.8rem', marginTop: '0.4rem', color: addFriendMsg.type === 'error' ? '#991b1b' : '#166534' }}>{addFriendMsg.text}</p>}
            </div>

            {!socialLoaded ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--rt-t3)', fontSize: '0.85rem' }}>Loading…</div>
            ) : friends.length === 0 ? (
              <div className="rt-card" style={{ textAlign: 'center', padding: '2rem' }}>
                <div style={{ marginBottom: '0.4rem' }}><IcoUsers size={34} color="var(--rt-t3)" /></div>
                <div style={{ fontSize: '0.85rem', color: 'var(--rt-t3)' }}>No friends yet — add one above or share your invite link.</div>
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
                const stub = { id: chatId, bookTitle: b.title, bookAuthor: b.author, coverIdRaw: b.coverId, bookOlKey: b.olKey }
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
            const stub = { id: chatId, bookTitle: book?.title, bookAuthor: book?.author, coverIdRaw: book?.coverId, bookOlKey: book?.olKey }
            openChatModal(chats.find(c => c.id === chatId) || stub)
          }}
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
        />
      )}

      {addModal && (
        <AddBookModal defaultStatus="tbr" books={books} onAdd={async d => { await addBook(d); setAddModal(false) }} onClose={() => setAddModal(false)} user={user} />
      )}
    </div>
  )
}