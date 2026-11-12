-- ============================================================
-- Step 7: Events (calendar + map pin + pasted meeting link)
-- Paste into Supabase > SQL Editor > New query > Run
-- Run it after 003_announcement_images_events.sql
-- ============================================================

-- A link members can tap to join an online meeting (Google Meet, Zoom, ...)
alter table public.events
  add column if not exists meeting_link text;

-- Safety rules, enforced by the database itself
do $$ begin
  alter table public.events add constraint events_meeting_link_https
    check (meeting_link is null or meeting_link ~* '^https://');
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.events add constraint events_lat_range
    check (latitude is null or latitude between -90 and 90);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.events add constraint events_lng_range
    check (longitude is null or longitude between -180 and 180);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.events add constraint events_pin_complete
    check ((latitude is null) = (longitude is null));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.events add constraint events_end_after_start
    check (ends_at is null or ends_at >= starts_at);
exception when duplicate_object then null; end $$;

create index if not exists events_starts_idx on public.events (starts_at);

-- Nobody can fake who created an event
create or replace function public.event_meta()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.created_by := auth.uid();
    end if;
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;

drop trigger if exists event_meta_trg on public.events;
create trigger event_meta_trg
  before insert or update on public.events
  for each row execute function public.event_meta();

-- Live updates on the Events page
alter publication supabase_realtime add table public.events;

-- Note: the 'calls' table from the first schema is not used. Meeting links
-- now live on the event itself. You can ignore that table.
