# Litloop Reading List Enrichment

Populates `books`, `reading_lists`, and `reading_list_books` with all 15 genre top-100 lists, enriched from Open Library and Google Books.

## Setup

```bash
cd scripts/enrichment
npm install
export $(grep -v '^#' ../../.env | xargs)
```

## Step 1 — Run the SQL migration

In Supabase dashboard → SQL editor, run `migration.sql`.

## Step 2 — Dry run

```bash
npm run dry-run
```

Logs what would happen. No writes.

## Step 3 — Full run

```bash
npm start
```

Takes ~20 minutes. Each book shows a status line:

```
[ 142/1284] The Name of the Wind              🟢OL 🖼️ ✓ 📝✓ 🔢✓
[ 143/1284] Gormenghast                       🟢OL 🖼️ ✗ 📝✓ 🔢✗
```

- `🟢OL` / `🔴OL` — found / not found on Open Library
- `🖼️ ✓/✗` — cover uploaded / missing
- `📝✓/✗` — description found / missing
- `🔢✓/✗` — ISBN found / missing

When finished, `failures.json` is written with every book that has anything missing.

## Step 4 — Retry failures

```bash
npm run retry
```

Reprocesses only the books in `failures.json` using smarter search strategies:
- Looser title matching (strips subtitles, tries title-only)
- Last-name only author matching
- ISBN-first lookup on Google Books
- Tries OL cover sizes L then M (detects blank placeholders)

Each partial improvement is written back to the DB even if not fully resolved. Run `--retry` as many times as you like until the failure count stops dropping.

```bash
# Preview what retry would do first
npm run retry:dry
```

## Failure categories

After retry runs stabilise, the remaining failures.json entries will typically be:

- **not_found** — book is too obscure for OL or Google Books. These need manual data entry — usually self-published, small press, or very old titles.
- **cover** — book was found but no cover image exists in either API. Manual upload needed.
- **description** — found but no description. Can be manually written (good SEO opportunity anyway).
- **isbn** — missing ISBN. Low priority — only needed for certain downstream features.

## Re-running safely

Fully idempotent. Upserts on `ol_key`, skips already-uploaded covers. Safe to re-run the full script or retry at any time.

## Files

| File | Purpose |
|------|---------|
| `enrich.mjs` | Main script |
| `books.json` | All 15 genre lists (1,300 books) |
| `lists.json` | Genre metadata (slug, title, description) |
| `migration.sql` | Supabase schema migration |
| `failures.json` | Auto-generated — books needing attention |
