-- ============================================================
-- Step 8: Polls (secret ballot, change vote while open, results)
-- Paste into Supabase > SQL Editor > New query > Run
-- Run it after 004_events.sql
-- ============================================================

-- Stable order for a poll's options
alter table public.poll_options
  add column if not exists position int not null default 0;

-- Sensible length limits
do $$ begin
  alter table public.polls add constraint polls_question_length
    check (char_length(question) between 1 and 300);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.poll_options add constraint poll_options_label_length
    check (char_length(label) between 1 and 120);
exception when duplicate_object then null; end $$;

-- ---------- SECRET BALLOT ----------
-- Before: every member could read every vote, including who cast it.
-- Now: you can only read your own vote. Totals come from get_poll_results() below.
drop policy if exists "poll_votes: read" on public.poll_votes;
drop policy if exists "poll_votes: read own" on public.poll_votes;
create policy "poll_votes: read own" on public.poll_votes
  for select using (user_id = auth.uid());

-- Change your vote, but only while the poll is open
drop policy if exists "poll_votes: change own vote while open" on public.poll_votes;
create policy "poll_votes: change own vote while open" on public.poll_votes
  for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and public.is_approved()
    and exists (
      select 1 from public.polls p
      where p.id = poll_id and (p.closes_at is null or p.closes_at > now())
    )
  );

-- A vote must be for an option that belongs to the same poll
create or replace function public.validate_poll_vote()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.poll_id := old.poll_id;
    new.user_id := old.user_id;
  end if;
  if not exists (
    select 1 from public.poll_options o
    where o.id = new.option_id and o.poll_id = new.poll_id
  ) then
    raise exception 'That option does not belong to this poll';
  end if;
  return new;
end $$;

drop trigger if exists validate_poll_vote_trg on public.poll_votes;
create trigger validate_poll_vote_trg
  before insert or update on public.poll_votes
  for each row execute function public.validate_poll_vote();

-- Vote totals for every option (counts only, never who voted)
create or replace function public.get_poll_results()
returns table (poll_id uuid, option_id uuid, votes bigint)
language sql stable security definer set search_path = public as $$
  select o.poll_id, o.id, count(v.id)
  from public.poll_options o
  left join public.poll_votes v on v.option_id = o.id
  where public.is_approved()
  group by o.poll_id, o.id
$$;

revoke all on function public.get_poll_results() from public, anon;
grant execute on function public.get_poll_results() to authenticated;

-- ---------- CREATE A POLL IN ONE STEP ----------
-- Runs with the caller's permissions, so only officers can use it.
create or replace function public.create_poll(
  p_question  text,
  p_options   text[],
  p_closes_at timestamptz default null
)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  new_id uuid;
  n int := coalesce(array_length(p_options, 1), 0);
begin
  if n < 2 or n > 6 then
    raise exception 'A poll needs between 2 and 6 options';
  end if;

  insert into public.polls (question, closes_at)
  values (trim(p_question), p_closes_at)
  returning id into new_id;

  insert into public.poll_options (poll_id, label, position)
  select new_id, trim(t.opt), t.ord
  from unnest(p_options) with ordinality as t(opt, ord);

  return new_id;
end $$;

revoke all on function public.create_poll(text, text[], timestamptz) from public, anon;
grant execute on function public.create_poll(text, text[], timestamptz) to authenticated;

-- Live updates when polls are created, closed or deleted
alter publication supabase_realtime add table public.polls;
alter publication supabase_realtime add table public.poll_options;
