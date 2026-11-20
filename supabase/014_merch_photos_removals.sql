-- 014: merch photos, removing orders, declining applicants.
-- Safe to run more than once.

-- ---------- 1. Merch item photos (finance uploads, members see them) ----------
alter table public.merch_items
  add column if not exists image_paths text[] not null default '{}';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('merch-images', 'merch-images', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

drop policy if exists "merch-images: members read" on storage.objects;
create policy "merch-images: members read" on storage.objects
  for select using (bucket_id = 'merch-images' and public.is_approved());
drop policy if exists "merch-images: finance upload" on storage.objects;
create policy "merch-images: finance upload" on storage.objects
  for insert with check (bucket_id = 'merch-images' and public.is_finance());
drop policy if exists "merch-images: finance delete" on storage.objects;
create policy "merch-images: finance delete" on storage.objects
  for delete using (bucket_id = 'merch-images' and public.is_finance());

-- ---------- 2. Finance can remove an order ----------
-- Money rule: an order that still has recorded payments cannot be removed.
-- Void the payments first (that keeps the books honest), then remove it.
-- Removals are written to the audit trail.
create or replace function public.delete_order(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare o public.merch_orders%rowtype;
begin
  if not public.is_finance() then raise exception 'Only the finance head can remove orders'; end if;
  select * into o from public.merch_orders where id = p_id for update;
  if not found then raise exception 'That order does not exist'; end if;
  if o.amount_paid > 0 then
    raise exception 'This order still has recorded payments. Void them first, then remove the order.';
  end if;
  delete from public.merch_orders where id = p_id;  -- its voided payments and proofs go with it
end $$;
revoke all on function public.delete_order(uuid) from public, anon;
grant execute on function public.delete_order(uuid) to authenticated;

drop trigger if exists audit_merch_orders on public.merch_orders;
create trigger audit_merch_orders after insert or update or delete on public.merch_orders
  for each row execute function public.log_changes();

-- Finance can clear payment screenshots of an order that is being removed
drop policy if exists "payment-proofs: finance delete" on storage.objects;
create policy "payment-proofs: finance delete" on storage.objects
  for delete using (bucket_id = 'payment-proofs' and public.is_finance());

-- ---------- 3. Admin can decline a pending application ----------
create or replace function public.decline_member(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only an admin can decline applications'; end if;
  if p_id = auth.uid() then raise exception 'You cannot decline yourself'; end if;
  if exists (select 1 from public.profiles where id = p_id and approved) then
    raise exception 'Only pending applications can be declined';
  end if;
  delete from auth.users where id = p_id;  -- the profile goes with it
end $$;
revoke all on function public.decline_member(uuid) from public, anon;
grant execute on function public.decline_member(uuid) to authenticated;
