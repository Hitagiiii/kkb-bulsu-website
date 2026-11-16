-- ============================================================
-- Step 9: QR attendance + RSVP (with optional capacity)
-- Paste into Supabase > SQL Editor > New query > Run
-- Run it after 005_polls.sql
-- ============================================================

alter table public.events add column if not exists capacity int;
do $$ begin
  alter table public.events add constraint events_capacity_positive
    check (capacity is null or capacity > 0);
exception when duplicate_object then null; end $$;

-- ---------- QR TOKENS (only officers can read them) ----------
create table if not exists public.event_tokens (
  event_id uuid primary key references public.events(id) on delete cascade,
  token    text not null unique default replace(gen_random_uuid()::text, '-', '')
);
alter table public.event_tokens enable row level security;
drop policy if exists "event_tokens: officer read" on public.event_tokens;
create policy "event_tokens: officer read" on public.event_tokens
  for select using (public.is_officer());

create or replace function public.create_event_token()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.event_tokens (event_id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists event_token_trg on public.events;
create trigger event_token_trg after insert on public.events
  for each row execute function public.create_event_token();

-- events that already exist
insert into public.event_tokens (event_id) select id from public.events on conflict do nothing;

-- If a QR code leaks, officers can replace it
create or replace function public.reset_event_token(p_event uuid)
returns text language plpgsql security definer set search_path = public as $$
declare t text;
begin
  if not public.is_officer() then raise exception 'Only officers can do this'; end if;
  update public.event_tokens set token = replace(gen_random_uuid()::text, '-', '')
  where event_id = p_event returning token into t;
  return t;
end $$;
revoke all on function public.reset_event_token(uuid) from public, anon;
grant execute on function public.reset_event_token(uuid) to authenticated;

-- ---------- ATTENDANCE ----------
create table if not exists public.event_attendance (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  method         text not null default 'qr' check (method in ('qr', 'manual')),
  checked_in_at  timestamptz not null default now(),
  checked_in_by  uuid default auth.uid() references public.profiles(id),
  unique (event_id, user_id)
);
create index if not exists event_attendance_user_idx on public.event_attendance (user_id);
alter table public.event_attendance enable row level security;

drop policy if exists "attendance: read own or officer" on public.event_attendance;
create policy "attendance: read own or officer" on public.event_attendance
  for select using (user_id = auth.uid() or public.is_officer());
drop policy if exists "attendance: officer add manually" on public.event_attendance;
create policy "attendance: officer add manually" on public.event_attendance
  for insert with check (public.is_officer() and method = 'manual');
drop policy if exists "attendance: officer remove" on public.event_attendance;
create policy "attendance: officer remove" on public.event_attendance
  for delete using (public.is_officer());

-- Scan the QR code -> this runs. Opens 2 hours before the event, closes 2 hours after it ends.
create or replace function public.check_in(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  ev public.events%rowtype;
  added int;
begin
  if not public.is_approved() then raise exception 'Your account is not approved yet'; end if;

  select e.* into ev
  from public.events e join public.event_tokens t on t.event_id = e.id
  where t.token = p_token;
  if not found then raise exception 'This QR code is not valid'; end if;

  if now() < ev.starts_at - interval '2 hours' then
    raise exception 'Check-in is not open yet. It opens 2 hours before the event.';
  end if;
  if now() > coalesce(ev.ends_at, ev.starts_at + interval '3 hours') + interval '2 hours' then
    raise exception 'Check-in for this event is closed.';
  end if;

  insert into public.event_attendance (event_id, user_id, method, checked_in_by)
  values (ev.id, auth.uid(), 'qr', auth.uid())
  on conflict (event_id, user_id) do nothing;
  get diagnostics added = row_count;

  return jsonb_build_object('event_id', ev.id, 'title', ev.title, 'already', added = 0);
end $$;
revoke all on function public.check_in(text) from public, anon;
grant execute on function public.check_in(text) to authenticated;

-- ---------- RSVP ----------
create table if not exists public.event_rsvps (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  status      text not null check (status in ('going', 'not_going')),
  created_at  timestamptz not null default now(),
  unique (event_id, user_id)
);
alter table public.event_rsvps enable row level security;

drop policy if exists "rsvps: read own or officer" on public.event_rsvps;
create policy "rsvps: read own or officer" on public.event_rsvps
  for select using (user_id = auth.uid() or public.is_officer());
drop policy if exists "rsvps: insert own" on public.event_rsvps;
create policy "rsvps: insert own" on public.event_rsvps
  for insert with check (user_id = auth.uid() and public.is_approved());
drop policy if exists "rsvps: update own" on public.event_rsvps;
create policy "rsvps: update own" on public.event_rsvps
  for update using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_approved());
drop policy if exists "rsvps: delete own" on public.event_rsvps;
create policy "rsvps: delete own" on public.event_rsvps
  for delete using (user_id = auth.uid());

-- Enforces the capacity limit
create or replace function public.rsvp_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare cap int; taken int;
begin
  if tg_op = 'UPDATE' then
    new.event_id := old.event_id;
    new.user_id  := old.user_id;
  end if;
  if new.status = 'going' then
    select capacity into cap from public.events where id = new.event_id;
    if cap is not null then
      select count(*) into taken from public.event_rsvps
      where event_id = new.event_id and status = 'going' and user_id <> new.user_id;
      if taken >= cap then raise exception 'This event is full'; end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists rsvp_guard_trg on public.event_rsvps;
create trigger rsvp_guard_trg before insert or update on public.event_rsvps
  for each row execute function public.rsvp_guard();

-- Everyone can see how many are going (never who)
create or replace function public.get_event_going(p_event uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.event_rsvps
  where event_id = p_event and status = 'going' and public.is_approved()
$$;
revoke all on function public.get_event_going(uuid) from public, anon;
grant execute on function public.get_event_going(uuid) to authenticated;
