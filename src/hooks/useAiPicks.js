import { useState, useEffect } from 'react'
import { sb } from '../lib/supabase'

async function callRecsAPI(prompt) {
  // Derive URL and key from the existing Supabase client to avoid env var issues
  const supabaseUrl  = sb.supabaseUrl
  const supabaseKey  = sb.supabaseKey
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20000)
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/recommendations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ prompt }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData?.error || errData?.message || `HTTP ${res.status}`)
    }
    const data = await res.json()
    const text = data.text || ''
    if (!text) throw new Error('Empty response from AI')
    const clean = text.replace(/```json|```/g, '').trim()
    return JSON.parse(clean)
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Request timed out — please try again.')
    throw e
  } finally {
    clearTimeout(timeout)
  }
}

async function searchOLCover(title, author) {
  const cleanTitle = (title || '').replace(/\s*\([^)]*#\d[^)]*\)/g, '').replace(/[:\u2014\u2013].*/u, '').trim()
  const cleanAuthor = author ? author.split(',')[0].split(' ').pop() : ''
  const strategies = [
    cleanAuthor ? `title=${encodeURIComponent(cleanTitle)}&author=${encodeURIComponent(cleanAuthor)}&type=work` : null,
    `title=${encodeURIComponent(cleanTitle)}&type=work`,
  ].filter(Boolean)
  for (const params of strategies) {
    try {
      const res = await fetch(`https://openlibrary.org/search.json?${params}&fields=cover_i,key&limit=5`)
      const data = await res.json()
      const doc = (data.docs || []).find(d => d.cover_i)
      if (doc?.cover_i) return { coverId: doc.cover_i, olKey: doc.key || null }
    } catch {}
  }
  return { coverId: null, olKey: null }
}

export function useAiPicks(user, books) {
  const [state, setState]       = useState('idle') // idle | loading | done | error
  const [recs, setRecs]         = useState([])     // [{title,author,why,desc,coverId,olKey}]
  const [dismissed, setDismissed] = useState(new Set())
  const [added, setAdded]       = useState(new Set())
  const [error, setError]       = useState(null)
  const [loaded, setLoaded]     = useState(false)

  // Load persisted picks from Supabase on login
  useEffect(() => {
    if (!user) {
      setState('idle'); setRecs([]); setDismissed(new Set()); setAdded(new Set())
      setLoaded(false); return
    }
    loadFromDB()
  }, [user?.id])

  async function loadFromDB() {
    const { data } = await sb
      .from('profiles')
      .select('ai_picks')
      .eq('id', user.id)
      .single()
    if (data?.ai_picks) {
      const p = data.ai_picks
      setRecs(p.recs || [])
      setDismissed(new Set(p.dismissed || []))
      setAdded(new Set(p.added || []))
      setState(p.recs?.length ? 'done' : 'idle')
    }
    setLoaded(true)
  }

  async function saveToDB(newRecs, newDismissed, newAdded) {
    if (!user) return
    await sb.from('profiles').update({
      ai_picks: {
        recs: newRecs,
        dismissed: [...newDismissed],
        added: [...newAdded],
        savedAt: new Date().toISOString(),
      }
    }).eq('id', user.id)
  }

  function buildPrompt() {
    const read    = books.filter(b => b.status === 'read')
    const reading = books.filter(b => b.status === 'reading')
    const dnf     = books.filter(b => b.status === 'dnf').slice(0, 4)
    const tbr     = books.filter(b => b.status === 'tbr').slice(0, 5)
    const genres  = [...new Set(books.map(b => b.genre).filter(Boolean))]
    const topRated = read.filter(b => b.rating >= 4).slice(0, 8)
    const sample   = topRated.length ? topRated : read.slice(0, 6)
    const safe = s => (s || '').replace(/[\r\n]+/g, ' ').slice(0, 200)
    const fmt  = b => `"${safe(b.title)}"${b.author ? ` by ${safe(b.author)}` : ''}${b.genre ? ` (${safe(b.genre)})` : ''}${b.rating ? ` ${b.rating}/5` : ''}`
    return `You are a deeply well-read friend giving personalised book recommendations.\n\nHere is someone's reading history:\n\nLOVED (4-5 stars):\n${sample.map(fmt).join('\n') || 'None yet'}\n\nCURRENTLY READING:\n${reading.map(fmt).join('\n') || 'Nothing'}\n\nDID NOT FINISH:\n${dnf.map(b => `"${safe(b.title)}"${b.author ? ` by ${safe(b.author)}` : ''}`).join('\n') || 'None'}\n\nWANTS TO READ:\n${tbr.map(b => safe(b.title)).join(', ') || 'Empty'}\n\nGenres they read: ${genres.map(safe).join(', ') || 'mixed'}. Total finished: ${read.length}.\n\nRecommend exactly 6 books. These can include books they have already read if they are highly relevant — the point is to surface great reads. Respond ONLY with valid JSON array, no markdown, no preamble:\n[{"title":"...","author":"...","why":"one sentence referencing their specific reading history","desc":"one sentence on what makes this book special"}]`
  }

  async function fetchPicks() {
    const readOrReading = books.filter(b => b.status === 'read' || b.status === 'reading')
    if (!readOrReading.length) {
      setError('Log some books first — Claude needs your reading history to make great picks!')
      setState('error'); return
    }
    setState('loading'); setError(null)
    try {
      const result = await callRecsAPI(buildPrompt())
      if (!Array.isArray(result) || !result.length) throw new Error('No recommendations returned.')

      // Enrich with OL covers sequentially to avoid rate limiting
      const enriched = [...result]
      const newRecs = result.map(r => ({ ...r, coverId: null, olKey: null }))
      setRecs(newRecs)
      setState('done')
      const newDismissed = new Set()
      const newAdded = new Set()
      setDismissed(newDismissed)
      setAdded(newAdded)
      await saveToDB(newRecs, newDismissed, newAdded);

      // Fetch covers in background
      ;(async () => {
        for (let i = 0; i < enriched.length; i++) {
          const { coverId, olKey } = await searchOLCover(enriched[i].title, enriched[i].author)
          enriched[i] = { ...enriched[i], coverId, olKey }
          setRecs(prev => {
            const updated = [...prev]
            updated[i] = { ...updated[i], coverId, olKey }
            return updated
          })
          await new Promise(r => setTimeout(r, 300))
        }
        // Save with covers filled in
        await saveToDB(enriched, newDismissed, newAdded)
      })()

    } catch (err) {
      setState('error'); setError(err.message)
    }
  }

  function dismiss(index) {
    setDismissed(prev => {
      const next = new Set(prev)
      next.add(index)
      saveToDB(recs, next, added)
      return next
    })
  }

  function markAdded(index) {
    setAdded(prev => {
      const next = new Set(prev)
      next.add(index)
      saveToDB(recs, dismissed, next)
      return next
    })
  }

  function refresh() {
    setRecs([]); setDismissed(new Set()); setAdded(new Set())
    setState('idle'); setError(null)
    saveToDB([], new Set(), new Set())
  }

  // Visible = not dismissed. Empty state when all dismissed or added
  const visibleRecs = recs.map((r, i) => ({ ...r, _index: i }))
    .filter(r => !dismissed.has(r._index))

  const allActedOn = recs.length > 0 &&
    recs.every((_, i) => dismissed.has(i) || added.has(i))

  return {
    state: allActedOn ? 'idle' : state,
    recs: visibleRecs,
    dismissed,
    added,
    error: allActedOn ? null : error,
    loaded,
    fetchPicks,
    dismiss,
    markAdded,
    refresh,
  }
}