// ─────────────────────────────────────────────────────────────
// importManager.js
//
// Runs a Goodreads / StoryGraph CSV import entirely outside any
// React component lifecycle.  Navigation, modal closes, and tab
// switches cannot cancel it.
//
// Progress is written to sessionStorage under 'litloop_import'
// so AppShell's existing banner can poll and display it.
//
// Usage:
//   import { startBackgroundImport, abortImport } from './importManager'
//   startBackgroundImport({ csvText, type, userId, addBook, existingBooks })
//
// The returned value is ignored — callers don't need to await it.
// ─────────────────────────────────────────────────────────────

import { processGoodreadsCSV, processStorygraphCSV } from './importBooks'

const SESSION_KEY = 'litloop_import'

// Active AbortController so an explicit "cancel" button can stop it
let activeController = null

// ── Public API ────────────────────────────────────────────────

/**
 * Start an import. Safe to call and immediately navigate away.
 *
 * @param {object} opts
 * @param {string}   opts.csvText        - raw CSV string
 * @param {'goodreads'|'storygraph'} opts.type
 * @param {Function} opts.addBook        - the addBook fn from useBooksContext
 * @param {Array}    opts.existingBooks  - current books array for dupe detection
 */
export async function startBackgroundImport({ csvText, type, addBook, existingBooks = [] }) {
  // Cancel any in-flight import
  if (activeController) activeController.abort()
  activeController = new AbortController()
  const signal = activeController.signal

  _writeProgress({ status: 'loading', msg: 'Reading CSV…', done: 0, total: 0 })

  try {
    const processFn = type === 'goodreads' ? processGoodreadsCSV : processStorygraphCSV

    const onProgress = (done, total) => {
      if (signal.aborted) return
      _writeProgress({
        status: 'loading',
        msg: `Matching books… ${done} of ${total}`,
        done,
        total,
        pct: total > 0 ? Math.round((done / total) * 100) : 0,
      })
    }

    const { books: imported, skipped, matched } = await processFn(csvText, existingBooks, onProgress)

    if (signal.aborted) return

    if (!imported.length) {
      const msg = skipped > 0
        ? `All ${skipped} book${skipped !== 1 ? 's' : ''} already in your list`
        : 'No valid books found in the file'
      _writeProgress({ status: 'done', msg })
      return
    }

    // Save books one by one — each write is small and survivable
    _writeProgress({ status: 'loading', msg: `Saving ${imported.length} books…`, done: 0, total: imported.length, pct: 0 })

    let saved = 0
    for (const book of imported) {
      if (signal.aborted) return
      await addBook({ ...book, silent: true })
      saved++
      // Update every 5 saves to avoid flooding sessionStorage writes
      if (saved % 5 === 0 || saved === imported.length) {
        _writeProgress({
          status: 'loading',
          msg: `Saving books… ${saved} of ${imported.length}`,
          done: saved,
          total: imported.length,
          pct: Math.round((saved / imported.length) * 100),
        })
      }
    }

    if (signal.aborted) return

    const parts = [
      `✓ Imported ${imported.length} book${imported.length !== 1 ? 's' : ''}`,
      skipped  ? `${skipped} already in list`               : null,
      matched  ? `${matched} matched to Open Library`       : null,
    ].filter(Boolean)

    _writeProgress({ status: 'done', msg: parts.join(' · '), done: imported.length, total: imported.length, pct: 100 })

  } catch (err) {
    if (signal.aborted) return
    _writeProgress({ status: 'error', msg: `Import failed — ${err?.message || 'please try again'}` })
  } finally {
    activeController = null
  }
}

/** Cancel any running import immediately. */
export function abortImport() {
  if (activeController) {
    activeController.abort()
    activeController = null
  }
  try { sessionStorage.removeItem(SESSION_KEY) } catch {}
}

/** True if an import is currently in progress. */
export function isImporting() {
  return activeController !== null
}

/** Read current progress state from sessionStorage. */
export function getImportProgress() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null') } catch { return null }
}

// ── Internal ──────────────────────────────────────────────────

function _writeProgress(state) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(state)) } catch {}
}
