import { useState, useRef } from 'react'
import { sb } from '../lib/supabase'

export function useChat(user) {
  const [chats, setChats]         = useState([])
  const [activeChat, setActiveChat] = useState(null)
  const [messages, setMessages]   = useState([])
  const [loaded, setLoaded]       = useState(false)
  const cursorRef                 = useRef(null)
  const channelRef                = useRef(null)

  async function loadChatList() {
    if (!user) return
    try {
      // chat_participants → book_chats join (exact schema from original)
      const { data: participations, error } = await sb
        .from('chat_participants')
        .select('chat_id, last_read_at, chat:book_chats(id, book_ol_key, book_title, book_author, cover_id, last_message_at, last_message_preview, last_message_user_id)')
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
          id:            p.chat.id,
          bookOlKey:     p.chat.book_ol_key,
          bookTitle:     p.chat.book_title  || p.chat.book_ol_key || 'Unknown book',
          bookAuthor:    p.chat.book_author || '',
          coverId:       p.chat.cover_id,
          lastMessageAt: p.chat.last_message_at,
          lastPreview:   p.chat.last_message_preview,
          lastUserId:    p.chat.last_message_user_id,
          unread:        unreadMap[p.chat.id] || 0
        }))
        .sort((a, b) => {
          if (!a.lastMessageAt && !b.lastMessageAt) return 0
          if (!a.lastMessageAt) return 1
          if (!b.lastMessageAt) return -1
          return new Date(b.lastMessageAt) - new Date(a.lastMessageAt)
        })

      setChats(mapped)
      setLoaded(true)
    } catch(e) {
      console.error('[Chat] loadChatList:', e)
    }
  }

  async function openThread(chat) {
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

  function subscribeToThread(chatId) {
    if (channelRef.current) { sb.removeChannel(channelRef.current); channelRef.current = null }
    const ch = sb.channel(`chat_${chatId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'staging', table: 'chat_messages', filter: `chat_id=eq.${chatId}` }, payload => {
        if (payload.new.user_id === user.id) return
        setMessages(prev => [...prev, payload.new])
        markChatRead(chatId)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'staging', table: 'chat_messages', filter: `chat_id=eq.${chatId}` }, payload => {
        setMessages(prev => prev.map(m => m.id === payload.new.id ? payload.new : m))
      })
      .subscribe()
    channelRef.current = ch
  }

  // start or open a chat for a book; friendIds = array of friend user IDs to add
  async function startOrOpenChat(olKey, title, author, coverId, friendIds, firstMessage = null) {
    if (!user) return null
    try {
      // Check if we already have a chat for this OL key
      const { data: existing } = await sb
        .from('chat_participants')
        .select('chat_id, chat:book_chats(id, book_ol_key)')
        .eq('user_id', user.id)

      const found = olKey ? (existing || []).find(p => p.chat?.book_ol_key === olKey) : null
      let chatId

      if (found) {
        chatId = found.chat_id
        for (const fid of friendIds) {
          await sb.from('chat_participants').upsert(
            { chat_id: chatId, user_id: fid },
            { onConflict: 'chat_id,user_id', ignoreDuplicates: true }
          )
        }
      } else {
        const { data: nc, error } = await sb
          .from('book_chats')
          .insert({ book_ol_key: olKey, book_title: title, book_author: author, cover_id: coverId })
          .select('id').single()
        if (error) throw error
        chatId = nc.id
        await sb.from('chat_participants').insert(
          [user.id, ...friendIds].map(uid => ({ chat_id: chatId, user_id: uid }))
        )
      }

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

  return {
    chats, activeChat, messages, loaded, totalUnread,
    loadChatList, openThread, closeThread,
    fetchMessages, loadEarlier,
    sendMessage, deleteMessage, markChatRead,
    getParticipants, startOrOpenChat
  }
}
