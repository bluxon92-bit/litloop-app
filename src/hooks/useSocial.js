import { useState, useEffect, useRef } from 'react'
import { sb } from '../lib/supabase'

export function useSocial(user) {
  const [friends, setFriends]               = useState([])
  const [pending, setPending]               = useState([])
  const [outgoingPending, setOutgoingPending] = useState([])
  const [feed, setFeed]                     = useState([])
  const [recs, setRecs]                     = useState([])
  const [notifications, setNotifications]   = useState([])
  const [loaded, setLoaded]                 = useState(false)
  const [myUsername, setMyUsername]         = useState('')
  const [myDisplayName, setMyDisplayName]   = useState('')
  const [myBio, setMyBio]                   = useState('')
  const [topBookIds, setTopBookIds]         = useState([])
  const [preferredMoods, setPreferredMoods] = useState([])
  const [profileLoaded, setProfileLoaded]   = useState(false)
  const [myAvatarUrl, setMyAvatarUrl]       = useState(null)
  const channelRef                          = useRef(null)
  const recsChannelRef                      = useRef(null)
  const notifChannelRef                     = useRef(null)

  useEffect(() => {
    if (!user) {
      setFriends([]); setPending([]); setOutgoingPending([])
      setFeed([]); setRecs([])
      setLoaded(false); setMyUsername(''); setMyDisplayName(''); setMyBio('')
      setMyAvatarUrl(null)
      return
    }
    loadProfile()
    loadSocialData()
    loadNotifications()
    setupRealtime()
    handleInviteParam()
    return () => {
      if (channelRef.current)     { sb.removeChannel(channelRef.current);     channelRef.current = null }
      if (recsChannelRef.current) { sb.removeChannel(recsChannelRef.current); recsChannelRef.current = null }
      if (notifChannelRef.current){ sb.removeChannel(notifChannelRef.current); notifChannelRef.current = null }
    }
  }, [user?.id])

  async function loadProfile() {
    const { data } = await sb
      .from('profiles')
      .select('username, display_name, bio, top_book_ids, preferred_moods, avatar_url')
      .eq('id', user.id)
      .single()
    if (data) {
      setMyUsername(data.username || '')
      setMyDisplayName(data.display_name || data.username || '')
      setMyBio(data.bio || '')
      setTopBookIds(data.top_book_ids || [])
      setPreferredMoods(data.preferred_moods || [])
      setMyAvatarUrl(data.avatar_url || null)
    }
    setProfileLoaded(true)
  }

  async function loadSocialData() {
    try {
      const [friendsRes, pendingRes, outgoingRes] = await Promise.all([
        sb.from('friendships')
          .select('id, requester_id, addressee_id, status')
          .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
          .eq('status', 'accepted'),
        // Incoming — others requested me
        sb.from('friendships')
          .select('id, requester_id')
          .eq('addressee_id', user.id)
          .eq('status', 'pending'),
        // Outgoing — I sent, still pending
        sb.from('friendships')
          .select('id, addressee_id')
          .eq('requester_id', user.id)
          .eq('status', 'pending'),
      ])

      // Recs — try full columns, fall back if migration not run
      let recsData = []
      const { data: recsFull, error: recsErr } = await sb
        .from('book_recommendations')
        .select('id, created_at, from_user_id, book_ol_key, book_title, book_author, cover_id, message, status')
        .eq('to_user_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      if (recsErr) {
        const { data: recsFallback } = await sb
          .from('book_recommendations')
          .select('id, created_at, from_user_id, book_ol_key, message, status')
          .eq('to_user_id', user.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
        recsData = recsFallback || []
      } else {
        recsData = recsFull || []
      }

      const friendIds   = (friendsRes.data || []).map(f =>
        f.requester_id === user.id ? f.addressee_id : f.requester_id)
      const pendingIds  = (pendingRes.data  || []).map(f => f.requester_id)
      const outgoingIds = (outgoingRes.data || []).map(f => f.addressee_id)
      const recIds      = recsData.map(r => r.from_user_id)

      // Feed — try RPC first, fall back to own events
      let feedData = []
      if (friendIds.length > 0) {
        const { data: rpcFeed, error: rpcErr } = await sb.rpc('get_friend_feed_events', {
          p_user_id: user.id, p_friend_ids: friendIds
        })
        if (!rpcErr && Array.isArray(rpcFeed)) {
          feedData = rpcFeed
        } else {
          const { data: own } = await sb
            .from('feed_events')
            .select('id, user_id, event_type, book_ol_key, book_title, book_author, cover_id, review_body, rating, created_at, moment_id, page_ref, moment_type, moment_body, spoiler_warning')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(40)
          feedData = own || []
        }
      } else {
        const { data: own } = await sb
          .from('feed_events')
          .select('id, user_id, event_type, book_ol_key, book_title, book_author, cover_id, review_body, rating, created_at, moment_id, page_ref, moment_type, moment_body, spoiler_warning')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(40)
        feedData = own || []
      }

      // Batch-fetch profiles via RPC
      const allIds = [...new Set([...friendIds, ...pendingIds, ...outgoingIds, ...feedData.map(e => e.user_id), ...recIds])]
      let profileMap = {}
      if (allIds.length) {
        const { data: profiles } = await sb.rpc('get_profiles_by_ids', { user_ids: allIds })
        ;(profiles || []).forEach(p => { profileMap[p.id] = p })
      }

      setFriends((friendsRes.data || []).map(f => {
        const fid  = f.requester_id === user.id ? f.addressee_id : f.requester_id
        const prof = profileMap[fid] || {}
        return {
          friendshipId: f.id,
          userId:       fid,
          username:     prof.username     || null,
          displayName:  prof.display_name || prof.username || 'Friend'
        }
      }))

      setPending((pendingRes.data || []).map(f => {
        const prof = profileMap[f.requester_id] || {}
        return {
          friendshipId:      f.id,
          requesterId:       f.requester_id,
          requesterUsername: prof.username    || null,
          requesterName:     prof.display_name || prof.username || 'Someone'
        }
      }))

      setOutgoingPending((outgoingRes.data || []).map(f => {
        const prof = profileMap[f.addressee_id] || {}
        return {
          friendshipId:      f.id,
          addresseeId:       f.addressee_id,
          addresseeUsername: prof.username    || null,
          addresseeName:     prof.display_name || prof.username || 'Someone'
        }
      }))

      setFeed(feedData.map(e => ({ ...e, profiles: profileMap[e.user_id] || null })))
      setRecs(recsData.map(r => ({ ...r, profiles: profileMap[r.from_user_id] || null })))
      setLoaded(true)

    } catch(e) {
      console.error('[Social] loadSocialData:', e)
    }
  }

  async function loadNotifications() {
    const { data } = await sb
      .from('notifications')
      .select('id, type, actor_id, entry_id, comment_id, book_title, read, read_at, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30)
    if (!data?.length) { setNotifications([]); return }
    // Fetch actor profiles separately via RPC
    const actorIds = [...new Set(data.map(n => n.actor_id).filter(Boolean))]
    let profileMap = {}
    if (actorIds.length) {
      const { data: profiles } = await sb.rpc('get_profiles_by_ids', { user_ids: actorIds })
      ;(profiles || []).forEach(p => { profileMap[p.id] = p })
    }
    setNotifications(data.map(n => {
      const profile = profileMap[n.actor_id] || null
      return {
        ...n,
        read:      n.read || !!n.read_at,
        profiles:  profile,
        actorName: profile?.display_name || profile?.username || null,
        bookTitle: n.book_title || null,
      }
    }))
  }

  async function markNotificationsRead(ids) {
    if (!ids?.length) return
    const now = new Date().toISOString()
    await sb.from('notifications').update({ read: true, read_at: now }).in('id', ids)
    setNotifications(prev => prev.map(n => ids.includes(n.id) ? { ...n, read: true } : n))
  }

  function setupRealtime() {
    if (channelRef.current) { sb.removeChannel(channelRef.current); channelRef.current = null }

    // One channel, two filters:
    // 1) anything where I'm the addressee (incoming requests, acceptances I see)
    // 2) UPDATEs where I'm the requester (my sent requests being accepted/declined)
    const ch = sb.channel(`friendships_${user.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'staging', table: 'friendships',
        filter: `addressee_id=eq.${user.id}`
      }, () => loadSocialData())
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'staging', table: 'friendships',
        filter: `requester_id=eq.${user.id}`
      }, () => loadSocialData())
      .subscribe()
    channelRef.current = ch

    // Realtime for incoming recommendations
    if (recsChannelRef.current) { sb.removeChannel(recsChannelRef.current); recsChannelRef.current = null }
    const recsCh = sb.channel(`recs_${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'staging', table: 'book_recommendations',
        filter: `to_user_id=eq.${user.id}`
      }, () => loadSocialData())
      .subscribe()
    recsChannelRef.current = recsCh

    // Realtime for notifications
    if (notifChannelRef.current) { sb.removeChannel(notifChannelRef.current); notifChannelRef.current = null }
    const notifCh = sb.channel(`notifications_${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'staging', table: 'notifications',
        filter: `user_id=eq.${user.id}`
      }, () => loadNotifications())
      .subscribe()
    notifChannelRef.current = notifCh
  }

  // ── Add friend via @username (uses RPC to bypass RLS) ────────
  async function sendFriendRequest(raw) {
    const lookup = raw.trim().replace(/^@/, '').toLowerCase()
    if (!lookup) return { error: 'Enter a username' }

    const { data: targetId, error: rpcErr } = await sb.rpc('find_user_by_username', { p_username: lookup })
    if (rpcErr) return { error: 'Search failed: ' + rpcErr.message }
    if (!targetId) return { error: `No account found for "@${lookup}"` }
    if (targetId === user.id) return { error: "That's you! Try a friend's username." }
    if (friends.find(f => f.userId === targetId)) return { error: "You're already friends with this person." }

    const { error } = await sb.from('friendships').insert({
      requester_id: user.id,
      addressee_id: targetId,
      status: 'pending'
    })
    if (error) {
      if (error.code === '23505') return { error: 'Friend request already sent.' }
      return { error: error.message }
    }
    await loadSocialData()
    return { success: `✓ Friend request sent to @${lookup}!` }
  }

  async function acceptFriendRequest(friendshipId) {
    const { error } = await sb.from('friendships').update({ status: 'accepted' }).eq('id', friendshipId)
    if (!error) { setPending(p => p.filter(x => x.friendshipId !== friendshipId)); await loadSocialData() }
    return { error }
  }

  async function declineFriendRequest(friendshipId) {
    const { error } = await sb.from('friendships').delete().eq('id', friendshipId)
    if (!error) setPending(p => p.filter(x => x.friendshipId !== friendshipId))
    return { error }
  }

  async function removeFriend(friendshipId) {
    const { error } = await sb.from('friendships').delete().eq('id', friendshipId)
    if (!error) setFriends(f => f.filter(x => x.friendshipId !== friendshipId))
    return { error }
  }

  async function dismissRec(recId) {
    await sb.from('book_recommendations').update({ status: 'dismissed' }).eq('id', recId)
    setRecs(r => r.filter(x => x.id !== recId))
  }

  async function acceptRecToTBR(recId, olKey, bookTitle, bookAuthor, coverId, addBook, books) {
    const already = books.find(b =>
      (olKey && b.olKey === olKey) ||
      (bookTitle && b.title?.toLowerCase() === bookTitle.toLowerCase())
    )
    if (!already) {
      await addBook({ title: bookTitle, author: bookAuthor, status: 'tbr', olKey, coverId })
    }
    await sb.from('book_recommendations').update({ status: 'accepted' }).eq('id', recId)
    setRecs(r => r.filter(x => x.id !== recId))
    return { alreadyInLibrary: !!already }
  }

  async function uploadAvatar(file) {
    if (!user || !file) return { error: 'Not signed in' }
    try {
      // Resize/convert to jpeg blob via canvas for consistent format and smaller size
      const bitmap = await createImageBitmap(file)
      const size = Math.min(bitmap.width, bitmap.height)
      const canvas = document.createElement('canvas')
      canvas.width = 200; canvas.height = 200
      const ctx = canvas.getContext('2d')
      // Centre-crop to square
      const sx = (bitmap.width - size) / 2
      const sy = (bitmap.height - size) / 2
      ctx.drawImage(bitmap, sx, sy, size, size, 0, 0, 200, 200)
      const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85))

      const path = `${user.id}/avatar.jpg`
      const { error: uploadError } = await sb.storage
        .from('profile-images')
        .upload(path, blob, { contentType: 'image/jpeg', upsert: true })
      if (uploadError) return { error: uploadError.message }

      const { data: { publicUrl } } = sb.storage.from('profile-images').getPublicUrl(path)
      // Add cache-buster so browser doesn't show old image after re-upload
      const urlWithBust = `${publicUrl}?t=${Date.now()}`

      const { error: dbError } = await sb.from('profiles')
        .update({ avatar_url: urlWithBust })
        .eq('id', user.id)
      if (dbError) return { error: dbError.message }

      setMyAvatarUrl(urlWithBust)
      return { url: urlWithBust }
    } catch (err) {
      return { error: err.message }
    }
  }

  async function saveProfile(username, bio) {
    const clean = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
    const { error } = await sb.from('profiles').upsert(
      { id: user.id, username: clean, display_name: username.trim(), bio: bio.trim() },
      { onConflict: 'id' }
    )
    if (!error) { setMyUsername(clean); setMyDisplayName(username.trim()); setMyBio(bio.trim()) }
    return { error }
  }

  async function saveFavBooks(favIds) {
    const { error } = await sb.from('profiles').upsert(
      { id: user.id, top_book_ids: favIds },
      { onConflict: 'id' }
    )
    if (!error) setTopBookIds(favIds)
    return { error }
  }

  async function sendRec(toUserId, book) {
    // Try with full columns, fall back if migration not run
    const row = {
      from_user_id: user.id,
      to_user_id:   toUserId,
      book_ol_key:  book.olKey    || null,
      book_title:   book.title    || null,
      book_author:  book.author   || null,
      cover_id:     book.coverId  || null,
      status:       'pending'
    }
    const { error } = await sb.from('book_recommendations').insert(row)
    if (error) {
      const { error: err2 } = await sb.from('book_recommendations').insert({
        from_user_id: user.id, to_user_id: toUserId,
        book_ol_key: book.olKey || null, status: 'pending'
      })
      return { error: err2 }
    }
    return { error: null }
  }

  function generateInviteLink() {
    const base = window.location.origin + window.location.pathname
    const link = `${base}?invite=${user.id}`
    const msg = `Come read with me on LitLoop! 📚 Track books, chat about stories, and share recommendations. Create your free account and add me${myUsername ? ` @${myUsername}` : ''}: ${link}`
    return msg
  }

  async function handleInviteParam() {
    const params    = new URLSearchParams(window.location.search)
    const inviterId = params.get('invite')
    if (!inviterId || !user || inviterId === user.id) return
    window.history.replaceState({}, '', window.location.pathname)
    await sb.from('friendships').insert({
      requester_id: user.id, addressee_id: inviterId, status: 'pending'
    })
  }

  // sendRecommendation: send to multiple friends at once with optional note
  async function sendRecommendation(book, recipientIds, note, _user) {
    const sender = _user || user
    if (!sender) return { error: 'Not signed in' }
    const inserts = recipientIds.map(rid => ({
      from_user_id: sender.id,
      to_user_id:   rid,
      book_ol_key:  book.olKey   || null,
      book_title:   book.title   || null,
      book_author:  book.author  || null,
      cover_id:     book.coverId || null,
      message:      note || null,
      status:       'pending'
    }))
    let { error } = await sb.from('book_recommendations').insert(inserts)
    if (error) {
      const minimal = recipientIds.map(rid => ({
        from_user_id: sender.id, to_user_id: rid,
        book_ol_key: book.olKey || null, status: 'pending'
      }))
      ;({ error } = await sb.from('book_recommendations').insert(minimal))
    }
    return { error: error?.message || null }
  }

  return {
    friends, pending, outgoingPending, feed, recs, notifications, loaded,
    myUsername, myDisplayName, myBio, myAvatarUrl, topBookIds, preferredMoods, setPreferredMoods, profileLoaded,
    loadSocialData, sendFriendRequest, sendRecommendation,
    acceptFriendRequest, declineFriendRequest, removeFriend,
    dismissRec, acceptRecToTBR, sendRec,
    saveProfile, saveFavBooks, uploadAvatar, generateInviteLink,
    loadNotifications, markNotificationsRead,
  }
}