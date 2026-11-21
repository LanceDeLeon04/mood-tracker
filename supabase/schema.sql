-- ============================================================
--  SCS External Princess Mood Checker — Supabase schema
--  Run this once in: Supabase Dashboard → SQL Editor → New query
--  Safe to re-run (uses IF NOT EXISTS / DROP POLICY IF EXISTS).
-- ============================================================

create table if not exists public.mood_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  logged_at   timestamptz not null default now(),          -- when the mood happened
  mood        text not null check (mood in (
                'slay','glow','happy','chill','meh','sleepy','stressed','sad','angry','crisis')),
  energy      smallint not null default 5 check (energy between 0 and 10),
  stress      smallint not null default 5 check (stress between 0 and 10),
  social      smallint not null default 5 check (social between 0 and 10),
  tags        text[] not null default '{}',                 -- mood factors
  care        text[] not null default '{}',                 -- self-care rituals done
  note        text not null default '' check (char_length(note) <= 400),
  is_sample   boolean not null default false,               -- demo rows (removable from the app)
  created_at  timestamptz not null default now()
);

-- If you ran an earlier version of this schema, this adds the one new column and changes nothing else.
alter table public.mood_entries add column if not exists is_sample boolean not null default false;

create index if not exists mood_entries_user_logged_idx on public.mood_entries (user_id, logged_at desc);

-- Row Level Security: every user can only see and change their OWN entries.
alter table public.mood_entries enable row level security;

drop policy if exists "mood_entries_select_own" on public.mood_entries;
drop policy if exists "mood_entries_insert_own" on public.mood_entries;
drop policy if exists "mood_entries_update_own" on public.mood_entries;
drop policy if exists "mood_entries_delete_own" on public.mood_entries;

create policy "mood_entries_select_own" on public.mood_entries
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "mood_entries_insert_own" on public.mood_entries
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "mood_entries_update_own" on public.mood_entries
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "mood_entries_delete_own" on public.mood_entries
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Logged-out visitors (anon key) get nothing at all.
revoke all on public.mood_entries from anon;
grant select, insert, update, delete on public.mood_entries to authenticated;
