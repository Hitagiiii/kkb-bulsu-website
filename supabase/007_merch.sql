-- ============================================================
-- Step 10: Merch sales (shirts, ID laces, pins, ...)
-- Flow: members order -> treasurer records payments -> treasurer
-- orders from the supplier -> items arrive -> members claim.
-- Run it after 006_attendance_rsvp.sql
-- ============================================================

create table if not exists public.merch_items (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (char_length(name) between 1 and 120),
  category        text not null default 'Other',
  price           numeric(12,2) not null check (price >= 0),       -- what members pay
  unit_cost       numeric(12,2) not null default 0 check (unit_cost >= 0), -- what the org pays the supplier
  variants        text[] not null default '{}',                    -- sizes or types, e.g. {S,M,L,XL}
  stage           text not null default 'open' check (stage in ('open','ordered','arrived','closed')),
  order_deadline  timestamptz,
  created_by      uuid default auth.uid() references public.profiles(id),
  created_at      timestamptz not null default now()
);

create table if not exists public.merch_orders (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references public.merch_items(id) on delete restrict,
  user_id       uuid references public.profiles(id),   -- null = buyer who is not a member
  buyer_name    text not null default '',
  variant       text,
  quantity      int not null default 1 check (quantity between 1 and 50),
  unit_price    numeric(12,2) not null default 0,
  amount_paid   numeric(12,2) not null default 0 check (amount_paid >= 0),
  note          text,
  claimed_at    timestamptz,
  claimed_by    uuid references public.profiles(id),
  cancelled_at  timestamptz,
  cancel_reason text,
  created_by    uuid default auth.uid() references public.profiles(id),
  created_at    timestamptz not null default now(),
  constraint merch_orders_has_buyer check (user_id is not null or char_length(buyer_name) > 0)
);
create index if not exists merch_orders_item_idx on public.merch_orders (item_id);
create index if not exists merch_orders_user_idx on public.merch_orders (user_id);

-- Every peso received is one row here. Mistakes are voided, never deleted.
create table if not exists public.merch_payments (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.merch_orders(id) on delete cascade,
  amount       numeric(12,2) not null check (amount > 0),
  method       text not null default 'cash' check (method in ('cash','gcash','other')),
  reference    text,
  received_by  uuid default auth.uid() references public.profiles(id),
  received_at  timestamptz not null default now(),
  voided_at    timestamptz,
  void_reason  text
);
create index if not exists merch_payments_order_idx on public.merch_payments (order_id);

-- ---------- RULES THAT CANNOT BE BYPASSED ----------
create or replace function public.merch_order_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  it public.merch_items%rowtype;
  treas boolean := public.is_treasurer();
begin
  select * into it from public.merch_items where id = new.item_id;
  if not found then raise exception 'That item does not exist'; end if;

  if not treas then
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

  new.unit_price    := it.price;   -- the price at the time of ordering
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

drop trigger if exists merch_order_before_insert_trg on public.merch_orders;
create trigger merch_order_before_insert_trg before insert on public.merch_orders
  for each row execute function public.merch_order_before_insert();

create or replace function public.merch_order_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare it public.merch_items%rowtype;
begin
  new.item_id    := old.item_id;
  new.user_id    := old.user_id;
  new.unit_price := old.unit_price;
  new.created_by := old.created_by;
  new.created_at := old.created_at;

  if new.claimed_at is not null and old.claimed_at is null then
    select * into it from public.merch_items where id = new.item_id;
    if new.cancelled_at is not null then raise exception 'A cancelled order cannot be claimed'; end if;
    if it.stage not in ('arrived','closed') then raise exception 'This item has not arrived yet'; end if;
    if new.amount_paid < new.quantity * new.unit_price then
      raise exception 'This order is not fully paid yet';
    end if;
    new.claimed_by := coalesce(auth.uid(), new.claimed_by);
  elsif new.claimed_at is null then
    new.claimed_by := null;
  end if;
  return new;
end $$;

drop trigger if exists merch_order_guard_trg on public.merch_orders;
create trigger merch_order_guard_trg before update on public.merch_orders
  for each row execute function public.merch_order_guard();

-- Recording a payment also updates the order's paid amount
create or replace function public.merch_payment_apply()
returns trigger language plpgsql security definer set search_path = public as $$
declare o public.merch_orders%rowtype;
begin
  select * into o from public.merch_orders where id = new.order_id for update;
  if not found then raise exception 'That order does not exist'; end if;
  if o.cancelled_at is not null then raise exception 'This order was cancelled'; end if;
  if o.amount_paid + new.amount > o.quantity * o.unit_price then
    raise exception 'That is more than the balance of this order';
  end if;
  new.received_by := coalesce(auth.uid(), new.received_by);
  new.voided_at   := null;
  new.void_reason := null;
  update public.merch_orders set amount_paid = amount_paid + new.amount where id = new.order_id;
  return new;
