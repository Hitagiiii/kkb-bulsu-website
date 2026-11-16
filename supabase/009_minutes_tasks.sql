-- ============================================================
-- Step 12: Meeting minutes + tasks (action items)
-- Run it after 008_documents.sql
-- ============================================================

create table if not exists public.minutes (
  id                  uuid primary key default gen_random_uuid(),
  title               text not null check (char_length(title) between 1 and 150),
  held_at             timestamptz not null default now(),
  attendees           text not null default '',
  body                text not null,
  visible_to_members  boolean not null default false,
  created_by          uuid default auth.uid() references public.profiles(id),
  author_name         text not null default '',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz
);

create table if not exists public.tasks (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (char_length(title) between 1 and 200),
  description   text,
  due_on        date,
  status        text not null default 'todo' check (status in ('todo','doing','done')),
  assigned_to   uuid references public.profiles(id) on delete set null,
  minutes_id    uuid references public.minutes(id) on delete set null,
  created_by    uuid default auth.uid() references public.profiles(id),
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);
create index if not exists tasks_assignee_idx on public.tasks (assigned_to, status);

create or replace function public.minutes_meta()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
    new.author_name := coalesce((select full_name from public.profiles where id = new.created_by), '');
    new.updated_at := null;
  else
    new.created_by  := old.created_by;
    new.author_name := old.author_name;
    new.created_at  := old.created_at;
    new.updated_at  := now();
  end if;
  return new;
end $$;
drop trigger if exists minutes_meta_trg on public.minutes;
create trigger minutes_meta_trg before insert or update on public.minutes
  for each row execute function public.minutes_meta();

create or replace function public.task_meta()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
    new.completed_at := case when new.status = 'done' then now() end;
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    if new.status = 'done' and old.status <> 'done' then
      new.completed_at := now();
    elsif new.status <> 'done' then
      new.completed_at := null;
    else
      new.completed_at := old.completed_at;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists task_meta_trg on public.tasks;
create trigger task_meta_trg before insert or update on public.tasks
  for each row execute function public.task_meta();

alter table public.minutes enable row level security;
alter table public.tasks   enable row level security;

-- Minutes: officers see everything. Members only see minutes marked as shared.
drop policy if exists "minutes: read" on public.minutes;
create policy "minutes: read" on public.minutes
  for select using (public.is_officer() or (visible_to_members and public.is_approved()));
drop policy if exists "minutes: officer write" on public.minutes;
create policy "minutes: officer write" on public.minutes for all
  using (public.is_officer()) with check (public.is_officer());

-- Tasks: officers only
drop policy if exists "tasks: officer read" on public.tasks;
create policy "tasks: officer read" on public.tasks for select using (public.is_officer());
drop policy if exists "tasks: officer insert" on public.tasks;
create policy "tasks: officer insert" on public.tasks for insert with check (public.is_officer());
drop policy if exists "tasks: officer update" on public.tasks;
create policy "tasks: officer update" on public.tasks
  for update using (public.is_officer()) with check (public.is_officer());
drop policy if exists "tasks: creator or admin delete" on public.tasks;
create policy "tasks: creator or admin delete" on public.tasks
  for delete using (public.is_officer() and (created_by = auth.uid() or public.is_admin()));
