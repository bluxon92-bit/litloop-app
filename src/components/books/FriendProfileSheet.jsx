import { useState, useEffect } from 'react'
import { sb } from '../../lib/supabase'
import { avatarColour, avatarInitial } from '../../lib/utils'

export default function FriendProfileSheet({ friend, chats, user, books: myBooks, onClose, onAddToTBR, onStartChat, onViewChat }) {
  const [entries, setEntries]       = useState(null)
  const [recs, setRecs]             = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [detailBook, setDetailBook] = useState(null)   // drilled-in book

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

  const colour = avatarColour(friend.userId)
  const init   = avatarInitial(friend.displayName)

  /* ── Reusable inner components ── */
  function SLabel({ children, accent }) {
    return <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: accent || 'var(--rt-t3)', marginBottom: '0.45rem', marginTop: '1rem' }}>{children}</div>
  }

  function BookRow({ b, actions }) {
    const src = b.coverId ? `https://covers.openlibrary.org/b/id/${b.coverId}-S.jpg` : null
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.45rem 0', borderBottom: '1px solid var(--rt-border)' }}>
        <div onClick={() => setDetailBook(b)} style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flex: 1, minWidth: 0, cursor: 'pointer' }}>
          {src
            ? <img src={src} style={{ width: 28, height: 42, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} alt="" onError={e => e.target.style.display='none'} />
            : <div style={{ width: 28, height: 42, borderRadius: 4, background: 'var(--rt-surface)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}>📖</div>
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
    const listed = onMyList(detailBook.title, detailBook.olKey)
    return (
      <>
        <div onClick={() => setDetailBook(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(10,15,30,0.6)', zIndex: 508 }} />
        <div className="rt-fp-sheet-inner" style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 509, background: 'var(--rt-white)', borderRadius: '20px 20px 0 0', boxShadow: '0 -8px 40px rgba(10,15,30,0.18)', maxHeight: '70vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxWidth: 480, margin: '0 auto' }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: 'var(--rt-cream-md)', margin: '10px auto 0', flexShrink: 0 }} />
          <div style={{ padding: '0.85rem 1.1rem', borderBottom: '1px solid var(--rt-border)', display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
            <button onClick={() => setDetailBook(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--rt-navy)', fontWeight: 600, fontSize: '0.85rem', padding: 0, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              ← {friend.displayName}
            </button>
          </div>
          <div style={{ overflowY: 'auto', flex: 1, padding: '1.1rem' }}>
            <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              {detailBook.coverId
                ? <img src={`https://covers.openlibrary.org/b/id/${detailBook.coverId}-M.jpg`} style={{ width: 72, height: 104, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} alt="" />
                : <div style={{ width: 72, height: 104, borderRadius: 8, background: 'var(--rt-surface)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem' }}>📖</div>
              }
              <div style={{ flex: 1, minWidth: 0, paddingTop: '0.2rem' }}>
                <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.05rem', fontWeight: 700, color: 'var(--rt-navy)', marginBottom: '0.25rem' }}>{detailBook.title}</div>
                {detailBook.author && <div style={{ fontSize: '0.78rem', color: 'var(--rt-t3)' }}>{detailBook.author}</div>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {!listed && (
                <button onClick={() => { onAddToTBR({ title: detailBook.title, author: detailBook.author, olKey: detailBook.olKey, coverId: detailBook.coverId }); setDetailBook(null) }}
                  style={{ background: 'var(--rt-amber-pale)', color: 'var(--rt-amber)', border: '1.5px solid rgba(200,137,26,0.2)', borderRadius: 'var(--rt-r3)', padding: '0.55rem 1rem', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}
                >+ Add to TBR</button>
              )}
              {detailBook.olKey && (
                <button onClick={() => chat ? onViewChat(chat.id) : onStartChat(detailBook)}
                  style={{ background: chat ? 'var(--rt-navy)' : 'var(--rt-amber)', color: '#fff', border: 'none', borderRadius: 'var(--rt-r3)', padding: '0.55rem 1rem', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}
                >{chat ? '💬 View chat' : '💬 Start chat'}</button>
              )}
            </div>
          </div>
        </div>
      </>
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
          <div style={{ width: 46, height: 46, borderRadius: '50%', background: colour, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.15rem', fontWeight: 700, color: '#fff', marginBottom: '0.6rem', border: '2px solid rgba(255,255,255,0.2)' }}>{init}</div>
          <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>{friend.displayName}</div>
          {friend.username && <div style={{ fontSize: '0.73rem', color: 'rgba(255,255,255,0.45)', marginTop: '0.1rem' }}>@{friend.username}</div>}
          {!loading && entries && (
            <div style={{ display: 'flex', gap: '1.1rem', marginTop: '0.7rem' }}>
              {[[readBooks.length,'books read'],[readingBooks.length,'reading now'],[mutualBooks.length,'in common']].map(([n, l]) => (
                <div key={l}>
                  <div style={{ fontFamily: 'var(--rt-font-display)', fontSize: '1.15rem', fontWeight: 700, color: 'var(--rt-amber-lt)' }}>{n}</div>
                  <div style={{ fontSize: '0.57rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{l}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '0 1.1rem 0.5rem' }}>
          {loading && <div style={{ textAlign: 'center', color: 'var(--rt-t3)', padding: '2rem', fontSize: '0.83rem' }}>Loading…</div>}
          {error && <div style={{ color: '#991b1b', fontSize: '0.83rem', padding: '1rem' }}>{error}</div>}
          {!loading && !error && <>
            {recs.length > 0 && (
              <>
                <SLabel accent="var(--rt-amber)">📚 Recommended for you ({recs.length})</SLabel>
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

            <SLabel>Currently reading</SLabel>
            {readingBooks.length === 0
              ? <p style={{ fontSize: '0.78rem', color: 'var(--rt-t3)', fontStyle: 'italic' }}>Nothing in progress.</p>
              : readingBooks.map((b, i) => {
                const chat = existingChat(b.olKey)
                const listed = onMyList(b.title, b.olKey)
                return <BookRow key={i} b={b} actions={<>
                  {!listed && <button onClick={e => { e.stopPropagation(); onAddToTBR({ title: b.title, author: b.author, olKey: b.olKey, coverId: b.coverId }) }} style={{ background: 'var(--rt-surface)', color: 'var(--rt-navy)', border: '1px solid var(--rt-border-md)', borderRadius: 7, padding: '0.3rem 0.55rem', fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>+ TBR</button>}
                  {b.olKey && <button onClick={e => { e.stopPropagation(); chat ? onViewChat(chat.id) : onStartChat(b) }} style={{ background: chat ? 'var(--rt-navy)' : 'var(--rt-amber)', color: '#fff', border: 'none', borderRadius: 7, padding: '0.3rem 0.6rem', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>💬 {chat ? 'View chat' : 'Start chat'}</button>}
                </>} />
              })
            }

            {mutualBooks.length > 0 && <>
              <SLabel>Both read ({mutualBooks.length})</SLabel>
              {mutualBooks.slice(0, 10).map((b, i) => {
                const chat = existingChat(b.olKey)
                return <BookRow key={i} b={b} actions={b.olKey
                  ? <button
                      onClick={e => { e.stopPropagation(); chat ? onViewChat(chat.id) : onStartChat(b) }}
                      style={{ background: chat ? 'var(--rt-navy)' : 'var(--rt-amber)', color: '#fff', border: 'none', borderRadius: 7, padding: '0.3rem 0.6rem', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >💬 {chat ? 'View chat' : 'Start chat'}</button>
                  : null}
                />
              })}
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
