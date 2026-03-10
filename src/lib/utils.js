// ── Avatar helpers ────────────────────────────────────────────
const AVATAR_COLOURS = ['#1a2744','#c8891a','#2A6E69','#5c6bc0','#b43a3a','#7b3fa0','#2e7d52']

export function avatarColour(str) {
  let hash = 0
  for (let i = 0; i < (str || '').length; i++) hash = (hash * 31 + str.charCodeAt(i)) & 0xffff
  return AVATAR_COLOURS[hash % AVATAR_COLOURS.length]
}

export function avatarInitial(name) {
  return (name || '?').charAt(0).toUpperCase()
}

export function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7)  return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function fmtDate(s) {
  if (!s) return ''
  return new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function sameDay(a, b) {
  const da = new Date(a), db = new Date(b)
  return da.getFullYear() === db.getFullYear() &&
    da.getMonth()         === db.getMonth()    &&
    da.getDate()          === db.getDate()
}

export function formatDay(iso) {
  const d = new Date(iso)
  const today = new Date()
  const yest  = new Date(); yest.setDate(today.getDate() - 1)
  if (sameDay(d, today)) return 'Today'
  if (sameDay(d, yest))  return 'Yesterday'
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
}

export function coverUrl(coverId, olKey, size = 'M') {
  if (coverId) return `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg`
  if (olKey)   return `https://covers.openlibrary.org/b/olid/${olKey.replace('/works/', '')}-${size}.jpg`
  return null
}

export const GENRE_COLOURS = ['#1a2744','#c8891a','#2A6E69','#5c6bc0','#b43a3a','#7b3fa0','#2e7d52','#7a5c2e']

export const GENRES = [
  'Fantasy','Science Fiction','Horror','Romance','Dystopian',
  'Literary Fiction','Historical Fiction','Thriller','Non-Fiction',
  'Short Stories','Graphic Novel','Poetry','Other'
]

const GOAL_KEY = 'litloop_goal_v1'
export function loadGoal()  { try { return parseInt(localStorage.getItem(GOAL_KEY)) || 12 } catch { return 12 } }
export function saveGoal(v) { try { localStorage.setItem(GOAL_KEY, String(v)) } catch {} }