end $$;

drop trigger if exists merch_payment_apply_trg on public.merch_payments;
create trigger merch_payment_apply_trg before insert on public.merch_payments
  for each row execute function public.merch_payment_apply();

-- Cancel an order. Members can cancel their own order only if nothing was paid yet.
create or replace function public.cancel_order(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare o public.merch_orders%rowtype;
begin
  select * into o from public.merch_orders where id = p_id for update;
  if not found then raise exception 'That order does not exist'; end if;
  if o.cancelled_at is not null then raise exception 'This order is already cancelled'; end if;
  if o.claimed_at is not null then raise exception 'This order was already claimed'; end if;
  if not (public.is_treasurer() or (o.user_id = auth.uid() and o.amount_paid = 0)) then
    raise exception 'You cannot cancel this order. If you already paid, ask the treasurer.';
  end if;
  update public.merch_orders
  set cancelled_at = now(), cancel_reason = coalesce(nullif(trim(p_reason), ''), 'Cancelled')
  where id = p_id;
end $$;
revoke all on function public.cancel_order(uuid, text) from public, anon;
grant execute on function public.cancel_order(uuid, text) to authenticated;

-- Void a payment (wrong amount, or refund after a cancellation)
create or replace function public.void_payment(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare pay public.merch_payments%rowtype; o public.merch_orders%rowtype;
begin
  if not public.is_treasurer() then raise exception 'Only the treasurer can do this'; end if;
  if nullif(trim(p_reason), '') is null then raise exception 'Give a reason'; end if;
  select * into pay from public.merch_payments where id = p_id for update;
  if not found then raise exception 'That payment does not exist'; end if;
  if pay.voided_at is not null then raise exception 'This payment is already voided'; end if;
  select * into o from public.merch_orders where id = pay.order_id for update;
  if o.claimed_at is not null then raise exception 'Undo the claim first'; end if;
  update public.merch_payments set voided_at = now(), void_reason = trim(p_reason) where id = p_id;
  update public.merch_orders set amount_paid = amount_paid - pay.amount where id = pay.order_id;
end $$;
revoke all on function public.void_payment(uuid, text) from public, anon;
grant execute on function public.void_payment(uuid, text) to authenticated;

-- ---------- ROW LEVEL SECURITY ----------
alter table public.merch_items    enable row level security;
alter table public.merch_orders   enable row level security;
alter table public.merch_payments enable row level security;

drop policy if exists "merch_items: read" on public.merch_items;
create policy "merch_items: read" on public.merch_items for select using (public.is_approved());
drop policy if exists "merch_items: treasurer write" on public.merch_items;
create policy "merch_items: treasurer write" on public.merch_items for all
  using (public.is_treasurer()) with check (public.is_treasurer());

drop policy if exists "merch_orders: read own or officer" on public.merch_orders;
create policy "merch_orders: read own or officer" on public.merch_orders
  for select using (user_id = auth.uid() or public.is_officer());
drop policy if exists "merch_orders: place" on public.merch_orders;
create policy "merch_orders: place" on public.merch_orders
  for insert with check (public.is_approved() and (user_id = auth.uid() or public.is_treasurer()));
drop policy if exists "merch_orders: treasurer update" on public.merch_orders;
create policy "merch_orders: treasurer update" on public.merch_orders
  for update using (public.is_treasurer()) with check (public.is_treasurer());
-- no DELETE policy on purpose: cancel instead

drop policy if exists "merch_payments: read own or officer" on public.merch_payments;
create policy "merch_payments: read own or officer" on public.merch_payments
  for select using (
    public.is_officer()
    or exists (select 1 from public.merch_orders o where o.id = order_id and o.user_id = auth.uid())
  );
drop policy if exists "merch_payments: treasurer insert" on public.merch_payments;
create policy "merch_payments: treasurer insert" on public.merch_payments
  for insert with check (public.is_treasurer());
-- no UPDATE or DELETE policy: use void_payment()

-- ---------- AUDIT TRAIL (the treasurer can read it in audit_log) ----------
drop trigger if exists audit_merch_items on public.merch_items;
create trigger audit_merch_items after insert or update or delete on public.merch_items
  for each row execute function public.log_changes();
drop trigger if exists audit_merch_orders on public.merch_orders;
create trigger audit_merch_orders after insert or update on public.merch_orders
  for each row execute function public.log_changes();
drop trigger if exists audit_merch_payments on public.merch_payments;
create trigger audit_merch_payments after insert or update on public.merch_payments
  for each row execute function public.log_changes();
