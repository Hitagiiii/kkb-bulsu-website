-- KKB BULSU Personal Hub
-- Migration 019. 016 remains Merch Order Realtime; 017 Verse of the Day;
-- 018 Documents/Minutes role restriction. Run this migration once.

create table if not exists public.personal_todos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  description text check (description is null or char_length(description) <= 1000),
  due_on date,
  is_completed boolean not null default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint personal_todos_completion_consistency check (
    (is_completed = false and completed_at is null) or
    (is_completed = true and completed_at is not null)
  )
);

create table if not exists public.personal_goals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  details text check (details is null or char_length(details) <= 5000),
  progress integer not null default 0 check (progress between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.personal_planner (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  details text check (details is null or char_length(details) <= 5000),
  due_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.personal_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  details text check (details is null or char_length(details) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.personal_devotionals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  details text check (details is null or char_length(details) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists personal_todos_owner_created_idx on public.personal_todos (owner_id, created_at desc);
create index if not exists personal_goals_owner_created_idx on public.personal_goals (owner_id, created_at desc);
create index if not exists personal_planner_owner_date_idx on public.personal_planner (owner_id, due_on);
create index if not exists personal_notes_owner_created_idx on public.personal_notes (owner_id, created_at desc);
create index if not exists personal_devotionals_owner_created_idx on public.personal_devotionals (owner_id, created_at desc);

-- Owner CRUD and admin read-only oversight. Admin access applies to all personal hub content.
do $$
declare tbl text;
begin
  foreach tbl in array array['personal_todos','personal_goals','personal_planner','personal_notes','personal_devotionals'] loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || ': owner and admin read', tbl);
    execute format('create policy %I on public.%I for select using (owner_id = auth.uid() or public.is_admin())', tbl || ': owner and admin read', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || ': owner insert', tbl);
    execute format('create policy %I on public.%I for insert with check (owner_id = auth.uid() and public.is_approved())', tbl || ': owner insert', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || ': owner update', tbl);
    execute format('create policy %I on public.%I for update using (owner_id = auth.uid()) with check (owner_id = auth.uid())', tbl || ': owner update', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || ': owner delete', tbl);
    execute format('create policy %I on public.%I for delete using (owner_id = auth.uid())', tbl || ': owner delete', tbl);
  end loop;
end $$;

-- Enable Realtime on all personal hub tables when not already published.
do $$
declare tbl text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach tbl in array array['personal_todos','personal_goals','personal_planner','personal_notes','personal_devotionals'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = tbl) then
        execute format('alter publication supabase_realtime add table public.%I', tbl);
      end if;
    end loop;
  end if;
end $$;
