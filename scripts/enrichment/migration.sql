-- ============================================================
-- Litloop Reading Lists Migration
-- Run in Supabase SQL editor (production)
-- ============================================================

-- 1. reading_lists table
create table if not exists public.reading_lists (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  description text,
  created_at timestamptz default now()
);

-- 2. reading_list_books junction table
create table if not exists public.reading_list_books (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.reading_lists(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  position integer not null,
  unique(list_id, book_id)
);

-- 3. Indexes
create index if not exists idx_reading_list_books_list_id on public.reading_list_books(list_id);
create index if not exists idx_reading_list_books_book_id on public.reading_list_books(book_id);
create index if not exists idx_reading_lists_slug on public.reading_lists(slug);

-- 4. RLS
alter table public.reading_lists enable row level security;
alter table public.reading_list_books enable row level security;

-- Public read access (these are editorial lists, not user data)
create policy "reading_lists_public_read"
  on public.reading_lists for select
  using (true);

create policy "reading_list_books_public_read"
  on public.reading_list_books for select
  using (true);
