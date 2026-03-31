import { useState, useEffect } from 'react'
import { sb } from '../../lib/supabase'
import { avatarColour, avatarInitial, fmtDate, timeAgo } from '../../lib/utils'
import BookDetailPanel from './BookDetailPanel'
import CoverImage from './CoverImage'
import { IcoOpenBook, IcoChat } from '../../components/icons'

export default function FriendProfileSheet({ friend, chats, user, books: myBooks, onClose, onAddToTBR, onStartChat, onViewChat, onOpenChatModal, onViewProfile }) {
  const [entries, setEntries]         = useState(null)
  const [recs, setRecs]               = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)
  const [detailBook, setDetailBook]   = useState(null)
  const [showAllChats, setShowAllChats]         = useState(false)
  const [showAllReading, setShowAllReading]     = useState(false)
  const [showAllMutual, setShowAllMutual]       = useState(false)

  useEffect(() => { if (friend) loadFriendData() }, [friend?.userId])

  async function loadFriendData() {
    setLoading(true); setError(null)
    try {
      let entryData = []
      const rpcRes = await sb.rpc('get_friend_reading_entries', { p_user_id: friend.userId })
      if (!rpcRes.error && Array.isArray(rpcRes.data)) {
        entryData = rpcRes.data
      } else {
        const { data } = await sb.from('reading_entries')
          .select('status, books(title, author, cover_id, ol_key), title_manual, author_manual')
          .eq('user_id', friend.userId)
        entryData = data || []
      }
      const { data: recsData } = await sb.from('book_recommendations')
        .select('id, book_ol_key, book_title, book_author, cover_id, message, status, created_at')
        .eq('from_user_id', friend.userId).eq('to_user_id', user.id)
        .order('created_at', { ascending: false })

      setEntries(entryData.map(e => ({
        title:   e.books?.title    || e.title_manual  || '',
        author:  e.books?.author   || e.author_manual || '',
        coverId: e.books?.cover_id || null,
        olKey:   e.books?.ol_key   || null,
        status:  e.status
      })))
      setRecs((recsData || []).filter(r => r.status === 'pending'))
    } catch(e) {
      setError('Could not load data.')
    }
    setLoading(false)
  }

  function existingChat(olKey) { return olKey && chats ? chats.find(c => c.bookOlKey === olKey) : null }
  function onMyList(title, olKey) { return myBooks.some(b => (olKey && b.olKey === olKey) || b.title?.toLowerCase() === title?.toLowerCase()) }

  const readBooks    = entries?.filter(b => b.status === 'read')    || []
  const readingBooks = entries?.filter(b => b.status === 'reading') || []
  const myReadSet    = new Set(myBooks.filter(b => b.status === 'read').map(b => b.title?.toLowerCase()))
  const mutualBooks  = readBooks.filter(b => myReadSet.has(b.title?.toLowerCase()))

  // Chats with this friend — sorted by most recent activity
  const friendChats = (chats || [])
    .filter(c => (c.participantIds || []).includes(friend.userId))
    .sort((a, b) => (b.lastMessageAt || '') > (a.lastMessageAt || '') ? 1 : -1)

  const colour = avatarColour(friend.userId)
  const init   = avatarInitial(friend.displayName)
  const avatarUrl = friend.avatarUrl || null

  /* ── Reusable inner components ── */
  function SLabel({ children, accent }) {
    return <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: accent || 'var(--rt-t3)', marginBottom: '0.45rem', marginTop: '1rem' }}>{children}</div>
  }

  function SeeAllBtn({ count, shown, onToggle }) {
    if (count <= 3) return null
    return (
      <button onClick={onToggle} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--rt-amber)', fontWeight: 700, padding: '0.4rem 0', display: 'block' }}>
        {shown ? 'Show less ↑' : `See all (${count}) ↓`}
      </button>
    )
  }

  function BookRow({ b, actions }) {
    const src = b.coverId ? `https://covers.openlibrary.org/b/id/${b.coverId}-S.jpg` : null
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.45rem 0', borderBottom: '1px solid var(--rt-border)' }}>
        <div onClick={() => setDetailBook(b)} style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flex: 1, minWidth: 0, cursor: 'pointer' }}>
          {src
            ? <img src={src} style={{ width: 28, height: 42, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} alt="" onError={e => e.target.style.display='none'} />
            : <div style={{ width: 28, height: 42, borderRadius: 4, background: 'var(--rt-surface)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IcoOpenBook size={16} color="var(--rt-t3)" /></div>
          }
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--rt-navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</div>
            {b.author && <div style={{ fontSize: '0.68rem', color: 'var(--rt-t3)' }}>{b.author}</div>}
          </div>
        </div>
        {actions && <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }}>{actions}</div>}
      </div>
    )
  }

  /* ── Drilled-in book view ── */
  if (detailBook) {
    const chat = existingChat(detailBook.olKey)
    return (
      <BookDetailPanel
        book={detailBook}
        location="home-feed"
        user={user}
        existingChatId={chat?.id || null}
        onClose={() => setDetailBook(null)}
        onAddToTBR={() => {
          onAddToTBR({ title: detailBook.title, author: detailBook.author, olKey: detailBook.olKey, coverId: detailBook.coverId })
          setDetailBook(null)
        }}
        onOpenChatModal={(chatId, book) => {
          setDetailBook(null)
          onOpenChatModal ? onOpenChatModal(chatId, book) : onStartChat(detailBook)
        }}
        onViewChat={() => { if (chat) onViewChat(chat.id); setDetailBook(null) }}
        onMarkFinished={() => setDetailBook(null)}
        onStartReading={() => setDetailBook(null)}
        onEdit={() => setDetailBook(null)}
        onRecommend={() => setDetailBook(null)}
      />
    )
  }

  /* ── Main friend sheet ── */
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(10,15,30,0.55)', zIndex: 504 }} />

      <div className="rt-fp-sheet-inner" style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 505,
        background: 'var(--rt-white)', borderRadius: '20px 20px 0 0',
        boxShadow: '0 -8px 40px rgba(10,15,30,0.18)',
        maxHeight: '92vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        maxWidth: 480, margin: '0 auto',
      }}>
        <style>{`
          @media (min-width: 640px) {
            .rt-fp-sheet-inner {
              top: 50% !important; left: 50% !important;
              transform: translate(-50%, -50%) !important;
              bottom: auto !important; right: auto !important;
              border-radius: var(--rt-r2) !important;
              width: 480px !important;
            }
          }
        `}</style>

        <div style={{ width: 36, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.2)', margin: '10px auto 0', flexShrink: 0 }} />

        {/* Navy hero */}
        <div style={{ background: 'linear-gradient(160deg, var(--rt-navy), #2A4A6B)', padding: '1.1rem 1.1rem 1.1rem', flexShrink: 0, position: 'relative' }}>
          <button onClick={onClose} style={{ position: 'absolute', top: '0.7rem', right: '0.7rem', background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%', width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.95rem', color: 'rgba(255,255,255,0.7)', cursor: 'pointer' }}>×</button>

          <div style={{ width: 46, height: 46, borderRadius: '50%', background: colour, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.15rem', fontWeight: 700, color: '#fff', marginBottom: '0.6rem', border: '2px solid rgba(255,255,255,0.2)', overflow: 'hidden' }}>
            {avatarUrl ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : init}
          </div>
          <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>{friend.displayName}</div>
          {friend.username && <div style={{ fontSize: '0.73rem', color: 'rgba(255,255,255,0.45)', marginTop: '0.1rem' }}>@{friend.username}</div>}
          {!loading && entries && (
            <div style={{ display: 'flex', gap: '1.1rem', marginTop: '0.7rem' }}>
              {[[readBooks.length,'books read'],[readingBooks.length,'reading now'],[mutualBooks.length,'in common']].map(([n, l]) => (
                <div key={l}>
                  <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.1rem', fontWeight: 600, color: 'var(--rt-amber-lt)' }}>{n}</div>
                  <div style={{ fontSize: '0.57rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{l}</div>
                </div>
              ))}
            </div>
          )}

          {/* View full profile button */}
          {onViewProfile && (
            <button
              onClick={() => { onClose(); onViewProfile(friend) }}
              style={{
                marginTop: '0.85rem',
                background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)',
                borderRadius: 99, padding: '0.35rem 0.85rem',
                fontSize: '0.72rem', fontWeight: 700, color: '#fff',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem',
                width: 'fit-content',
              }}
            >
              View full profile →
            </button>
          )}
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '0 1.1rem 0.5rem' }}>
          {loading && <div style={{ textAlign: 'center', color: 'var(--rt-t3)', padding: '2rem', fontSize: '0.83rem' }}>Loading…</div>}
          {error && <div style={{ color: '#991b1b', fontSize: '0.83rem', padding: '1rem' }}>{error}</div>}
          {!loading && !error && <>

            {/* ── Chats together ── */}
            {friendChats.length > 0 && (
              <>
                <SLabel>Chats together ({friendChats.length})</SLabel>
                {(showAllChats ? friendChats : friendChats.slice(0, 3)).map(c => (
                  <div key={c.id}
                    onClick={() => { onViewChat?.(c.id); onClose() }}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.5rem 0.65rem', borderRadius: 'var(--rt-r3)', background: 'var(--rt-surface)', border: '1px solid var(--rt-border)', marginBottom: '0.35rem', cursor: 'pointer' }}
                  >
                    {/* Book cover */}
                    <div style={{ width: 28, height: 42, borderRadius: 4, overflow: 'hidden', flexShrink: 0, background: 'var(--rt-border)' }}>
                      {(c.coverIdRaw || c.bookOlKey) && (
                        <img
                          src={c.coverIdRaw ? `https://covers.openlibrary.org/b/id/${c.coverIdRaw}-S.jpg` : `https://covers.openlibrary.org/b/olid/${(c.bookOlKey||'').replace('/works/','')}-S.jpg`}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt=""
                          onError={e => e.target.style.display='none'}
                        />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {c.chatName && <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--rt-amber)', marginBottom: '0.1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.chatName}</div>}
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--rt-navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.bookTitle || 'Chat'}</div>
                      {c.lastMessagePreview && <div style={{ fontSize: '0.68rem', color: 'var(--rt-t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.lastMessagePreview}</div>}
                    </div>
                    {c.unread > 0 && <div style={{ background: 'var(--rt-amber)', color: '#fff', borderRadius: 99, fontSize: '0.6rem', fontWeight: 700, padding: '0.1em 0.45em', flexShrink: 0 }}>{c.unread}</div>}
                    <span style={{ fontSize: '0.68rem', color: 'var(--rt-t3)', flexShrink: 0 }}>{c.lastMessageAt ? timeAgo(c.lastMessageAt) : '→'}</span>
                  </div>
                ))}
                <SeeAllBtn count={friendChats.length} shown={showAllChats} onToggle={() => setShowAllChats(v => !v)} />
              </>
            )}

            {/* ── Recommendations ── */}
            {recs.length > 0 && (
              <>
                <SLabel accent="var(--rt-amber)">Recommended for you ({recs.length})</SLabel>
                {recs.map(r => {
                  const rTitle = r.book_title || r.book_ol_key || 'A book'
                  const b = { title: rTitle, author: r.book_author || '', coverId: r.cover_id, olKey: r.book_ol_key }
                  const src = r.cover_id ? `https://covers.openlibrary.org/b/id/${r.cover_id}-S.jpg` : r.book_ol_key ? `https://covers.openlibrary.org/b/olid/${r.book_ol_key.replace('/works/','')}-S.jpg` : null
                  return (
                    <div key={r.id} onClick={() => setDetailBook(b)} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.45rem 0.6rem', borderRadius: 8, background: 'rgba(200,137,26,0.08)', border: '1px solid rgba(200,137,26,0.2)', marginBottom: '0.3rem', cursor: 'pointer' }}>
                      {src ? <img src={src} style={{ width: 28, height: 42, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} alt="" onError={e => e.target.style.display='none'} /> : <div style={{ width: 28, height: 42, borderRadius: 4, background: 'var(--rt-surface)', flexShrink: 0 }} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--rt-navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rTitle}</div>
                        {r.book_author && <div style={{ fontSize: '0.68rem', color: 'var(--rt-t3)' }}>{r.book_author}</div>}
                        {r.message && <div style={{ fontSize: '0.65rem', color: 'var(--rt-t3)', fontStyle: 'italic', marginTop: 2 }}>"{r.message.slice(0,60)}"</div>}
                      </div>
                      <button onClick={e => { e.stopPropagation(); onAddToTBR({ title: rTitle, author: r.book_author, olKey: r.book_ol_key, coverId: r.cover_id, recId: r.id }) }}
                        style={{ flexShrink: 0, background: 'var(--rt-amber)', color: '#fff', border: 'none', borderRadius: 7, padding: '0.28rem 0.65rem', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer' }}
                      >+ Add</button>
                    </div>
                  )
                })}
              </>
            )}

            {/* ── Currently reading ── */}
            <SLabel>Currently reading</SLabel>
            {readingBooks.length === 0
              ? <p style={{ fontSize: '0.78rem', color: 'var(--rt-t3)', fontStyle: 'italic' }}>Nothing in progress.</p>
              : <>
                  {(showAllReading ? readingBooks : readingBooks.slice(0, 3)).map((b, i) => {
                    const chat = existingChat(b.olKey)
                    const listed = onMyList(b.title, b.olKey)
                    return <BookRow key={i} b={b} actions={<>
                      {!listed && <button onClick={e => { e.stopPropagation(); onAddToTBR({ title: b.title, author: b.author, olKey: b.olKey, coverId: b.coverId }) }} style={{ background: 'var(--rt-surface)', color: 'var(--rt-navy)', border: '1px solid var(--rt-border-md)', borderRadius: 7, padding: '0.3rem 0.55rem', fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>+ TBR</button>}
                      {b.olKey && <button onClick={e => { e.stopPropagation(); chat ? onViewChat(chat.id) : onStartChat(b) }} style={{ background: chat ? 'var(--rt-navy)' : 'var(--rt-amber)', color: '#fff', border: 'none', borderRadius: 7, padding: '0.3rem 0.6rem', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>{chat ? 'View chat' : 'Start chat'}</button>}
                    </>} />
                  })}
                  <SeeAllBtn count={readingBooks.length} shown={showAllReading} onToggle={() => setShowAllReading(v => !v)} />
                </>
            }

            {/* ── Both read ── */}
            {mutualBooks.length > 0 && <>
              <SLabel>Both read ({mutualBooks.length})</SLabel>
              {(showAllMutual ? mutualBooks : mutualBooks.slice(0, 3)).map((b, i) => {
                const chat = existingChat(b.olKey)
                return <BookRow key={i} b={b} actions={b.olKey
                  ? <button
                      onClick={e => { e.stopPropagation(); chat ? onViewChat(chat.id) : onStartChat(b) }}
                      style={{ background: chat ? 'var(--rt-navy)' : 'var(--rt-amber)', color: '#fff', border: 'none', borderRadius: 7, padding: '0.3rem 0.6rem', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >{chat ? 'View chat' : 'Start chat'}</button>
                  : null}
                />
              })}
              <SeeAllBtn count={mutualBooks.length} shown={showAllMutual} onToggle={() => setShowAllMutual(v => !v)} />
            </>}
          </>}
        </div>

        {/* Footer */}
        <div style={{ padding: '0.7rem 1.1rem', borderTop: '1px solid var(--rt-border)', display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
          <button onClick={onClose} style={{ flex: 1, background: 'var(--rt-surface)', border: '1px solid var(--rt-border-md)', borderRadius: 'var(--rt-r3)', padding: '0.5rem', fontSize: '0.8rem', color: 'var(--rt-t2)', cursor: 'pointer' }}>Close</button>
          <button onClick={() => { if (window.confirm(`Remove ${friend.displayName} from your friends?`)) { sb.from('friendships').delete().eq('id', friend.friendshipId).then(() => onClose()) } }}
            style={{ background: 'rgba(127,29,29,0.08)', border: '1px solid rgba(127,29,29,0.2)', borderRadius: 'var(--rt-r3)', padding: '0.5rem 0.85rem', fontSize: '0.78rem', color: '#7f1d1d', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >Remove friend</button>
        </div>
      </div>
    </>
  )
}