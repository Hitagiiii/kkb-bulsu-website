-- ============================================================
-- Step 14: Finance is visible and editable ONLY by the treasurer role
-- (officers and admins no longer see budgets, expenses, receipts,
-- the finance audit log, or the merch sales manager).
-- Run it after 010_remove_chat.sql
-- ============================================================

create or replace function public.is_finance()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role_of_user() = 'treasurer', false)
$$;

-- ---------- BUDGETS AND EXPENSES ----------
drop policy if exists "budgets: officer read" on public.budgets;
drop policy if exists "budgets: treasurer write" on public.budgets;
drop policy if exists "budgets: finance only" on public.budgets;
create policy "budgets: finance only" on public.budgets for all
  using (public.is_finance()) with check (public.is_finance());

drop policy if exists "expenses: officer read" on public.expenses;
drop policy if exists "expenses: treasurer insert" on public.expenses;
drop policy if exists "expenses: treasurer update (void)" on public.expenses;
drop policy if exists "expenses: finance read" on public.expenses;
drop policy if exists "expenses: finance insert" on public.expenses;
drop policy if exists "expenses: finance update (void)" on public.expenses;
create policy "expenses: finance read" on public.expenses for select using (public.is_finance());
create policy "expenses: finance insert" on public.expenses for insert with check (public.is_finance());
create policy "expenses: finance update (void)" on public.expenses
  for update using (public.is_finance()) with check (public.is_finance());
-- still no DELETE policy: void instead of delete

-- ---------- AUDIT LOG ----------
drop policy if exists "audit: treasurer read" on public.audit_log;
drop policy if exists "audit: finance read" on public.audit_log;
create policy "audit: finance read" on public.audit_log for select using (public.is_finance());

-- ---------- RECEIPT PHOTOS ----------
drop policy if exists "receipts: officer read" on storage.objects;
drop policy if exists "receipts: treasurer upload" on storage.objects;
drop policy if exists "receipts: finance read" on storage.objects;
drop policy if exists "receipts: finance upload" on storage.objects;
create policy "receipts: finance read" on storage.objects for select
  using (bucket_id = 'receipts' and public.is_finance());
create policy "receipts: finance upload" on storage.objects for insert
  with check (bucket_id = 'receipts' and public.is_finance());

-- ---------- MERCH SALES (money handling) ----------
-- Members still order and see their own orders. Everything else is finance only.
drop policy if exists "merch_items: treasurer write" on public.merch_items;
drop policy if exists "merch_items: finance write" on public.merch_items;
create policy "merch_items: finance write" on public.merch_items for all
  using (public.is_finance()) with check (public.is_finance());

drop policy if exists "merch_orders: read own or officer" on public.merch_orders;
drop policy if exists "merch_orders: read own or finance" on public.merch_orders;
create policy "merch_orders: read own or finance" on public.merch_orders
  for select using (user_id = auth.uid() or public.is_finance());

drop policy if exists "merch_orders: place" on public.merch_orders;
create policy "merch_orders: place" on public.merch_orders
  for insert with check (public.is_approved() and (user_id = auth.uid() or public.is_finance()));

drop policy if exists "merch_orders: treasurer update" on public.merch_orders;
drop policy if exists "merch_orders: finance update" on public.merch_orders;
create policy "merch_orders: finance update" on public.merch_orders
  for update using (public.is_finance()) with check (public.is_finance());

drop policy if exists "merch_payments: read own or officer" on public.merch_payments;
drop policy if exists "merch_payments: read own or finance" on public.merch_payments;
create policy "merch_payments: read own or finance" on public.merch_payments
  for select using (
    public.is_finance()
    or exists (select 1 from public.merch_orders o where o.id = order_id and o.user_id = auth.uid())
  );

drop policy if exists "merch_payments: treasurer insert" on public.merch_payments;
drop policy if exists "merch_payments: finance insert" on public.merch_payments;
create policy "merch_payments: finance insert" on public.merch_payments
  for insert with check (public.is_finance());

-- The merch functions now check for the finance role too
create or replace function public.merch_order_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  it public.merch_items%rowtype;
  fin boolean := public.is_finance();
begin
  select * into it from public.merch_items where id = new.item_id;
  if not found then raise exception 'That item does not exist'; end if;

  if not fin then
    if it.stage <> 'open' then raise exception 'Orders for this item are closed'; end if;
    if it.order_deadline is not null and it.order_deadline < now() then
      raise exception 'The order deadline has passed';
    end if;
    new.user_id := auth.uid();
    new.created_by := auth.uid();
  end if;

  if cardinality(it.variants) > 0 then
    if new.variant is null or not (new.variant = any (it.variants)) then
      raise exception 'Choose a valid size or type';
    end if;
  else
    new.variant := null;
  end if;

  new.unit_price    := it.price;
  new.amount_paid   := 0;
  new.claimed_at    := null;
  new.claimed_by    := null;
  new.cancelled_at  := null;
  new.cancel_reason := null;
  if new.user_id is not null then
    new.buyer_name := coalesce((select full_name from public.profiles where id = new.user_id), '');
  end if;
  return new;
end $$;

create or replace function public.cancel_order(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare o public.merch_orders%rowtype;
begin
  select * into o from public.merch_orders where id = p_id for update;
  if not found then raise exception 'That order does not exist'; end if;
  if o.cancelled_at is not null then raise exception 'This order is already cancelled'; end if;
  if o.claimed_at is not null then raise exception 'This order was already claimed'; end if;
  if not (public.is_finance() or (o.user_id = auth.uid() and o.amount_paid = 0)) then
    raise exception 'You cannot cancel this order. If you already paid, ask the finance head.';
  end if;
  update public.merch_orders
  set cancelled_at = now(), cancel_reason = coalesce(nullif(trim(p_reason), ''), 'Cancelled')
  where id = p_id;
end $$;

create or replace function public.void_payment(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare pay public.merch_payments%rowtype; o public.merch_orders%rowtype;
begin
  if not public.is_finance() then raise exception 'Only the finance head can do this'; end if;
  if nullif(trim(p_reason), '') is null then raise exception 'Give a reason'; end if;
  select * into pay from public.merch_payments where id = p_id for update;
  if not found then raise exception 'That payment does not exist'; end if;
  if pay.voided_at is not null then raise exception 'This payment is already voided'; end if;
  select * into o from public.merch_orders where id = pay.order_id for update;
  if o.claimed_at is not null then raise exception 'Undo the claim first'; end if;
  update public.merch_payments set voided_at = now(), void_reason = trim(p_reason) where id = p_id;
  update public.merch_orders set amount_paid = amount_paid - pay.amount where id = pay.order_id;
end $$;
