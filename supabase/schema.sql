-- ============================================================
-- KKB BULSU Website - Supabase schema (Step 1)
-- Paste into Supabase Dashboard > SQL Editor > New query > Run
-- ============================================================

-- ---------- ROLES ----------
create type public.user_role as enum ('member', 'officer', 'treasurer', 'admin');

-- ---------- PROFILES ----------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  student_no  text,
  role        public.user_role not null default 'member',
  approved    boolean not null default false,   -- officers approve new sign-ups
  created_at  timestamptz not null default now()
);

-- Auto-create a profile when someone signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- HELPER FUNCTIONS (used by RLS policies) ----------
create or replace function public.current_role_of_user()
returns public.user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and approved = true
$$;

create or replace function public.is_approved()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and approved = true)
$$;

-- officer, treasurer and admin
create or replace function public.is_officer()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role_of_user() in ('officer','treasurer','admin'), false)
$$;

-- treasurer and admin only (finance access)
create or replace function public.is_treasurer()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role_of_user() in ('treasurer','admin'), false)
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role_of_user() = 'admin', false)
$$;

-- Block people from promoting themselves or approving themselves
create or replace function public.protect_profile_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.role is distinct from old.role or new.approved is distinct from old.approved)
     and auth.uid() is not null          -- null = SQL editor / service role, allowed
     and not public.is_admin() then
    raise exception 'Only an admin can change role or approval status';
  end if;
  return new;
end $$;

create trigger protect_profile_fields_trg
  before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- ---------- ANNOUNCEMENTS ----------
create table public.announcements (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text not null,
  pinned      boolean not null default false,
  created_by  uuid not null default auth.uid() references public.profiles(id),
  created_at  timestamptz not null default now()
);

-- ---------- EVENTS (calendar + map) ----------
create table public.events (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  description    text,
  starts_at      timestamptz not null,
  ends_at        timestamptz,
  location_name  text,                 -- e.g. "BulSU Malolos, Room 204"
  latitude       double precision,     -- for the map pin
  longitude      double precision,
  created_by     uuid not null default auth.uid() references public.profiles(id),
  created_at     timestamptz not null default now()
);

-- ---------- CALLS (pasted Meet/Zoom link now, Jitsi later) ----------
create type public.call_kind as enum ('link', 'jitsi');

create table public.calls (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  kind        public.call_kind not null default 'link',
  url         text,                    -- used when kind = 'link' (Google Meet, Zoom...)
  jitsi_room  text,                    -- used when kind = 'jitsi'
  event_id    uuid references public.events(id) on delete set null,
  starts_at   timestamptz,
  created_by  uuid not null default auth.uid() references public.profiles(id),
  created_at  timestamptz not null default now(),
  constraint call_has_target check (
    (kind = 'link'  and url is not null) or
    (kind = 'jitsi' and jitsi_room is not null)
  )
);

-- ---------- POLLS ----------
create table public.polls (
  id          uuid primary key default gen_random_uuid(),
  question    text not null,
  closes_at   timestamptz,
  created_by  uuid not null default auth.uid() references public.profiles(id),
  created_at  timestamptz not null default now()
);

create table public.poll_options (
  id        uuid primary key default gen_random_uuid(),
  poll_id   uuid not null references public.polls(id) on delete cascade,
  label     text not null
);

