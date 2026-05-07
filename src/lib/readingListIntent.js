// ── Reading List Intent ───────────────────────────────────────────────────
// Persists a pending "mark as read" or "add to list" action across the
// auth redirect flow. Written before auth begins, consumed after login/signup.
//
// Shape stored in localStorage:
// {
//   action:    'mark-read' | 'add-to-list',
//   ol_key:    'OL12345W',
//   title:     'The Name of the Wind',
//   author:    'Patrick Rothfuss',
//   cover_url: 'https://afwvsrjbaxutfonmmxjd.supabase.co/storage/v1/object/public/...',
//   genre:     'fantasy',
//   list_name: 'Fantasy Top 100',
// }

const KEY = 'litloop_reading_list_intent'

export function saveIntent(intent) {
  try {
    localStorage.setItem(KEY, JSON.stringify(intent))
  } catch {}
}

export function loadIntent() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearIntent() {
  try {
    localStorage.removeItem(KEY)
  } catch {}
}

// Parse intent from URL search params (called on app load)
// e.g. ?action=mark-read&ol_key=OL12345W&title=...&author=...&cover_url=...&genre=fantasy&list=Fantasy+Top+100
export function parseIntentFromURL() {
  try {
    const params = new URLSearchParams(window.location.search)
    const action = params.get('action')
    if (action !== 'mark-read' && action !== 'add-to-list') return null
    const ol_key = params.get('ol_key')
    if (!ol_key) return null
    return {
      action,
      ol_key,
      title:     params.get('title')     || '',
      author:    params.get('author')    || '',
      cover_url: params.get('cover_url') || '',
      genre:     params.get('genre')     || '',
      list_name: params.get('list')      || '',
    }
  } catch {
    return null
  }
}
