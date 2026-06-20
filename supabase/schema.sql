-- ============================================================================
-- AI Finance Insights — Supabase schema + Row-Level Security (RLS)
-- ============================================================================
-- RLS is the key security pattern here (and exactly what senior full-stack
-- roles probe). Instead of filtering "WHERE user_id = :me" in every query,
-- Postgres enforces it at the row level: a user can ONLY ever see their own
-- rows, even if the API has a bug. Defense in depth.
-- ============================================================================

-- ---- transactions: the core table -----------------------------------------
create table if not exists public.transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  date        date not null,
  description text not null,
  amount      numeric(12,2) not null,         -- negative = spend, positive = income
  category    text,                            -- filled by AI in Milestone 3
  raw         jsonb,                           -- original CSV row, for auditability
  created_at  timestamptz not null default now()
);

-- Index for the common query: "my transactions, newest first"
create index if not exists transactions_user_date_idx
  on public.transactions (user_id, date desc);

-- ---- insights: cached AI output (optional, Milestone 5/6) ------------------
create table if not exists public.insights (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  period      text not null,                   -- e.g. '2026-06'
  summary     text,                            -- Claude's plain-English summary
  forecast    numeric(12,2),                   -- next-month projected spend
  created_at  timestamptz not null default now(),
  unique (user_id, period)
);

-- ============================================================================
-- ROW-LEVEL SECURITY
-- ============================================================================
alter table public.transactions enable row level security;
alter table public.insights     enable row level security;

-- auth.uid() returns the id of the currently-authenticated user (from the JWT).
-- These policies say: you can only touch rows where user_id = your own id.
-- (Each policy is dropped-if-exists first, so this whole file is safe to re-run.)

drop policy if exists "own transactions - select" on public.transactions;
create policy "own transactions - select"
  on public.transactions for select using (auth.uid() = user_id);
drop policy if exists "own transactions - insert" on public.transactions;
create policy "own transactions - insert"
  on public.transactions for insert with check (auth.uid() = user_id);
drop policy if exists "own transactions - update" on public.transactions;
create policy "own transactions - update"
  on public.transactions for update using (auth.uid() = user_id);
drop policy if exists "own transactions - delete" on public.transactions;
create policy "own transactions - delete"
  on public.transactions for delete using (auth.uid() = user_id);

drop policy if exists "own insights - all" on public.insights;
create policy "own insights - all"
  on public.insights for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
