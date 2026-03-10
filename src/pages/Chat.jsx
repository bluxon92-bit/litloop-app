import { useState } from 'react'
import { useSocialContext } from '../context/SocialContext'
import { useChatContext } from '../context/ChatContext'
import { useBooksContext } from '../context/BooksContext'
import { useAuthContext } from '../context/AuthContext'
import { avatarColour, avatarInitial, timeAgo } from '../lib/utils'
import BookDetailPanel from '../components/books/BookDetailPanel'
import FriendProfileSheet from '../components/books/FriendProfileSheet'
import AddBookModal from '../components/books/AddBookModal'

// ── Invite strip — shown at the bottom of both tabs ──────────
function InviteStrip({ copied, onCopy }) {
  return (
    <div style={{
      marginTop: '1.25rem',
      background: 'var(--rt-navy)',
      borderRadius: 'var(--rt-r2)',
      padding: '0.9rem 1.1rem',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
    }}>
      <div>
        <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.88rem', fontWeight: 700, color: '#fff' }}>
          Books are better shared.
        </div>
        <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.55)', marginTop: '0.2rem' }}>
          Invite friends to recommend and chat about your favourite stories.
        </div>
      </div>
      <button
        onClick={onCopy}
        style={{
          flexShrink: 0,
          background: 'var(--rt-amber-lt)', color: '#fff',
          border: 'none', borderRadius: 'var(--rt-r3)',
          padding: '0.55rem 1rem',
          fontFamily: 'var(--rt-font-body)', fontSize: '0.82rem', fontWeight: 700,
          cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        {copied ? '✓ Copied!' : 'Copy link'}
      </button>
    </div>
  )
}

export default function Chat({ onNavigate }) {
  const { user }                                 = useAuthContext()
  const { books, addBook }                       = useBooksContext()
  const {
    friends, pending, feed,
    sendFriendRequest, acceptFriendRequest, declineFriendRequest,
    removeFriend, acceptRecToTBR, generateInviteLink, loaded: socialLoaded
  }                                              = useSocialContext()
  const {
    chats, activeChat, messages,
    openThread, closeThread, sendMessage, deleteMessage,
    loadEarlier, startOrOpenChat, totalUnread, markChatRead
  }                                              = useChatContext()

  const [chatTab, setChatTab]                 = useState('chats')  // 'chats' | 'friends'
  const [msgInput, setMsgInput]               = useState('')
  const [addFriendInput, setAddFriendInput]   = useState('')
  const [addFriendMsg, setAddFriendMsg]       = useState(null)
  const [addFriendLoading, setAddFriendLoading] = useState(false)
  const [detailBook, setDetailBook]           = useState(null)
  const [friendSheet, setFriendSheet]         = useState(null)
  const [addModal, setAddModal]               = useState(false)
  const [inviteCopied, setInviteCopied]       = useState(false)

  // ── Chat helpers ──────────────────────────────────────────────
  function handleOpenChat(chat) {
    openThread(chat.id)
    markChatRead(chat.id)
  }

  async function handleSend() {
    const body = msgInput.trim()
    if (!body || !activeChat) return
    setMsgInput('')
    await sendMessage(activeChat.id, body)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  // ── Add friend ────────────────────────────────────────────────
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

  // ── Invite link ───────────────────────────────────────────────
  async function handleCopyInvite() {
    const link = await generateInviteLink()
    if (link) {
      try { await navigator.clipboard.writeText(link) } catch {}
      setInviteCopied(true)
      setTimeout(() => setInviteCopied(false), 2000)
    }
  }

  function findExistingChat(olKey) {
    if (!olKey || !chats) return null
    return chats.find(c => c.bookOlKey === olKey) || null
  }

  // ── Thread view ───────────────────────────────────────────────
  if (activeChat) {
    const participants = activeChat.participantProfiles || []
    const otherUsers   = participants.filter(p => p.userId !== user?.id)

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', background: 'var(--rt-cream)' }}>
        {/* Thread header */}
        <div style={{ background: 'var(--rt-white)', borderBottom: '1px solid var(--rt-border)', padding: '0.85rem 1.1rem', display: 'flex', alignItems: 'center', gap: '0.85rem', flexShrink: 0 }}>
          <button onClick={closeThread} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--rt-navy)', fontSize: '1.1rem', padding: '0.25rem 0.5rem 0.25rem 0', fontWeight: 700 }}>←</button>
          {activeChat.coverSrc
            ? <img src={activeChat.coverSrc} style={{ width: 32, height: 46, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} alt="" />
            : <div style={{ width: 32, height: 46, borderRadius: 4, background: 'var(--rt-surface)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>📖</div>
          }
          <div
            style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
            onClick={() => {
              const chatBook = {
                title: activeChat.bookTitle, author: activeChat.bookAuthor,
                coverId: activeChat.coverIdRaw, olKey: activeChat.bookOlKey, status: null
              }
              setDetailBook(chatBook)
            }}
          >
            <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.9rem', fontWeight: 700, color: 'var(--rt-navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeChat.bookTitle}</div>
            {activeChat.bookAuthor && <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)' }}>{activeChat.bookAuthor}</div>}
          </div>
          {/* Participant avatars */}
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            {otherUsers.slice(0, 3).map(p => (
              <div key={p.userId} title={p.displayName} style={{ width: 24, height: 24, borderRadius: '50%', background: avatarColour(p.userId), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.55rem', fontWeight: 700, color: '#fff' }}>
                {avatarInitial(p.displayName)}
              </div>
            ))}
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {messages.length > 0 && (
            <button onClick={() => loadEarlier(activeChat.id)} style={{ alignSelf: 'center', background: 'none', border: '1px solid var(--rt-border-md)', borderRadius: 99, padding: '0.3rem 0.9rem', fontSize: '0.72rem', color: 'var(--rt-t3)', cursor: 'pointer', marginBottom: '0.5rem' }}>
              Load earlier
            </button>
          )}
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--rt-t3)', fontSize: '0.85rem', padding: '2rem' }}>Start the conversation!</div>
          )}
          {messages.map(msg => {
            const isMe = msg.userId === user?.id
            const colour = avatarColour(msg.userId)
            return (
              <div key={msg.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexDirection: isMe ? 'row-reverse' : 'row' }}>
                {!isMe && (
                  <div title={msg.username} style={{ width: 26, height: 26, borderRadius: '50%', background: colour, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.58rem', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                    {avatarInitial(msg.displayName || msg.username)}
                  </div>
                )}
                <div style={{ maxWidth: '72%' }}>
                  {!isMe && <div style={{ fontSize: '0.62rem', color: 'var(--rt-t3)', marginBottom: '0.15rem', paddingLeft: '0.25rem' }}>{msg.displayName || msg.username}</div>}
                  <div
                    style={{
                      padding: '0.6rem 0.85rem', borderRadius: isMe ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                      background: isMe ? 'var(--rt-navy)' : 'var(--rt-white)',
                      color: isMe ? '#fff' : 'var(--rt-navy)',
                      fontSize: '0.88rem', lineHeight: 1.5,
                      border: isMe ? 'none' : '1px solid var(--rt-border)',
                      boxShadow: 'var(--rt-s1)'
                    }}
                  >
                    {msg.isDeleted
                      ? <span style={{ opacity: 0.5, fontStyle: 'italic' }}>Message deleted</span>
                      : msg.body
                    }
                  </div>
                  <div style={{ fontSize: '0.6rem', color: 'var(--rt-t3)', marginTop: '0.15rem', textAlign: isMe ? 'right' : 'left', paddingInline: '0.25rem' }}>{timeAgo(msg.createdAt)}</div>
                </div>
                {isMe && !msg.isDeleted && (
                  <button onClick={() => deleteMessage(activeChat.id, msg.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.3, fontSize: '0.7rem', color: 'var(--rt-t3)', padding: '0 0.1rem', alignSelf: 'flex-start', marginTop: '0.25rem' }} title="Delete">×</button>
                )}
              </div>
            )
          })}
        </div>

        {/* Input */}
        <div style={{ background: 'var(--rt-white)', borderTop: '1px solid var(--rt-border)', padding: '0.75rem 1.1rem', display: 'flex', gap: '0.6rem', flexShrink: 0 }}>
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

        {/* Book detail from thread header click */}
        {detailBook && (
          <BookDetailPanel
            book={detailBook}
            location="community-chat"
            user={user}
            existingChatId={findExistingChat(detailBook.olKey)?.id}
            onClose={() => setDetailBook(null)}
            onAddToTBR={() => { addBook({ title: detailBook.title, author: detailBook.author, status: 'tbr', olKey: detailBook.olKey, coverId: detailBook.coverId }); setDetailBook(null) }}
            onViewChat={() => setDetailBook(null)}
          />
        )}
      </div>
    )
  }

  // ── List view ─────────────────────────────────────────────────
  return (
    <div style={{ padding: '1.5rem', maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 100px)' }}>
      <h2 style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.6rem', fontWeight: 700, color: 'var(--rt-navy)', margin: '0 0 1.25rem' }}>Chat</h2>

      {/* ── Full-width sub-tabs ── */}
      <div style={{
        display: 'flex', borderBottom: '2px solid var(--rt-border)',
        marginBottom: '1.25rem',
      }}>
        {[
          ['chats', 'Chat', totalUnread],
          ['friends', 'Friends', friends.length],
        ].map(([id, label, count]) => (
          <button
            key={id}
            onClick={() => setChatTab(id)}
            style={{
              flex: 1,
              fontFamily: 'var(--rt-font-body)',
              fontSize: '0.88rem',
              fontWeight: chatTab === id ? 700 : 500,
              color: chatTab === id ? 'var(--rt-navy)' : 'var(--rt-t3)',
              background: 'none',
              border: 'none',
              borderBottom: `2.5px solid ${chatTab === id ? 'var(--rt-amber)' : 'transparent'}`,
              marginBottom: -2,
              padding: '0.6rem 0.5rem',
              cursor: 'pointer',
              transition: 'all 0.15s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
            }}
          >
            {label}
            {count > 0 && (
              <span style={{
                background: chatTab === id ? 'var(--rt-amber)' : 'var(--rt-border-md)',
                color: chatTab === id ? '#fff' : 'var(--rt-t3)',
                borderRadius: 99, fontSize: '0.62rem', fontWeight: 700,
                padding: '0.1em 0.5em', lineHeight: '1.6',
                transition: 'all 0.15s',
              }}>{count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── CHATS ── */}
      {chatTab === 'chats' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1 }}>
            {chats.length === 0 ? (
              <div className="rt-card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
                <div style={{ fontSize: '2.2rem', marginBottom: '0.5rem' }}>💬</div>
                <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--rt-navy)', marginBottom: '0.35rem' }}>No chats yet</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--rt-t3)' }}>Start a book chat from any book's detail panel.</div>
              </div>
            ) : (
              chats.map(chat => {
                const coverSrc = chat.coverIdRaw
                  ? `https://covers.openlibrary.org/b/id/${chat.coverIdRaw}-S.jpg`
                  : chat.bookOlKey
                    ? `https://covers.openlibrary.org/b/olid/${chat.bookOlKey.replace('/works/','')}-S.jpg`
                    : null
                return (
                  <div
                    key={chat.id}
                    className="rt-card"
                    style={{ display: 'flex', gap: '0.85rem', alignItems: 'center', cursor: 'pointer', marginBottom: '0.5rem' }}
                    onClick={() => handleOpenChat(chat)}
                  >
                    {coverSrc
                      ? <img src={coverSrc} className="rt-chat-list-cover" alt="" onError={e => e.target.style.display='none'} />
                      : <div className="rt-chat-list-cover--ph">📖</div>
                    }
                    <div className="rt-chat-list-body">
                      <div className="rt-chat-list-title">{chat.bookTitle}</div>
                      {chat.bookAuthor && <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)', marginBottom: '0.15rem' }}>{chat.bookAuthor}</div>}
                      {chat.lastMessagePreview && (
                        <div className="rt-chat-list-preview">{chat.lastMessagePreview}</div>
                      )}
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
          {/* Invite strip — bottom of Chats tab */}
          <InviteStrip copied={inviteCopied} onCopy={handleCopyInvite} />
        </div>
      )}

      {/* ── FRIENDS ── */}
      {chatTab === 'friends' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1 }}>
            {/* Pending requests */}
            {pending.length > 0 && (
              <div className="rt-card" style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--rt-amber)', marginBottom: '0.6rem' }}>
                  Friend requests ({pending.length})
                </div>
                {pending.map(p => (
                  <div key={p.id} className="rt-pending-request-item">
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: avatarColour(p.id), display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#fff', fontSize: '0.7rem', flexShrink: 0 }}>
                      {avatarInitial(p.displayName || p.username)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--rt-navy)' }}>{p.displayName || p.username}</div>
                      {p.username && <div style={{ fontSize: '0.72rem', color: 'var(--rt-t3)' }}>@{p.username}</div>}
                    </div>
                    <button className="rt-friend-action rt-friend-action--accept" onClick={() => acceptFriendRequest(p.friendshipId)}>Accept</button>
                    <button className="rt-friend-action" onClick={() => declineFriendRequest(p.friendshipId)}>Decline</button>
                  </div>
                ))}
              </div>
            )}

            {/* Add friend — fixed layout: input grows, button compact */}
            <div className="rt-card" style={{ marginBottom: '1rem' }}>
              <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '0.88rem', fontWeight: 700, color: 'var(--rt-navy)', marginBottom: '0.65rem' }}>Add a friend</div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  className="rt-input"
                  style={{ flex: 1, minWidth: 0 }}
                  placeholder="@username"
                  value={addFriendInput}
                  onChange={e => setAddFriendInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddFriend(e) }}
                />
                <button
                  onClick={handleAddFriend}
                  disabled={addFriendLoading}
                  style={{
                    flexShrink: 0,
                    background: 'var(--rt-navy)', color: '#fff',
                    border: 'none', borderRadius: 'var(--rt-r3)',
                    padding: '0.7rem 1.25rem',
                    fontFamily: 'var(--rt-font-body)', fontSize: '0.88rem',
                    fontWeight: 700, cursor: addFriendLoading ? 'default' : 'pointer',
                    opacity: addFriendLoading ? 0.6 : 1,
                  }}
                >
                  {addFriendLoading ? '…' : 'Add'}
                </button>
              </div>
              {addFriendMsg && (
                <p style={{ fontSize: '0.8rem', marginTop: '0.4rem', color: addFriendMsg.type === 'error' ? '#991b1b' : '#166534' }}>{addFriendMsg.text}</p>
              )}
            </div>

            {/* Friends list */}
            {!socialLoaded ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--rt-t3)', fontSize: '0.85rem' }}>Loading…</div>
            ) : friends.length === 0 ? (
              <div className="rt-card" style={{ textAlign: 'center', padding: '2rem' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.4rem' }}>👋</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--rt-t3)' }}>No friends yet — add one above or share your invite link.</div>
              </div>
            ) : (
              <div className="rt-card">
                {friends.map(f => (
                  <div key={f.userId} className="rt-friend-card" onClick={() => setFriendSheet(f)}>
                    <div className="rt-friend-avatar" style={{ background: avatarColour(f.userId) }}>
                      {avatarInitial(f.displayName)}
                    </div>
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

          {/* Invite strip — bottom of Friends tab */}
          <InviteStrip copied={inviteCopied} onCopy={handleCopyInvite} />
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
          onAddToTBR={({ title, author, olKey, coverId }) => {
            addBook({ title, author, status: 'tbr', olKey, coverId })
            setFriendSheet(null)
          }}
          onStartChat={b => {
            startOrOpenChat(b.olKey, b.title, b.author, b.coverId, [friendSheet.userId])
            setFriendSheet(null)
          }}
          onViewChat={chatId => {
            const chat = chats.find(c => c.id === chatId)
            if (chat) handleOpenChat(chat)
            setFriendSheet(null)
          }}
          onNavigateChat={() => setFriendSheet(null)}
        />
      )}

      {/* Add book modal */}
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
