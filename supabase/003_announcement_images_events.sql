-- ============================================================
-- Step 6: announcement photos (max 3) + event date
-- Paste into Supabase > SQL Editor > New query > Run
-- Run it after 002_announcements.sql
-- ============================================================

alter table public.announcements
  add column if not exists event_at    timestamptz,
  add column if not exists image_paths text[] not null default '{}';

-- A hard limit of 3 photos, enforced by the database itself
do $$
begin
  alter table public.announcements
    add constraint announcements_max_3_images check (cardinality(image_paths) <= 3);
exception when duplicate_object then null;
end $$;

create index if not exists announcements_event_idx
  on public.announcements (event_at) where event_at is not null;

-- "Edited" now also counts changes to the event date and photos (not pinning)
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
    if new.title is distinct from old.title
       or new.body is distinct from old.body
       or new.event_at is distinct from old.event_at
       or new.image_paths is distinct from old.image_paths then
      new.updated_at := now();
    else
      new.updated_at := old.updated_at;
    end if;
  end if;
  return new;
end $$;

-- Private bucket for the photos (2 MB max per file, JPEG only)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('announcement-images', 'announcement-images', false, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

create policy "announcement images: members read" on storage.objects
  for select using (bucket_id = 'announcement-images' and public.is_approved());

create policy "announcement images: officer upload" on storage.objects
  for insert with check (bucket_id = 'announcement-images' and public.is_officer());

create policy "announcement images: officer delete" on storage.objects
  for delete using (bucket_id = 'announcement-images' and public.is_officer());