create table public.poll_votes (
  id         uuid primary key default gen_random_uuid(),
  poll_id    uuid not null references public.polls(id) on delete cascade,
  option_id  uuid not null references public.poll_options(id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (poll_id, user_id)            -- one vote per member per poll
);

-- ---------- CHAT ----------
create table public.chat_rooms (
  id        uuid primary key default gen_random_uuid(),
  name      text not null unique,
  min_role  public.user_role not null default 'member',  -- 'officer' = officers-only room
  created_at timestamptz not null default now()
);

create table public.chat_messages (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.chat_rooms(id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles(id),
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index on public.chat_messages (room_id, created_at desc);

-- Can the current user access a room?
create or replace function public.can_access_room(room uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.chat_rooms r
    where r.id = room
      and public.is_approved()
      and (
        r.min_role = 'member'
        or (r.min_role = 'officer' and public.is_officer())
        or (r.min_role = 'treasurer' and public.is_treasurer())
        or (r.min_role = 'admin' and public.is_admin())
      )
  )
$$;

-- ---------- FINANCE ----------
-- One budget per event (event_id optional for general org funds)
create table public.budgets (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  event_id      uuid references public.events(id) on delete set null,
  total_budget  numeric(12,2) not null check (total_budget >= 0),
  created_by    uuid not null default auth.uid() references public.profiles(id),
  created_at    timestamptz not null default now()
);

-- Each "bubble" = one expense. Never hard-deleted: void it instead (audit-friendly).
create table public.expenses (
  id            uuid primary key default gen_random_uuid(),
  budget_id     uuid not null references public.budgets(id) on delete cascade,
  description   text not null,
  category      text not null default 'General',
  amount        numeric(12,2) not null check (amount > 0),
  receipt_path  text,                  -- path inside the 'receipts' storage bucket
  spent_on      date not null default current_date,
  added_by      uuid not null default auth.uid() references public.profiles(id),
  created_at    timestamptz not null default now(),
  voided_at     timestamptz,
  void_reason   text,
  voided_by     uuid references public.profiles(id)
);
create index on public.expenses (budget_id);

-- Live summary: money left is ALWAYS computed, so it can never drift
create or replace view public.budget_summary
with (security_invoker = true) as
select
  b.id as budget_id,
  b.name,
  b.event_id,
  b.total_budget,
  coalesce(sum(e.amount) filter (where e.voided_at is null), 0)::numeric(12,2) as total_spent,
  (b.total_budget - coalesce(sum(e.amount) filter (where e.voided_at is null), 0))::numeric(12,2) as money_left
from public.budgets b
left join public.expenses e on e.budget_id = b.id
group by b.id;

-- ---------- AUDIT LOG ----------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  table_name  text not null,
  record_id   uuid,
  action      text not null,           -- INSERT / UPDATE / DELETE
  old_data    jsonb,
  new_data    jsonb,
  actor       uuid default auth.uid(),
  at          timestamptz not null default now()
);

create or replace function public.log_changes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (table_name, record_id, action, old_data, new_data)
  values (
    tg_table_name,
    coalesce((to_jsonb(new)->>'id')::uuid, (to_jsonb(old)->>'id')::uuid),
    tg_op,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

create trigger audit_expenses after insert or update or delete on public.expenses
  for each row execute function public.log_changes();
create trigger audit_budgets after insert or update or delete on public.budgets
  for each row execute function public.log_changes();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.profiles      enable row level security;
alter table public.announcements enable row level security;
alter table public.events        enable row level security;
alter table public.calls         enable row level security;
alter table public.polls         enable row level security;
alter table public.poll_options  enable row level security;
alter table public.poll_votes    enable row level security;
alter table public.chat_rooms    enable row level security;
alter table public.chat_messages enable row level security;
alter table public.budgets       enable row level security;
alter table public.expenses      enable row level security;
alter table public.audit_log     enable row level security;

-- PROFILES: see your own; officers see all; update own name; admin does the rest
create policy "profiles: read own or officer" on public.profiles
  for select using (id = auth.uid() or public.is_officer());
create policy "profiles: update own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles: admin update all" on public.profiles
  for update using (public.is_admin());

-- ANNOUNCEMENTS / EVENTS / CALLS: approved members read, officers write
create policy "announcements: read" on public.announcements for select using (public.is_approved());
create policy "announcements: officer write" on public.announcements for all
  using (public.is_officer()) with check (public.is_officer());

create policy "events: read" on public.events for select using (public.is_approved());
create policy "events: officer write" on public.events for all
  using (public.is_officer()) with check (public.is_officer());

create policy "calls: read" on public.calls for select using (public.is_approved());
create policy "calls: officer write" on public.calls for all
  using (public.is_officer()) with check (public.is_officer());

-- POLLS: members read + vote once, officers create
create policy "polls: read" on public.polls for select using (public.is_approved());
create policy "polls: officer write" on public.polls for all
  using (public.is_officer()) with check (public.is_officer());

create policy "poll_options: read" on public.poll_options for select using (public.is_approved());
create policy "poll_options: officer write" on public.poll_options for all
  using (public.is_officer()) with check (public.is_officer());

create policy "poll_votes: read" on public.poll_votes for select using (public.is_approved());
create policy "poll_votes: vote as self" on public.poll_votes for insert
  with check (
    user_id = auth.uid() and public.is_approved()
    and exists (select 1 from public.polls p
                where p.id = poll_id and (p.closes_at is null or p.closes_at > now()))
  );

-- CHAT: only rooms you are allowed into
create policy "rooms: read allowed" on public.chat_rooms
  for select using (public.can_access_room(id));
create policy "rooms: admin manage" on public.chat_rooms for all
  using (public.is_admin()) with check (public.is_admin());

create policy "messages: read in allowed rooms" on public.chat_messages
  for select using (public.can_access_room(room_id));
create policy "messages: send as self" on public.chat_messages
  for insert with check (user_id = auth.uid() and public.can_access_room(room_id));

-- FINANCE: treasurer/admin write; officers can read; members see nothing
create policy "budgets: officer read" on public.budgets for select using (public.is_officer());
create policy "budgets: treasurer write" on public.budgets for all
  using (public.is_treasurer()) with check (public.is_treasurer());

create policy "expenses: officer read" on public.expenses for select using (public.is_officer());
create policy "expenses: treasurer insert" on public.expenses for insert
  with check (public.is_treasurer());
create policy "expenses: treasurer update (void)" on public.expenses for update
  using (public.is_treasurer()) with check (public.is_treasurer());
-- NOTE: no DELETE policy on expenses on purpose. Void instead of delete.

-- AUDIT LOG: read-only for treasurer/admin; nobody can edit it
create policy "audit: treasurer read" on public.audit_log for select using (public.is_treasurer());

-- ============================================================
-- STORAGE: private 'receipts' bucket
-- ============================================================
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy "receipts: officer read" on storage.objects for select
  using (bucket_id = 'receipts' and public.is_officer());
create policy "receipts: treasurer upload" on storage.objects for insert
  with check (bucket_id = 'receipts' and public.is_treasurer());

-- ============================================================
-- REALTIME: live chat, live expenses, live polls
-- ============================================================
alter publication supabase_realtime add table public.chat_messages;
alter publication supabase_realtime add table public.expenses;
alter publication supabase_realtime add table public.budgets;
alter publication supabase_realtime add table public.poll_votes;

-- ============================================================
-- STARTER DATA: default chat rooms
-- ============================================================
insert into public.chat_rooms (name, min_role) values
  ('General', 'member'),
  ('Officers', 'officer');

-- ============================================================
-- AFTER YOU SIGN UP YOUR FIRST ACCOUNT, make yourself admin:
--   update public.profiles
--   set role = 'admin', approved = true
--   where id = (select id from auth.users where email = 'YOUR_EMAIL_HERE');
-- ============================================================