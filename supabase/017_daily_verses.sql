-- ============================================================
-- Step 16: KKB BULSU Verse of the Day
-- Daily Scripture is sourced externally; reflections/prayers are
-- managed by approved officers, treasurers, and admins.
-- ============================================================

create table if not exists public.daily_verses (
  date          date primary key,
  reference     text not null check (char_length(reference) between 1 and 150),
  verse_text    text not null check (char_length(verse_text) between 1 and 5000),
  translation   text not null default 'BSB',
  reflection    text,
  prayer        text,
  published     boolean not null default true,
  created_by    uuid default auth.uid() references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);

create or replace function public.daily_verses_meta()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
    new.updated_at := null;
  else
    new.date := old.date;
    new.reference := old.reference;
    new.verse_text := old.verse_text;
    new.translation := old.translation;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  return new;
end $$;

drop trigger if exists daily_verses_meta_trg on public.daily_verses;
create trigger daily_verses_meta_trg
before insert or update on public.daily_verses
for each row execute function public.daily_verses_meta();

alter table public.daily_verses enable row level security;

drop policy if exists "daily verses: approved read" on public.daily_verses;
create policy "daily verses: approved read" on public.daily_verses
for select using (public.is_approved());

drop policy if exists "daily verses: approved create" on public.daily_verses;
create policy "daily verses: approved create" on public.daily_verses
for insert with check (public.is_approved());

drop policy if exists "daily verses: officer update" on public.daily_verses;
create policy "daily verses: officer update" on public.daily_verses
for update using (public.is_officer()) with check (public.is_officer());

drop policy if exists "daily verses: officer delete" on public.daily_verses;
create policy "daily verses: officer delete" on public.daily_verses
for delete using (public.is_officer());

-- Realtime lets the devotional update immediately when an officer saves a reflection.
do $$
begin
  alter publication supabase_realtime add table public.daily_verses;
exception
  when duplicate_object then null;
end $$;
