-- 015: stock limits + waitlist, deactivating members, in-app notifications.
-- Run after 014. Safe to run more than once.

-- =====================================================================
-- 1. DEACTIVATING MEMBERS
-- A deactivated member keeps their history (orders, attendance, receipts) but loses all access.
-- =====================================================================
alter table public.profiles
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivated_by uuid references public.profiles(id);

-- Every role check (is_officer, is_admin, is_finance, ...) goes through these two,
-- so changing them locks a deactivated account out of everything at once.
create or replace function public.current_role_of_user()
returns public.user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles
  where id = auth.uid() and approved = true and deactivated_at is null
$$;

create or replace function public.is_approved()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and approved = true and deactivated_at is null)
$$;

-- People cannot reactivate themselves
create or replace function public.protect_profile_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.role is distinct from old.role
      or new.approved is distinct from old.approved
      or new.deactivated_at is distinct from old.deactivated_at
      or new.deactivated_by is distinct from old.deactivated_by)
     and auth.uid() is not null          -- null = SQL editor / service role, allowed
     and not public.is_admin() then
    raise exception 'Only an admin can change role, approval or access';
  end if;
  return new;
end $$;

create or replace function public.set_member_active(p_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
declare target public.profiles%rowtype;
begin
  if not public.is_admin() then raise exception 'Only an admin can change member access'; end if;
  if p_id = auth.uid() then raise exception 'You cannot change your own access'; end if;
  select * into target from public.profiles where id = p_id for update;
  if not found then raise exception 'That member does not exist'; end if;
  if not p_active and target.role = 'admin' and (
       select count(*) from public.profiles
       where role = 'admin' and approved and deactivated_at is null) <= 1 then
    raise exception 'That is the last active admin';
  end if;
  update public.profiles
     set deactivated_at = case when p_active then null else now() end,
         deactivated_by = case when p_active then null else auth.uid() end
   where id = p_id;
end $$;
revoke all on function public.set_member_active(uuid, boolean) from public, anon;
grant execute on function public.set_member_active(uuid, boolean) to authenticated;

-- =====================================================================
-- 2. NOTIFICATIONS (in the app; e-mail can be added with the edge function)
-- =====================================================================
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text not null default '',
  link       text,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
drop policy if exists "notifications: read own" on public.notifications;
create policy "notifications: read own" on public.notifications for select using (user_id = auth.uid());
drop policy if exists "notifications: update own" on public.notifications;
create policy "notifications: update own" on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "notifications: delete own" on public.notifications;
create policy "notifications: delete own" on public.notifications for delete using (user_id = auth.uid());
-- no insert policy: only the triggers below create notifications

-- the only thing a member may change is read_at
create or replace function public.notifications_only_read_at()
returns trigger language plpgsql as $$
begin
  new.user_id := old.user_id; new.kind := old.kind; new.title := old.title;
  new.body := old.body; new.link := old.link; new.created_at := old.created_at;
  return new;
end $$;
drop trigger if exists notifications_only_read_at_trg on public.notifications;
create trigger notifications_only_read_at_trg before update on public.notifications
  for each row execute function public.notifications_only_read_at();

create or replace function public.notify(p_user uuid, p_kind text, p_title text, p_body text, p_link text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  insert into public.notifications (user_id, kind, title, body, link) values (p_user, p_kind, p_title, coalesce(p_body, ''), p_link);
end $$;
revoke all on function public.notify(uuid, text, text, text, text) from public, anon, authenticated;

do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; when undefined_object then null; end $$;

-- ---- payment recorded / verified
create or replace function public.notify_payment()
returns trigger language plpgsql security definer set search_path = public as $$
declare o public.merch_orders%rowtype; item_name text; bal numeric;
begin
  if new.voided_at is not null then return new; end if;
  select * into o from public.merch_orders where id = new.order_id;
  if o.user_id is null then return new; end if;
  select name into item_name from public.merch_items where id = o.item_id;
  bal := o.quantity * o.unit_price - o.amount_paid;
  perform public.notify(o.user_id, 'payment',
    'Payment verified',
    'We received ₱' || to_char(new.amount, 'FM999,999,990.00') || ' for ' || item_name ||
      case when bal > 0 then '. Balance: ₱' || to_char(bal, 'FM999,999,990.00') || '.' else '. Your order is fully paid.' end,
    '/merch');
  return new;
end $$;
drop trigger if exists notify_payment_trg on public.merch_payments;
create trigger notify_payment_trg after insert on public.merch_payments
  for each row execute function public.notify_payment();

-- ---- proof rejected
create or replace function public.notify_proof()
returns trigger language plpgsql security definer set search_path = public as $$
declare item_name text;
begin
  if new.status = 'rejected' and old.status is distinct from 'rejected' then
    select i.name into item_name from public.merch_orders o join public.merch_items i on i.id = o.item_id where o.id = new.order_id;
    perform public.notify(new.user_id, 'proof',
      'Your payment proof needs another look',
      'For ' || coalesce(item_name, 'your order') || ': ' || coalesce(nullif(new.reject_reason, ''), 'please send a clearer screenshot.'),
      '/merch');
  end if;
  return new;
end $$;
drop trigger if exists notify_proof_trg on public.merch_payment_proofs;
create trigger notify_proof_trg after update on public.merch_payment_proofs
  for each row execute function public.notify_proof();

-- ---- item arrived: tell everyone who ordered it
create or replace function public.notify_arrival()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.stage = 'arrived' and old.stage is distinct from 'arrived' then
    for r in select distinct user_id from public.merch_orders
             where item_id = new.id and user_id is not null and cancelled_at is null and claimed_at is null loop
      perform public.notify(r.user_id, 'arrival',
        new.name || ' has arrived',
        'Your order is ready to claim. Bring your student ID.',
        '/merch');
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists notify_arrival_trg on public.merch_items;
create trigger notify_arrival_trg after update on public.merch_items
  for each row execute function public.notify_arrival();

-- =====================================================================
-- 3. STOCK LIMITS
-- stock_limit = total pieces available for the item (null = unlimited).
-- Cancelled orders give their pieces back.
-- =====================================================================
alter table public.merch_items
  add column if not exists stock_limit integer check (stock_limit is null or stock_limit >= 0);

create or replace function public.merch_order_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  it public.merch_items%rowtype;
  fin boolean := public.is_finance();
  taken int;
begin
  -- lock the item so two people ordering the last piece at once cannot both succeed
  select * into it from public.merch_items where id = new.item_id for update;
  if not found then raise exception 'That item does not exist'; end if;

  if not fin then
    if it.stage <> 'open' then raise exception 'Orders for this item are closed'; end if;
    if it.order_deadline is not null and it.order_deadline < now() then
      raise exception 'The order deadline has passed';
    end if;
    new.user_id := auth.uid();
    new.created_by := auth.uid();
  end if;

  if it.stock_limit is not null then
    select coalesce(sum(quantity), 0) into taken from public.merch_orders
      where item_id = it.id and cancelled_at is null;
    if taken + new.quantity > it.stock_limit then
      raise exception 'Not enough stock. % left.', greatest(it.stock_limit - taken, 0);
    end if;
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

-- Members cannot read other people's orders, so they ask for the number of pieces left
create or replace function public.merch_stock_left()
returns table (item_id uuid, stock_left int)
language sql stable security definer set search_path = public as $$
  select i.id,
         greatest(i.stock_limit - coalesce((select sum(o.quantity) from public.merch_orders o
                                            where o.item_id = i.id and o.cancelled_at is null), 0), 0)::int
  from public.merch_items i
  where i.stock_limit is not null and public.is_approved()
$$;
revoke all on function public.merch_stock_left() from public, anon;
grant execute on function public.merch_stock_left() to authenticated;

-- =====================================================================
-- 4. WAITLIST
-- Members join when an item is sold out. Finance moves people into real orders when pieces free up.
-- =====================================================================
create table if not exists public.merch_waitlist (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references public.merch_items(id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  variant    text,
  quantity   int not null default 1 check (quantity between 1 and 50),
  created_at timestamptz not null default now(),
  unique (item_id, user_id)
);
create index if not exists merch_waitlist_item_idx on public.merch_waitlist (item_id, created_at);

alter table public.merch_waitlist enable row level security;
drop policy if exists "waitlist: read own or finance" on public.merch_waitlist;
create policy "waitlist: read own or finance" on public.merch_waitlist
  for select using (user_id = auth.uid() or public.is_finance());
drop policy if exists "waitlist: join" on public.merch_waitlist;
create policy "waitlist: join" on public.merch_waitlist
  for insert with check (user_id = auth.uid() and public.is_approved());
drop policy if exists "waitlist: leave or finance remove" on public.merch_waitlist;
create policy "waitlist: leave or finance remove" on public.merch_waitlist
  for delete using (user_id = auth.uid() or public.is_finance());

create or replace function public.merch_waitlist_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare it public.merch_items%rowtype; taken int;
begin
  select * into it from public.merch_items where id = new.item_id;
  if not found then raise exception 'That item does not exist'; end if;
  if it.stage <> 'open' then raise exception 'Orders for this item are closed'; end if;
  if it.stock_limit is null then raise exception 'This item has no stock limit, so you can order it directly'; end if;
  select coalesce(sum(quantity), 0) into taken from public.merch_orders where item_id = it.id and cancelled_at is null;
  if taken + new.quantity <= it.stock_limit then
    raise exception 'There is enough stock right now. Place the order instead';
  end if;
  if cardinality(it.variants) > 0 then
    if new.variant is null or not (new.variant = any (it.variants)) then raise exception 'Choose a valid size or type'; end if;
  else
    new.variant := null;
  end if;
  new.user_id := auth.uid();
  return new;
end $$;
drop trigger if exists merch_waitlist_before_insert_trg on public.merch_waitlist;
create trigger merch_waitlist_before_insert_trg before insert on public.merch_waitlist
  for each row execute function public.merch_waitlist_before_insert();

-- Finance turns a waitlist entry into a real order (the stock rule still applies)
create or replace function public.promote_waitlist(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare w public.merch_waitlist%rowtype; item_name text;
begin
  if not public.is_finance() then raise exception 'Only the finance head can do this'; end if;
  select * into w from public.merch_waitlist where id = p_id for update;
  if not found then raise exception 'That waitlist entry no longer exists'; end if;
  insert into public.merch_orders (item_id, user_id, variant, quantity) values (w.item_id, w.user_id, w.variant, w.quantity);
  delete from public.merch_waitlist where id = p_id;
  select name into item_name from public.merch_items where id = w.item_id;
  perform public.notify(w.user_id, 'waitlist', 'You got a spot',
    'A piece of ' || item_name || ' opened up and your order was placed. Pay by GCash to confirm it.', '/merch');
end $$;
revoke all on function public.promote_waitlist(uuid) from public, anon;
grant execute on function public.promote_waitlist(uuid) to authenticated;

-- When pieces free up (cancelled or removed order), tell the first person in line who now fits
create or replace function public.notify_waitlist_on_free()
returns trigger language plpgsql security definer set search_path = public as $$
declare it public.merch_items%rowtype; taken int; w record; freed_item uuid;
begin
  if tg_op = 'DELETE' then freed_item := old.item_id;
  elsif new.cancelled_at is not null and old.cancelled_at is null then freed_item := new.item_id;
  else return null; end if;

  select * into it from public.merch_items where id = freed_item;
  if not found or it.stock_limit is null or it.stage <> 'open' then return null; end if;
  select coalesce(sum(quantity), 0) into taken from public.merch_orders where item_id = freed_item and cancelled_at is null;
  select * into w from public.merch_waitlist
    where item_id = freed_item and quantity <= it.stock_limit - taken
    order by created_at limit 1;
  if found then
    perform public.notify(w.user_id, 'waitlist', it.name || ' is available again',
      'A piece opened up. Order now, first come first served.', '/merch');
  end if;
  return null;
end $$;
drop trigger if exists notify_waitlist_free_trg on public.merch_orders;
create trigger notify_waitlist_free_trg after update or delete on public.merch_orders
  for each row execute function public.notify_waitlist_on_free();

-- ---- an order cancelled by finance
create or replace function public.notify_cancel()
returns trigger language plpgsql security definer set search_path = public as $$
declare item_name text;
begin
  if new.cancelled_at is not null and old.cancelled_at is null and new.user_id is not null then
    select name into item_name from public.merch_items where id = new.item_id;
    perform public.notify(new.user_id, 'cancel', 'Your order was cancelled',
      item_name || coalesce(': ' || nullif(new.cancel_reason, ''), '.'), '/merch');
  end if;
  return new;
end $$;
drop trigger if exists notify_cancel_trg on public.merch_orders;
create trigger notify_cancel_trg after update on public.merch_orders
  for each row execute function public.notify_cancel();
