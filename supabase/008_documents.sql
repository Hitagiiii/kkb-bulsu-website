-- ============================================================
-- Step 11: Document library (role-based access)
-- Run it after 007_merch.sql
-- ============================================================

-- true when the signed-in, approved user has at least this role
create or replace function public.has_min_role(r public.user_role)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role_of_user() >= r, false)
$$;

create table if not exists public.documents (
  id             uuid primary key default gen_random_uuid(),
  title          text not null check (char_length(title) between 1 and 150),
  description    text,
  category       text not null default 'Other',
  storage_path   text not null unique,
  file_name      text not null,
  file_size      bigint,
  min_role       public.user_role not null default 'member',
  uploaded_by    uuid default auth.uid() references public.profiles(id),
  uploaded_name  text not null default '',
  created_at     timestamptz not null default now()
);
create index if not exists documents_created_idx on public.documents (created_at desc);

create or replace function public.document_meta()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then new.uploaded_by := auth.uid(); end if;
  new.uploaded_name := coalesce((select full_name from public.profiles where id = new.uploaded_by), '');
  return new;
end $$;

drop trigger if exists document_meta_trg on public.documents;
create trigger document_meta_trg before insert on public.documents
  for each row execute function public.document_meta();

alter table public.documents enable row level security;
drop policy if exists "documents: read allowed" on public.documents;
create policy "documents: read allowed" on public.documents
  for select using (public.has_min_role(min_role));
drop policy if exists "documents: officer write" on public.documents;
create policy "documents: officer write" on public.documents for all
  using (public.is_officer()) with check (public.is_officer());

-- Private bucket, 10 MB per file
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 10485760)
on conflict (id) do nothing;

drop policy if exists "documents files: read allowed" on storage.objects;
create policy "documents files: read allowed" on storage.objects
  for select using (
    bucket_id = 'documents'
    and exists (
      select 1 from public.documents d
      where d.storage_path = objects.name and public.has_min_role(d.min_role)
    )
  );
drop policy if exists "documents files: officer upload" on storage.objects;
create policy "documents files: officer upload" on storage.objects
  for insert with check (bucket_id = 'documents' and public.is_officer());
drop policy if exists "documents files: officer delete" on storage.objects;
create policy "documents files: officer delete" on storage.objects
  for delete using (bucket_id = 'documents' and public.is_officer());
