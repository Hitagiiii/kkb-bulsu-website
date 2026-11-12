-- ============================================================
-- Step 5: Announcements upgrade
-- Paste into Supabase > SQL Editor > New query > Run
-- Safe to run once on top of schema.sql
-- ============================================================

-- Members can't read other members' profiles, so each announcement
-- stores its author's name at the time it was posted.
alter table public.announcements
  add column if not exists author_name text not null default '',
  add column if not exists updated_at  timestamptz;

create index if not exists announcements_order_idx
  on public.announcements (pinned desc, created_at desc);

-- Fills in the author, and stops anyone from faking who posted or when
create or replace function public.announcement_meta()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.created_by := auth.uid();
    end if;
    new.author_name := coalesce(
      (select full_name from public.profiles where id = new.created_by), ''
    );
    new.updated_at := null;
  else
    new.created_by  := old.created_by;
    new.author_name := old.author_name;
    new.created_at  := old.created_at;
    -- only count it as "edited" when the text changed (not when pinning)
    if new.title is distinct from old.title or new.body is distinct from old.body then
      new.updated_at := now();
    else
      new.updated_at := old.updated_at;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists announcement_meta_trg on public.announcements;
create trigger announcement_meta_trg
  before insert or update on public.announcements
  for each row execute function public.announcement_meta();

-- Live updates for the announcements page
alter publication supabase_realtime add table public.announcements;
