import { sb } from './supabase'

const BUCKET = 'book-covers'
const SUPABASE_URL = import.meta.env.SUPABASE_URL

/**
 * Given a coverId (Open Library numeric ID), fetch the image from OL,
 * upload it to Supabase Storage, update the books table with the new URL,
 * and return the Supabase public URL.
 *
 * Returns null on any failure (caller should fall back to OL URL).
 */
export async function uploadCoverToSupabase(coverId, olKey) {
  if (!coverId || !olKey) return null

  // olKey must look like a real OL key e.g. "/works/OL12345W"
  // Guard prevents titles or other strings leaking in as folder names
  if (!String(olKey).match(/OL\d+[A-Z]/)) return null

  // Build a storage-safe folder name: strip leading slash, replace remaining
  // slashes with underscores, then remove any char that isn't alphanumeric/underscore/hyphen
  const safeFolder = String(olKey)
    .replace(/^\//, '')
    .replace(/\//g, '_')
    .replace(/[^a-zA-Z0-9_\-]/g, '')

  if (!safeFolder) return null

  const path = `${safeFolder}/${coverId}.jpg`

  // Check if already uploaded (avoid re-uploading on every render)
  const { data: existing } = await sb.storage.from(BUCKET).list(safeFolder)
  if (existing?.some(f => f.name === `${coverId}.jpg`)) {
    return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`
  }

  // Fetch from Open Library
  let blob
  try {
    const res = await fetch(`https://covers.openlibrary.org/b/id/${coverId}-M.jpg`)
    if (!res.ok) return null
    blob = await res.blob()
    // OL returns a tiny 1x1 gif for missing covers — skip those
    if (blob.size < 1000) return null
  } catch {
    return null
  }

  // Upload to Supabase Storage
  const { error: uploadError } = await sb.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', upsert: true })

  if (uploadError) {
    console.error('[CoverCache] upload error:', uploadError)
    return null
  }

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`

  // Persist the URL back to the books table so future loads skip OL entirely
  await sb
    .from('books')
    .update({ cover_url: publicUrl })
    .eq('ol_key', olKey)

  return publicUrl
}

/**
 * Register the service worker for cache-first cover serving.
 * Call once on app startup.
 */
export function registerCoverServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('[CoverCache] SW registration failed:', err)
    })
  }
}

/**
 * Clear the cover image cache via the service worker.
 * Returns a promise that resolves when done.
 */
export async function clearCoverCache() {
  // Also clear via Cache API directly (works even without SW message channel)
  if ('caches' in window) {
    await caches.delete('litloop-covers-v1')
  }
}