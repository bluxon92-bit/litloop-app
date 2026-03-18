import { useState, useEffect, useCallback } from 'react'
import { sb } from '../lib/supabase'
import { useAuthContext } from '../context/AuthContext'

export function useClubs() {
  const { user } = useAuthContext()
  const [clubs, setClubs]   = useState([])
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    if (!user) return
    try {
      // 1. Get club IDs I belong to
      const { data: myMemberships, error: memErr } = await sb
        .from('club_members')
        .select('club_id, role')
        .eq('user_id', user.id)

      if (memErr) { console.error('[useClubs] memberships:', memErr); setLoaded(true); return }
      if (!myMemberships?.length) { setClubs([]); setLoaded(true); return }

      const clubIds  = myMemberships.map(m => m.club_id)
      const myRoleMap = Object.fromEntries(myMemberships.map(m => [m.club_id, m.role]))

      // 2. Fetch club details
      const { data: clubRows, error: clubErr } = await sb
        .from('book_clubs')
        .select('id, name, icon_index, gradient_index, meeting_time, meeting_place, pinned_message, created_by, created_at')
        .in('id', clubIds)

      if (clubErr) { console.error('[useClubs] clubs:', clubErr); setLoaded(true); return }

      // 3. Fetch all members for these clubs
      const { data: allMembers } = await sb
        .from('club_members')
        .select('club_id, user_id, role')
        .in('club_id', clubIds)

      // 4. Fetch profiles for all member user IDs
      const memberUserIds = [...new Set((allMembers || []).map(m => m.user_id))]
      const { data: profiles } = await sb.rpc('get_profiles_by_ids', { user_ids: memberUserIds })
      const profileMap = {}
      ;(profiles || []).forEach(p => {
        profileMap[p.id] = {
          userId:      p.id,
          displayName: p.display_name || p.username || 'Member',
          username:    p.username,
          avatarUrl:   p.avatar_url || null,
        }
      })

      // 5. Fetch club books
      const { data: clubBooks } = await sb
        .from('club_books')
        .select('*')
        .in('club_id', clubIds)
        .order('assigned_at', { ascending: false })

      // 6. Group by club
      const membersByClub = {}
      ;(allMembers || []).forEach(m => {
        if (!membersByClub[m.club_id]) membersByClub[m.club_id] = []
        membersByClub[m.club_id].push({ ...(profileMap[m.user_id] || { userId: m.user_id, displayName: 'Member', avatarUrl: null }), role: m.role })
      })

      const booksByClub = {}
      ;(clubBooks || []).forEach(b => {
        if (!booksByClub[b.club_id]) booksByClub[b.club_id] = []
        booksByClub[b.club_id].push(b)
      })

      const mapped = (clubRows || []).map(c => {
        const books = booksByClub[c.id] || []
        return {
          id:            c.id,
          name:          c.name,
          iconIndex:     c.icon_index,
          gradientIndex: c.gradient_index,
          meetingTime:   c.meeting_time || null,
          meetingPlace:  c.meeting_place,
          pinnedMessage: c.pinned_message,
          createdBy:     c.created_by,
          myRole:        myRoleMap[c.id] || 'member',
          members:       membersByClub[c.id] || [],
          currentBook:   books.find(b => b.status === 'current')  || null,
          upcomingBook:  books.find(b => b.status === 'upcoming') || null,
          previousBooks: books
            .filter(b => b.status === 'previous')
            .sort((a, b) => new Date(b.completed_at || b.assigned_at) - new Date(a.completed_at || a.assigned_at)),
        }
      })

      setClubs(mapped)
    } catch(e) {
      console.error('[useClubs] load:', e)
    } finally {
      setLoaded(true)
    }
  }, [user?.id])

  useEffect(() => { load() }, [load])

  async function createClub({ name, iconIndex, gradientIndex, meetingTime, meetingPlace, pinnedMessage, memberIds }) {
    if (!user) return null
    try {
      const { data: club, error } = await sb
        .from('book_clubs')
        .insert({
          name,
          icon_index:     iconIndex     ?? 0,
          gradient_index: gradientIndex ?? 0,
          meeting_time:   meetingTime   || null,
          meeting_place:  meetingPlace  || null,
          pinned_message: pinnedMessage || null,
          created_by:     user.id,
        })
        .select('id')
        .single()

      if (error) { console.error('[useClubs] createClub insert:', error); return null }

      // Use security definer RPC to insert members (bypasses RLS chicken-and-egg)
      const allMemberIds = [user.id, ...(memberIds || []).filter(id => id !== user.id)]
      for (const uid of allMemberIds) {
        const role = uid === user.id ? 'admin' : 'member'
        const { error: memErr } = await sb.rpc('create_club_member', {
          p_club_id: club.id,
          p_user_id: uid,
          p_role: role,
        })
        if (memErr) console.error('[useClubs] createClub member:', uid, memErr)
      }
      await new Promise(r => setTimeout(r, 500))
      await load()
      return club.id
    } catch(e) {
      console.error('[useClubs] createClub:', e)
      return null
    }
  }

  async function updateClub(clubId, changes) {
    const mapped = {}
    if ('name'          in changes) mapped.name           = changes.name
    if ('iconIndex'     in changes) mapped.icon_index     = changes.iconIndex
    if ('gradientIndex' in changes) mapped.gradient_index = changes.gradientIndex
    if ('meetingTime'   in changes) mapped.meeting_time   = changes.meetingTime || null
    if ('meetingPlace'  in changes) mapped.meeting_place  = changes.meetingPlace || null
    if ('pinnedMessage' in changes) mapped.pinned_message = changes.pinnedMessage || null
    const { error } = await sb.from('book_clubs').update(mapped).eq('id', clubId)
    if (error) console.error('[useClubs] updateClub:', error)
    await new Promise(r => setTimeout(r, 300))
    await load()
  }

  async function assignBook(clubId, status, bookData, chatId = null) {
    await sb.from('club_books').delete().eq('club_id', clubId).eq('status', status)
    const { error } = await sb.from('club_books').insert({
      club_id:     clubId,
      book_id:     bookData.bookId  || null,
      book_title:  bookData.title,
      book_author: bookData.author,
      book_ol_key: bookData.olKey   || null,
      cover_id:    bookData.coverId || null,
      status,
      chat_id:     chatId,
    })
    if (error) console.error('[useClubs] assignBook:', error)
    await load()
  }

  async function markCurrentDone(clubId) {
    const club = clubs.find(c => c.id === clubId)
    if (!club) return
    if (club.currentBook) {
      await sb.from('club_books')
        .update({ status: 'previous', completed_at: new Date().toISOString() })
        .eq('id', club.currentBook.id)
    }
    if (club.upcomingBook) {
      await sb.from('club_books').update({ status: 'current' }).eq('id', club.upcomingBook.id)
    }
    await load()
  }

  async function addMember(clubId, userId) {
    await sb.rpc('create_club_member', { p_club_id: clubId, p_user_id: userId, p_role: 'member' })
    await load()
  }

  async function removeMember(clubId, userId) {
    await sb.from('club_members').delete().eq('club_id', clubId).eq('user_id', userId)
    await load()
  }

  async function setMemberRole(clubId, userId, role) {
    await sb.from('club_members').update({ role }).eq('club_id', clubId).eq('user_id', userId)
    await load()
  }

  async function leaveClub(clubId) {
    await sb.from('club_members').delete().eq('club_id', clubId).eq('user_id', user.id)
    await load()
  }

  async function deleteClub(clubId) {
    await sb.from('book_clubs').delete().eq('id', clubId)
    await load()
  }

  return {
    clubs, loaded,
    createClub, updateClub,
    assignBook, markCurrentDone,
    addMember, removeMember, setMemberRole,
    leaveClub, deleteClub,
    reload: load,
  }
}