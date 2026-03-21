import { useState, useRef, useEffect } from 'react'
import { sb } from '../lib/supabase'

export function useChat(user) {
  const [chats, setChats]           = useState([])
  const [activeChat, setActiveChat] = useState(null)
  const [messages, setMessages]     = useState([])
  const [loaded, setLoaded]         = useState(false)
  const cursorRef                   = useRef(null)
  const channelRef                  = useRef(null)  // active thread subscription
  const listChannelRef              = useRef(null)  // new-thread realtime subscription

  useEffect(() => {
    if (user) {
      loadChatList()
      setupListRealtime()
    }
    return () => {
      if (listChannelRef.current) { sb.removeChannel(listChannelRef.current); listChannelRef.current = null }
    }
  }, [user?.id])

  // Watch for new chat_participants rows where I'm added — refreshes chat list live
  function setupListRealtime() {
    if (listChannelRef.current) { sb.removeChannel(listChannelRef.current); listChannelRef.current = null }
    if (!user) return
    const ch = sb.channel(`chat_list_${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'chat_participants',
        filter: `user_id=eq.${user.id}`
      }, () => loadChatList())
      .subscribe()
    listChannelRef.current = ch
  }

  async function loadChatList() {
    if (!user) return
    try {
      // chat_participants → book_chats join (exact schema from original)
      const { data: participations, error } = await sb
        .from('chat_participants')
        .select('chat_id, last_read_at, chat:book_chats(id, book_ol_key, book_title, book_author, cover_id, chat_name, last_message_at, last_message_preview, last_message_user_id, participants:chat_participants(user_id))')
        .eq('user_id', user.id)
        .order('joined_at', { ascending: false })

      if (error) throw error

      // Compute unread counts
      const chatIds = (participations || []).map(p => p.chat_id)
      let unreadMap = {}
      if (chatIds.length) {
        const { data: msgs } = await sb
          .from('chat_messages')
          .select('chat_id, created_at, user_id')
          .in('chat_id', chatIds)
          .eq('is_deleted', false)

        ;(msgs || []).forEach(m => {
          const p = (participations || []).find(p => p.chat_id === m.chat_id)
          if (!p || m.user_id === user.id) return
          const lastRead = p.last_read_at ? new Date(p.last_read_at) : new Date(0)
          if (new Date(m.created_at) > lastRead) {
            unreadMap[m.chat_id] = (unreadMap[m.chat_id] || 0) + 1
          }
        })
      }

      const mapped = (participations || [])
        .filter(p => p.chat)
        .map(p => ({
          id:                 p.chat.id,
          bookOlKey:          p.chat.book_ol_key,
          bookTitle:          p.chat.book_title  || p.chat.book_ol_key || 'Unknown book',
          bookAuthor:         p.chat.book_author || '',
          coverId:            p.chat.cover_id,
          coverIdRaw:         p.chat.cover_id,
          chatName:           p.chat.chat_name   || null,
          lastMessagePreview: p.chat.last_message_preview,
          lastMessageAt:      p.chat.last_message_at,
          lastUserId:         p.chat.last_message_user_id,
          unread:             unreadMap[p.chat.id] || 0,
          participantIds:     (p.chat.participants || []).map(pp => pp.user_id),
          participants:       [], // will be enriched below
        }))
        .sort((a, b) => {
          if (!a.lastMessageAt && !b.lastMessageAt) return 0
          if (!a.lastMessageAt) return 1
          if (!b.lastMessageAt) return -1
          return new Date(b.lastMessageAt) - new Date(a.lastMessageAt)
        })

      // Enrich all participant IDs with profile data in one query
      const allParticipantIds = [...new Set(mapped.flatMap(c => c.participantIds))]
      if (allParticipantIds.length) {
        const { data: profileData } = await sb.rpc('get_profiles_by_ids', { user_ids: allParticipantIds })
        const profileMap = {}
        ;(profileData || []).forEach(p => {
          profileMap[p.id] = {
            userId:      p.id,
            displayName: p.display_name || p.username || 'Unknown',
            username:    p.username || null,
            avatarUrl:   p.avatar_url || null,
          }
        })
        mapped.forEach(c => {
          c.participants = c.participantIds.map(id => profileMap[id]).filter(Boolean)
        })
      }

      setChats(mapped)
      setLoaded(true)
    } catch(e) {
      console.error('[Chat] loadChatList:', e)
    }
  }

  async function openThread(chatIdOrChat) {
    const chat = typeof chatIdOrChat === 'string'
      ? chats.find(c => c.id === chatIdOrChat)
      : chatIdOrChat
    if (!chat) return
    setActiveChat(chat)
    setMessages([])
    cursorRef.current = null
    await fetchMessages(chat.id, false)
    markChatRead(chat.id)
    subscribeToThread(chat.id)
  }

  function closeThread() {
    if (channelRef.current) { sb.removeChannel(channelRef.current); channelRef.current = null }
    setActiveChat(null)
    setMessages([])
    loadChatList()
  }

  async function fetchMessages(chatId, prepend) {
    try {
      let query = sb
        .from('chat_messages')
        .select('id, chat_id, user_id, body, is_deleted, edited_at, created_at')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: false })
        .limit(50)

      if (prepend && cursorRef.current) query = query.lt('created_at', cursorRef.current)

      const { data, error } = await query
      if (error) throw error

      const msgs = (data || []).reverse()
      if (msgs.length) cursorRef.current = msgs[0].created_at

      if (prepend) setMessages(prev => [...msgs, ...prev])
      else         setMessages(msgs)
      return msgs
    } catch(e) {
      console.error('[Chat] fetchMessages:', e)
    }
  }

  async function loadEarlier(chatId) {
    await fetchMessages(chatId, true)
  }

  async function sendMessage(chatId, body) {
    if (!body.trim() || !user) return
    const opt = { id: 'opt_' + Date.now(), chat_id: chatId, user_id: user.id, body: body.trim(), is_deleted: false, created_at: new Date().toISOString() }
    setMessages(prev => [...prev, opt])
    const { data, error } = await sb
      .from('chat_messages')
      .insert({ chat_id: chatId, user_id: user.id, body: body.trim() })
      .select('id, chat_id, user_id, body, is_deleted, edited_at, created_at')
      .single()
    if (!error && data) setMessages(prev => prev.map(m => m.id === opt.id ? data : m))
  }

  async function deleteMessage(msgId) {
    await sb.from('chat_messages')
      .update({ is_deleted: true, body: '' })
      .eq('id', msgId)
      .eq('user_id', user.id)
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, is_deleted: true, body: '' } : m))
  }

  async function markChatRead(chatId) {
    await sb.from('chat_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('chat_id', chatId)
      .eq('user_id', user.id)
    setChats(prev => prev.map(c => c.id === chatId ? { ...c, unread: 0 } : c))
  }

  async function getParticipants(chatId) {
    const { data } = await sb.from('chat_participants').select('user_id').eq('chat_id', chatId)
    return data || []
  }

  async function loadParticipants(chatId) {
    try {
      const { data: parts } = await sb
        .from('chat_participants')
        .select('user_id, joined_at')
        .eq('chat_id', chatId)
        .order('joined_at', { ascending: true })
      const ids = (parts || []).map(p => p.user_id)
      if (!ids.length) return []
      const { data: profiles } = await sb.rpc('get_profiles_by_ids', { user_ids: ids })
      const creatorId = parts[0]?.user_id
      return (profiles || []).map(p => ({
        userId:      p.id,
        displayName: p.display_name || p.username || 'Friend',
        username:    p.username || null,
        avatarUrl:   p.avatar_url || null,
        isCreator:   p.id === creatorId,
      }))
    } catch(e) {
      console.error('[Chat] loadParticipants:', e)
      return []
    }
  }

  async function updateChatName(chatId, name) {
    const { error } = await sb
      .from('book_chats')
      .update({ chat_name: name.trim() || null })
      .eq('id', chatId)
    if (!error) {
      setChats(prev => prev.map(c => c.id === chatId ? { ...c, chatName: name.trim() || null } : c))
      setActiveChat(prev => prev?.id === chatId ? { ...prev, chatName: name.trim() || null } : prev)
    }
    return { error }
  }

  async function addParticipants(chatId, friendIds) {
    for (const fid of friendIds) {
      await sb.from('chat_participants').upsert(
        { chat_id: chatId, user_id: fid },
        { onConflict: 'chat_id,user_id', ignoreDuplicates: true }
      )
    }
  }

  function subscribeToThread(chatId) {
    if (channelRef.current) { sb.removeChannel(channelRef.current); channelRef.current = null }
    const ch = sb.channel(`chat_${chatId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `chat_id=eq.${chatId}` }, payload => {
        if (payload.new.user_id === user.id) return
        setMessages(prev => [...prev, payload.new])
        markChatRead(chatId)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `chat_id=eq.${chatId}` }, payload => {
        setMessages(prev => prev.map(m => m.id === payload.new.id ? payload.new : m))
      })
      .subscribe()
    channelRef.current = ch
  }

  // start or open a chat for a book; friendIds = array of friend user IDs to add
  async function startOrOpenChat(olKey, title, author, coverId, friendIds, firstMessage = null, chatName = null) {
    if (!user) return null
    try {
      // Check for existing chat with same book and same participants
      if (olKey && friendIds.length > 0) {
        const existing = chats.find(c => {
          if (c.bookOlKey !== olKey) return false
          const participantIds = (c.participants || []).map(p => p.user_id)
          return friendIds.every(id => participantIds.includes(id)) && participantIds.includes(user.id)
        })
        if (existing) return existing.id
      }
      const { data: nc, error } = await sb
        .from('book_chats')
        .insert({ book_ol_key: olKey, book_title: title, book_author: author, cover_id: coverId, chat_name: chatName || null })
        .select('id').single()
      if (error) throw error
      const chatId = nc.id
      await sb.from('chat_participants').insert(
        [user.id, ...friendIds].map(uid => ({ chat_id: chatId, user_id: uid }))
      )
      if (firstMessage) {
        await sb.from('chat_messages').insert({ chat_id: chatId, user_id: user.id, body: firstMessage })
      }
      await loadChatList()
      return chatId
    } catch(e) {
      console.error('[Chat] startOrOpenChat:', e)
      return null
    }
  }

  const totalUnread = chats.reduce((s, c) => s + (c.unread || 0), 0)

  async function leaveChat(chatId) {
    if (!user) return { error: 'Not signed in' }
    try {
      const { error } = await sb
        .from('chat_participants')
        .delete()
        .eq('chat_id', chatId)
        .eq('user_id', user.id)
      if (error) throw error
      setChats(prev => prev.filter(c => c.id !== chatId))
      return { error: null }
    } catch(e) {
      console.error('[Chat] leaveChat:', e)
      return { error: e.message }
    }
  }

  return {
    chats, activeChat, messages, loaded, totalUnread,
    loadChatList, openThread, closeThread,
    fetchMessages, loadEarlier,
    sendMessage, deleteMessage, markChatRead,
    getParticipants, loadParticipants, startOrOpenChat,
    updateChatName, addParticipants,
    leaveChat,
  }
}