-- ============================================================
-- Step 17: Restrict Documents and Minutes to officers, treasurer,
-- and admin. Existing tables/columns are reused.
-- ============================================================

-- Documents: regardless of the document's stored min_role, only
-- officer-level accounts can read the document metadata.
drop policy if exists "documents: read allowed" on public.documents;
create policy "documents: read allowed" on public.documents
for select using (public.is_officer());

-- Private document files follow the same restriction.
drop policy if exists "documents files: read allowed" on storage.objects;
create policy "documents files: read allowed" on storage.objects
for select using (
  bucket_id = 'documents'
  and public.is_officer()
  and exists (
    select 1 from public.documents d
    where d.storage_path = objects.name
  )
);

-- Minutes: remove the previous member-visible exception.
drop policy if exists "minutes: read" on public.minutes;
create policy "minutes: read" on public.minutes
for select using (public.is_officer());
