#!/usr/bin/env node
/**
 * Litloop Reading List Enrichment Script
 *
 * Usage:
 *   DRY_RUN=true node enrich.mjs     ← preview only, no writes
 *   node enrich.mjs                  ← full run
 *   node enrich.mjs --retry          ← rerun failures only
 *
 * After a full run, failures.json is written with every book that has
 * missing cover, description, or isbn. Run --retry as many times as needed.
 *
 * Env vars:
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   VITE_GOOGLE_BOOKS_API_KEY        (optional but recommended)
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Config ───────────────────────────────────────────────────────────────────

const DRY_RUN = process.env.DRY_RUN === 'true';
const IS_RETRY = process.argv.includes('--retry');
const DELAY_MS = 350;
const FAILURES_PATH = join(__dirname, 'failures.json');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GOOGLE_BOOKS_KEY = process.env.GOOGLE_BOOKS_API_KEY || '';
const STORAGE_BUCKET = 'book-covers';
const OL_COVER_BASE = 'https://covers.openlibrary.org/b/id';
const OL_SEARCH_BASE = 'https://openlibrary.org/search.json';
const OL_WORKS_BASE = 'https://openlibrary.org';
const GOOGLE_BOOKS_BASE = 'https://www.googleapis.com/books/v1/volumes';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ─── Failures file ────────────────────────────────────────────────────────────

// Shape of each failure record:
// {
//   title, author, year, genres,   ← original book data
//   book_id,                        ← supabase id if we got it
//   ol_key,                         ← null if not found
//   missing: ['cover','description','isbn'],   ← what needs fixing
//   attempts: 1,                    ← incremented each retry
//   last_error: 'string'
// }

function loadFailures() {
  if (!existsSync(FAILURES_PATH)) return [];
  try { return JSON.parse(readFileSync(FAILURES_PATH, 'utf8')); }
  catch { return []; }
}

function saveFailures(failures) {
  if (DRY_RUN) return;
  writeFileSync(FAILURES_PATH, JSON.stringify(failures, null, 2));
  console.log(`\n💾 failures.json saved (${failures.length} entries)`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '-').slice(0, 60);
}

function getLastName(author) {
  const parts = author.trim().split(/\s+/);
  return parts[parts.length - 1];
}

function stripSubtitle(title) {
  // "The Name of the Wind: The Kingkiller Chronicle" → "The Name of the Wind"
  return title.split(/[:\u2014]/)[0].trim();
}

function deduplicateBooks(allBooks) {
  const seen = new Map();
  for (const [genre, books] of Object.entries(allBooks)) {
    for (const book of books) {
      const key = slugify(book.title) + '::' + slugify(book.author);
      if (!seen.has(key)) {
        seen.set(key, { ...book, genres: [genre] });
      } else {
        seen.get(key).genres.push(genre);
      }
    }
  }
  return seen;
}

// ─── Open Library search ──────────────────────────────────────────────────────

async function olRawSearch(q) {
  const url = `${OL_SEARCH_BASE}?q=${encodeURIComponent(q)}&fields=key,title,author_name,isbn,cover_i&limit=5`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Litloop/1.0 (help@litloop.co)' } });
    if (!res.ok) return [];
    const data = await res.json();
    return data.docs || [];
  } catch { return []; }
}

function scoreDocs(docs, title, author) {
  const titleLower = stripSubtitle(title).toLowerCase();
  const lastName = getLastName(author).toLowerCase();

  return docs
    .map((doc) => {
      const docTitle = (doc.title || '').toLowerCase();
      const docAuthors = (doc.author_name || []).join(' ').toLowerCase();
      let score = 0;
      if (docTitle === titleLower) score += 4;
      else if (docTitle.includes(titleLower) || titleLower.includes(docTitle)) score += 2;
      if (docAuthors.includes(lastName)) score += 2;
      if (doc.cover_i) score += 1; // prefer docs with covers
      return { doc, score };
    })
    .sort((a, b) => b.score - a.score);
}

async function searchOpenLibrary(title, author) {
  const shortTitle = stripSubtitle(title);
  const lastName = getLastName(author);

  // Try 3 progressively looser strategies
  const strategies = [
    `${shortTitle} ${author}`,     // full title + full author
    `${shortTitle} ${lastName}`,   // short title + last name
    shortTitle,                     // title only (catches transliterations)
  ];

  for (const query of strategies) {
    const docs = await olRawSearch(query);
    await sleep(DELAY_MS);
    if (!docs.length) continue;

    const scored = scoreDocs(docs, title, author);
    const best = scored[0];
    if (best.score < 1) continue; // no meaningful match

    const doc = best.doc;
    const isbns = doc.isbn || [];
    return {
      ol_key: doc.key || null,
      cover_id: doc.cover_i ? String(doc.cover_i) : null,
      isbn: isbns.find((i) => i.length === 13) || isbns.find((i) => i.length === 10) || null,
    };
  }

  return null;
}

async function fetchOLDescription(olKey) {
  if (!olKey) return null;
  try {
    // Try works endpoint
    const res = await fetch(`${OL_WORKS_BASE}${olKey}.json`, {
      headers: { 'User-Agent': 'Litloop/1.0 (help@litloop.co)' },
    });
    if (res.ok) {
      const data = await res.json();
      const desc = data.description;
      const text = typeof desc === 'string' ? desc : desc?.value;
      if (text && text.length > 30) return text.slice(0, 5000);
    }
    await sleep(DELAY_MS);

    // Try editions endpoint — often has descriptions when works doesn't
    const edRes = await fetch(`${OL_WORKS_BASE}${olKey}/editions.json?limit=10`, {
      headers: { 'User-Agent': 'Litloop/1.0 (help@litloop.co)' },
    });
    if (edRes.ok) {
      const edData = await edRes.json();
      for (const edition of edData.entries || []) {
        const edDesc = edition.description;
        const text = typeof edDesc === 'string' ? edDesc : edDesc?.value;
        if (text && text.length > 30) return text.slice(0, 5000);
        // first_sentence is a decent fallback for a short description
        const sentence = edition.first_sentence?.value;
        if (sentence && sentence.length > 30) return sentence.slice(0, 5000);
      }
    }
  } catch {}
  return null;
}

// ─── Google Books ──────────────────────────────────────────────────────────────

async function searchGoogleBooks(title, author, isbn = null) {
  const keyParam = GOOGLE_BOOKS_KEY ? `&key=${GOOGLE_BOOKS_KEY}` : '';
  const shortTitle = stripSubtitle(title);
  const lastName = getLastName(author);

  // Strategy 1: ISBN lookup (most accurate)
  if (isbn) {
    try {
      const res = await fetch(`${GOOGLE_BOOKS_BASE}?q=isbn:${isbn}${keyParam}`);
      if (res.ok) {
        const data = await res.json();
        const result = data.items?.[0] ? parseGoogleItem(data.items[0]) : null;
        if (result?.description || result?.cover_url) return result;
      }
    } catch {}
    await sleep(DELAY_MS);
  }

  // Strategy 2: title + author
  try {
    const query = encodeURIComponent(`intitle:${shortTitle} inauthor:${lastName}`);
    const res = await fetch(`${GOOGLE_BOOKS_BASE}?q=${query}&maxResults=5${keyParam}`);
    if (res.ok) {
      const data = await res.json();
      if (data.items?.length) {
        // Pick the item with the most data
        for (const item of data.items) {
          const result = parseGoogleItem(item);
          if (result?.description && result?.cover_url) return result;
        }
        return parseGoogleItem(data.items[0]);
      }
    }
  } catch {}

  return null;
}

function parseGoogleItem(item) {
  if (!item) return null;
  const info = item.volumeInfo || {};
  const ids = info.industryIdentifiers || [];
  const isbn13 = ids.find((i) => i.type === 'ISBN_13')?.identifier || null;
  const isbn10 = ids.find((i) => i.type === 'ISBN_10')?.identifier || null;

  // Get the largest available thumbnail
  const links = info.imageLinks || {};
  let coverUrl = links.thumbnail || links.smallThumbnail || null;
  if (coverUrl) {
    coverUrl = coverUrl.replace('http:', 'https:');
    // Request zoom=1 for larger image
    if (!coverUrl.includes('zoom=')) coverUrl += '&zoom=1';
  }

  return {
    google_books_id: item.id,
    isbn: isbn13 || isbn10 || null,
    description: info.description || null,
    cover_url: coverUrl,
  };
}

// ─── Cover upload ──────────────────────────────────────────────────────────────

async function uploadOLCover(olKey, coverId) {
  if (!olKey || !coverId) return null;
  const folderName = olKey.replace('/works/', 'works_');
  const fileName = `${coverId}.jpg`;
  const storagePath = `${folderName}/${fileName}`;

  // Return existing URL if already uploaded
  const { data: existing } = await supabase.storage.from(STORAGE_BUCKET).list(folderName, { search: fileName });
  if (existing?.length) {
    return supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath).data.publicUrl;
  }

  // Try L then M size — OL returns a 1×1 blank for missing covers
  for (const size of ['L', 'M']) {
    try {
      const res = await fetch(`${OL_COVER_BASE}/${coverId}-${size}.jpg`);
      if (!res.ok) continue;
      const buffer = await res.arrayBuffer();
      if (buffer.byteLength < 1000) continue; // blank placeholder

      const { error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, buffer, { contentType: 'image/jpeg', upsert: true });
      if (error) continue;

      return supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath).data.publicUrl;
    } catch {}
  }
  return null;
}

async function uploadGoogleCover(googleBooksId, remoteCoverUrl) {
  if (!googleBooksId || !remoteCoverUrl) return null;
  const storagePath = `google_${googleBooksId}/cover.jpg`;

  const { data: existing } = await supabase.storage.from(STORAGE_BUCKET).list(`google_${googleBooksId}`, { search: 'cover.jpg' });
  if (existing?.length) {
    return supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath).data.publicUrl;
  }

  try {
    const res = await fetch(remoteCoverUrl);
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength < 1000) return null;

    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, buffer, { contentType: 'image/jpeg', upsert: true });
    if (error) return null;

    return supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath).data.publicUrl;
  } catch { return null; }
}

// ─── Core book enrichment ──────────────────────────────────────────────────────

async function enrichBook(bookData, existingRecord = null) {
  const { title, author, year } = bookData;

  // Carry forward anything we already have (useful in retry mode)
  let olKey = existingRecord?.ol_key || null;
  let coverId = existingRecord?.cover_id || null;
  let isbn = existingRecord?.isbn || null;
  let googleBooksId = existingRecord?.google_books_id || null;
  let coverUrl = null;
  let description = null;

  // ── 1. OL search (only if we don't already have ol_key) ────────────────────
  if (!olKey) {
    const olResult = await searchOpenLibrary(title, author);
    if (olResult) {
      olKey = olResult.ol_key;
      coverId = olResult.cover_id;
      if (!isbn) isbn = olResult.isbn;
    }
  }

  // ── 2. OL description ───────────────────────────────────────────────────────
  if (olKey && !description) {
    description = await fetchOLDescription(olKey);
    await sleep(DELAY_MS);
  }

  // ── 3. OL cover ─────────────────────────────────────────────────────────────
  if (olKey && coverId && !DRY_RUN) {
    coverUrl = await uploadOLCover(olKey, coverId);
  }

  // ── 4. Google Books fallback ─────────────────────────────────────────────────
  // Use whenever we're missing cover OR description OR found nothing on OL at all
  if (!coverUrl || !description || !olKey) {
    const gbResult = await searchGoogleBooks(title, author, isbn);
    await sleep(DELAY_MS);

    if (gbResult) {
      if (!googleBooksId) googleBooksId = gbResult.google_books_id;
      if (!isbn) isbn = gbResult.isbn;
      if (!description && gbResult.description) description = gbResult.description;

      if (!coverUrl && gbResult.cover_url && !DRY_RUN) {
        coverUrl = await uploadGoogleCover(googleBooksId, gbResult.cover_url);
      }
    }
  }

  // ── 5. Determine what's still missing ───────────────────────────────────────
  const missing = [];
  if (!olKey && !googleBooksId) missing.push('not_found');
  if (!coverUrl) missing.push('cover');
  if (!description) missing.push('description');
  if (!isbn) missing.push('isbn');

  const bookRow = {
    title,
    author,
    first_publish_year: year || null,
    ol_key: olKey,
    cover_id: coverId,
    cover_url: coverUrl,
    description: description?.slice(0, 5000) || null,
    isbn,
    google_books_id: googleBooksId,
    page_generated_at: new Date().toISOString(),
  };

  return { bookRow, missing };
}

// ─── DB upsert ─────────────────────────────────────────────────────────────────

async function upsertBook(bookRow) {
  if (DRY_RUN) return null;

  if (bookRow.ol_key) {
    const { data, error } = await supabase
      .from('books')
      .upsert(bookRow, { onConflict: 'ol_key' })
      .select('id')
      .single();
    if (error) { console.error(`    ❌ DB error: ${error.message}`); return null; }
    return data?.id;
  }

  // No ol_key — check by title + author to avoid duplicates
  const { data: existing } = await supabase
    .from('books')
    .select('id')
    .ilike('title', bookRow.title)
    .ilike('author', bookRow.author)
    .maybeSingle();

  if (existing) {
    await supabase.from('books').update(bookRow).eq('id', existing.id);
    return existing.id;
  }

  const { data, error } = await supabase
    .from('books')
    .insert(bookRow)
    .select('id')
    .single();
  if (error) { console.error(`    ❌ DB error: ${error.message}`); return null; }
  return data?.id;
}

// ─── Full run ──────────────────────────────────────────────────────────────────

async function fullRun(allBooks, lists) {
  const uniqueBooks = deduplicateBooks(allBooks);
  console.log(`📚 Unique books: ${uniqueBooks.size} across ${lists.length} genres\n`);

  // Step 1: reading_lists
  console.log('📋 Step 1: Upserting reading_lists...');
  const listIdMap = {};
  for (const list of lists) {
    if (DRY_RUN) { listIdMap[list.slug] = `dry-${list.slug}`; console.log(`  [DRY RUN] ${list.title}`); continue; }
    const { data, error } = await supabase
      .from('reading_lists')
      .upsert({ slug: list.slug, title: list.title, description: list.description }, { onConflict: 'slug' })
      .select('id')
      .single();
    if (error) { console.error(`  ❌ ${list.slug}: ${error.message}`); continue; }
    listIdMap[list.slug] = data.id;
    console.log(`  ✅ ${list.title}`);
  }

  // Step 2: Enrich books
  console.log(`\n📚 Step 2: Enriching books...\n`);
  const bookIdMap = new Map();
  const failures = [];
  let processed = 0;

  for (const [dedupeKey, bookData] of uniqueBooks) {
    processed++;
    process.stdout.write(`[${String(processed).padStart(4)}/${uniqueBooks.size}] ${bookData.title.slice(0, 45).padEnd(45)} `);

    let bookRow, missing;
    try {
      ({ bookRow, missing } = await enrichBook(bookData));
    } catch (err) {
      console.error(`ERROR: ${err.message}`);
      failures.push({ ...bookData, book_id: null, missing: ['error'], attempts: 1, last_error: err.message });
      continue;
    }

    // Compact status line
    const flags = [
      bookRow.ol_key ? '🟢OL' : '🔴OL',
      bookRow.cover_url ? '🖼️ ✓' : '🖼️ ✗',
      bookRow.description ? '📝✓' : '📝✗',
      bookRow.isbn ? '🔢✓' : '🔢✗',
    ].join(' ');
    console.log(flags);

    const bookId = await upsertBook(bookRow);
    if (bookId) bookIdMap.set(dedupeKey, bookId);

    if (missing.length > 0) {
      failures.push({
        title: bookData.title,
        author: bookData.author,
        year: bookData.year,
        genres: bookData.genres,
        book_id: bookId || null,
        ol_key: bookRow.ol_key || null,
        missing,
        attempts: 1,
        last_error: `Missing: ${missing.join(', ')}`,
      });
    }

    await sleep(100);
  }

  // Step 3: Junction rows
  console.log(`\n🔗 Step 3: Linking books to lists...`);
  for (const [genre, books] of Object.entries(allBooks)) {
    const listId = listIdMap[genre];
    if (!listId) { console.warn(`  ⚠️  No list ID for "${genre}"`); continue; }

    const rows = books
      .map((book) => {
        const key = slugify(book.title) + '::' + slugify(book.author);
        const bookId = bookIdMap.get(key);
        return bookId ? { list_id: listId, book_id: bookId, position: book.position } : null;
      })
      .filter(Boolean);

    if (DRY_RUN) { console.log(`  [DRY RUN] ${genre}: ${rows.length} rows`); continue; }

    for (let i = 0; i < rows.length; i += 50) {
      const { error } = await supabase
        .from('reading_list_books')
        .upsert(rows.slice(i, i + 50), { onConflict: 'list_id,book_id' });
      if (error) console.error(`  ❌ Junction error (${genre}): ${error.message}`);
    }
    console.log(`  ✅ ${genre}: ${rows.length} books linked`);
  }

  return { failures, total: uniqueBooks.size };
}

// ─── Retry run ─────────────────────────────────────────────────────────────────

async function retryRun() {
  const failures = loadFailures();
  if (!failures.length) {
    console.log('✅ failures.json is empty — nothing to retry.');
    return;
  }

  console.log(`🔁 Retrying ${failures.length} books...\n`);
  const stillFailing = [];

  for (let i = 0; i < failures.length; i++) {
    const failure = failures[i];
    process.stdout.write(`[${String(i + 1).padStart(4)}/${failures.length}] ${failure.title.slice(0, 40).padEnd(40)} `);

    // Fetch existing DB record so we can carry forward what we have
    let existingRecord = null;
    if (!DRY_RUN && failure.book_id) {
      const { data } = await supabase.from('books').select('*').eq('id', failure.book_id).maybeSingle();
      existingRecord = data;
    }

    let bookRow, missing;
    try {
      ({ bookRow, missing } = await enrichBook(failure, existingRecord));
    } catch (err) {
      console.error(`ERROR: ${err.message}`);
      stillFailing.push({ ...failure, attempts: (failure.attempts || 1) + 1, last_error: err.message });
      continue;
    }

    const flags = [
      bookRow.ol_key ? '🟢OL' : '🔴OL',
      bookRow.cover_url ? '🖼️ ✓' : '🖼️ ✗',
      bookRow.description ? '📝✓' : '📝✗',
      bookRow.isbn ? '🔢✓' : '🔢✗',
    ].join(' ');
    console.log(flags);

    // Always update DB — partial improvements are still valuable
    let bookId = failure.book_id;
    if (!DRY_RUN) bookId = await upsertBook(bookRow) || failure.book_id;

    if (missing.length > 0) {
      stillFailing.push({
        ...failure,
        book_id: bookId,
        ol_key: bookRow.ol_key || failure.ol_key,
        missing,
        attempts: (failure.attempts || 1) + 1,
        last_error: `Still missing after ${(failure.attempts || 1) + 1} attempts: ${missing.join(', ')}`,
      });
    }

    await sleep(150);
  }

  saveFailures(stillFailing);
  console.log(`\n📊 Retry complete:`);
  console.log(`   ✅ Resolved: ${failures.length - stillFailing.length}`);
  console.log(`   ⚠️  Still failing: ${stillFailing.length}`);

  if (stillFailing.length > 0) {
    const byType = {
      not_found: stillFailing.filter((f) => f.missing.includes('not_found')).length,
      cover: stillFailing.filter((f) => f.missing.includes('cover')).length,
      description: stillFailing.filter((f) => f.missing.includes('description')).length,
      isbn: stillFailing.filter((f) => f.missing.includes('isbn')).length,
    };
    console.log(`\n   Still missing breakdown:`);
    if (byType.not_found) console.log(`     ❌ Not found anywhere: ${byType.not_found}`);
    if (byType.cover) console.log(`     🖼️  No cover: ${byType.cover}`);
    if (byType.description) console.log(`     📝 No description: ${byType.description}`);
    if (byType.isbn) console.log(`     🔢 No ISBN: ${byType.isbn}`);
    console.log(`\n   Run again: node enrich.mjs --retry`);
  }
}

// ─── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🚀 Litloop Reading List Enrichment`);
  console.log(`   Mode: ${DRY_RUN ? '🔍 DRY RUN' : IS_RETRY ? '🔁 RETRY' : '✍️  LIVE'}`);
  console.log(`   Supabase: ${SUPABASE_URL}\n`);

  if (IS_RETRY) {
    await retryRun();
    return;
  }

  const allBooks = JSON.parse(readFileSync(join(__dirname, 'books.json'), 'utf8'));
  const lists = JSON.parse(readFileSync(join(__dirname, 'lists.json'), 'utf8'));

  const { failures, total } = await fullRun(allBooks, lists);

  saveFailures(failures);

  console.log(`\n✨ Done!`);
  console.log(`   ✅ Fully enriched: ${total - failures.length}/${total}`);
  console.log(`   ⚠️  Partial/missing: ${failures.length}`);

  if (failures.length > 0) {
    const byType = {
      not_found: failures.filter((f) => f.missing.includes('not_found')).length,
      cover: failures.filter((f) => f.missing.includes('cover')).length,
      description: failures.filter((f) => f.missing.includes('description')).length,
      isbn: failures.filter((f) => f.missing.includes('isbn')).length,
    };
    console.log(`\n   Missing breakdown:`);
    if (byType.not_found) console.log(`     ❌ Not found anywhere: ${byType.not_found}`);
    if (byType.cover) console.log(`     🖼️  No cover: ${byType.cover}`);
    if (byType.description) console.log(`     📝 No description: ${byType.description}`);
    if (byType.isbn) console.log(`     🔢 No ISBN: ${byType.isbn}`);
    console.log(`\n   → Run "node enrich.mjs --retry" to attempt recovery\n`);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
