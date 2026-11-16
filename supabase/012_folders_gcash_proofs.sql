-- ============================================================
-- Step 15: Folders (finance + merch), GCash payment details,
-- payment proofs, and private supplier costs
-- Run it after 011_finance_only.sql
-- ============================================================

-- ---------- FINANCE FOLDERS (group budgets) ----------
create table if not exists public.budget_folders (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  created_by  uuid default auth.uid() references public.profiles(id),
  created_at  timestamptz not null default now()
);
alter table public.budgets
  add column if not exists folder_id uuid references public.budget_folders(id) on delete set null;
create index if not exists budgets_folder_idx on public.budgets (folder_id);

alter table public.budget_folders enable row level security;
drop policy if exists "budget_folders: finance only" on public.budget_folders;
create policy "budget_folders: finance only" on public.budget_folders for all
  using (public.is_finance()) with check (public.is_finance());

-- the summary view now also reports the folder (new column goes last)
create or replace view public.budget_summary
with (security_invoker = true) as
select
  b.id as budget_id,
  b.name,
  b.event_id,
  b.total_budget,
  coalesce(sum(e.amount) filter (where e.voided_at is null), 0)::numeric(12,2) as total_spent,
  (b.total_budget - coalesce(sum(e.amount) filter (where e.voided_at is null), 0))::numeric(12,2) as money_left,
  b.folder_id
from public.budgets b
left join public.expenses e on e.budget_id = b.id
group by b.id;

-- ---------- MERCH FOLDERS (group items and orders by sale period) ----------
create table if not exists public.merch_folders (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  created_by  uuid default auth.uid() references public.profiles(id),
  created_at  timestamptz not null default now()
);
alter table public.merch_items
  add column if not exists folder_id uuid references public.merch_folders(id) on delete set null;
create index if not exists merch_items_folder_idx on public.merch_items (folder_id);

alter table public.merch_folders enable row level security;
drop policy if exists "merch_folders: read" on public.merch_folders;
create policy "merch_folders: read" on public.merch_folders for select using (public.is_approved());
drop policy if exists "merch_folders: finance write" on public.merch_folders;
create policy "merch_folders: finance write" on public.merch_folders for all
  using (public.is_finance()) with check (public.is_finance());

-- ---------- SUPPLIER COSTS: finance only (members can no longer see them) ----------
create table if not exists public.merch_item_costs (
  item_id    uuid primary key references public.merch_items(id) on delete cascade,
  unit_cost  numeric(12,2) not null default 0 check (unit_cost >= 0)
);
alter table public.merch_item_costs enable row level security;
drop policy if exists "merch_item_costs: finance only" on public.merch_item_costs;
create policy "merch_item_costs: finance only" on public.merch_item_costs for all
  using (public.is_finance()) with check (public.is_finance());

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'merch_items' and column_name = 'unit_cost'
  ) then
    insert into public.merch_item_costs (item_id, unit_cost)
      select id, unit_cost from public.merch_items on conflict do nothing;
    alter table public.merch_items drop column unit_cost;
  end if;
end $$;

-- ---------- GCASH PAYMENT DETAILS (one row, posted by finance) ----------
create table if not exists public.payment_settings (
  id           int primary key default 1 check (id = 1),
  gcash_number text,
  gcash_name   text,
  instructions text,
  qr_path      text,
  updated_by   uuid references public.profiles(id),
  updated_at   timestamptz not null default now()
);
insert into public.payment_settings (id) values (1) on conflict do nothing;

alter table public.payment_settings enable row level security;
drop policy if exists "payment_settings: read" on public.payment_settings;
create policy "payment_settings: read" on public.payment_settings for select using (public.is_approved());
drop policy if exists "payment_settings: finance insert" on public.payment_settings;
create policy "payment_settings: finance insert" on public.payment_settings
  for insert with check (public.is_finance());
drop policy if exists "payment_settings: finance update" on public.payment_settings;
create policy "payment_settings: finance update" on public.payment_settings
  for update using (public.is_finance()) with check (public.is_finance());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-info', 'payment-info', false, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

drop policy if exists "payment-info: members read" on storage.objects;
create policy "payment-info: members read" on storage.objects
  for select using (bucket_id = 'payment-info' and public.is_approved());
drop policy if exists "payment-info: finance upload" on storage.objects;
create policy "payment-info: finance upload" on storage.objects
  for insert with check (bucket_id = 'payment-info' and public.is_finance());
drop policy if exists "payment-info: finance delete" on storage.objects;
create policy "payment-info: finance delete" on storage.objects
  for delete using (bucket_id = 'payment-info' and public.is_finance());

-- ---------- PAYMENT PROOFS (member sends a screenshot, finance verifies) ----------
create table if not exists public.merch_payment_proofs (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.merch_orders(id) on delete cascade,
  user_id       uuid not null default auth.uid() references public.profiles(id),
  image_path    text not null,
  amount        numeric(12,2) not null check (amount > 0),
  reference     text,
  status        text not null default 'pending' check (status in ('pending','verified','rejected')),
  reviewed_by   uuid references public.profiles(id),
  reviewed_at   timestamptz,
  reject_reason text,
  payment_id    uuid references public.merch_payments(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists merch_proofs_order_idx on public.merch_payment_proofs (order_id);
create index if not exists merch_proofs_status_idx on public.merch_payment_proofs (status);

create or replace function public.merch_proof_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare o public.merch_orders%rowtype; balance numeric;
begin
  select * into o from public.merch_orders where id = new.order_id;
  if not found or o.user_id is distinct from auth.uid() then
    raise exception 'You can only send proof for your own orders';
  end if;
  if o.cancelled_at is not null then raise exception 'This order was cancelled'; end if;
  if o.claimed_at is not null then raise exception 'This order was already claimed'; end if;
  balance := o.quantity * o.unit_price - o.amount_paid;
  if balance <= 0 then raise exception 'This order is already fully paid'; end if;
  if new.amount > balance then raise exception 'That is more than your balance'; end if;
  new.user_id := auth.uid();
  new.status := 'pending';
  new.reviewed_by := null;
  new.reviewed_at := null;
  new.reject_reason := null;
  new.payment_id := null;
  return new;
end $$;

drop trigger if exists merch_proof_before_insert_trg on public.merch_payment_proofs;
create trigger merch_proof_before_insert_trg before insert on public.merch_payment_proofs
  for each row execute function public.merch_proof_before_insert();

alter table public.merch_payment_proofs enable row level security;
drop policy if exists "proofs: read own or finance" on public.merch_payment_proofs;
create policy "proofs: read own or finance" on public.merch_payment_proofs
  for select using (user_id = auth.uid() or public.is_finance());
drop policy if exists "proofs: send own" on public.merch_payment_proofs;
create policy "proofs: send own" on public.merch_payment_proofs
  for insert with check (user_id = auth.uid() and public.is_approved());
-- no update or delete policy: finance uses the two functions below

create or replace function public.verify_payment_proof(p_proof uuid, p_amount numeric, p_method text default 'gcash')
returns void language plpgsql security definer set search_path = public as $$
declare pr public.merch_payment_proofs%rowtype; pid uuid;
begin
  if not public.is_finance() then raise exception 'Only the finance head can do this'; end if;
  select * into pr from public.merch_payment_proofs where id = p_proof for update;
  if not found then raise exception 'That proof does not exist'; end if;
  if pr.status <> 'pending' then raise exception 'This proof was already reviewed'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter the amount received'; end if;
  insert into public.merch_payments (order_id, amount, method, reference)
  values (pr.order_id, p_amount, p_method, pr.reference)
  returning id into pid;
  update public.merch_payment_proofs
  set status = 'verified', reviewed_by = auth.uid(), reviewed_at = now(), payment_id = pid
  where id = p_proof;
end $$;
revoke all on function public.verify_payment_proof(uuid, numeric, text) from public, anon;
grant execute on function public.verify_payment_proof(uuid, numeric, text) to authenticated;

create or replace function public.reject_payment_proof(p_proof uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare pr public.merch_payment_proofs%rowtype;
begin
  if not public.is_finance() then raise exception 'Only the finance head can do this'; end if;
  if nullif(trim(p_reason), '') is null then raise exception 'Give a reason'; end if;
  select * into pr from public.merch_payment_proofs where id = p_proof for update;
  if not found then raise exception 'That proof does not exist'; end if;
  if pr.status <> 'pending' then raise exception 'This proof was already reviewed'; end if;
  update public.merch_payment_proofs
  set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), reject_reason = trim(p_reason)
  where id = p_proof;
end $$;
revoke all on function public.reject_payment_proof(uuid, text) from public, anon;
grant execute on function public.reject_payment_proof(uuid, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

-- Files live in a folder named after the member's id
drop policy if exists "payment-proofs: own or finance read" on storage.objects;
create policy "payment-proofs: own or finance read" on storage.objects
  for select using (
    bucket_id = 'payment-proofs'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_finance())
  );
drop policy if exists "payment-proofs: upload own" on storage.objects;
create policy "payment-proofs: upload own" on storage.objects
  for insert with check (
    bucket_id = 'payment-proofs' and public.is_approved()
    and (storage.foldername(name))[1] = auth.uid()::text
  );
drop policy if exists "payment-proofs: delete own" on storage.objects;
create policy "payment-proofs: delete own" on storage.objects
  for delete using (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- AUDIT TRAIL ----------
drop trigger if exists audit_merch_proofs on public.merch_payment_proofs;
create trigger audit_merch_proofs after insert or update on public.merch_payment_proofs
  for each row execute function public.log_changes();
drop trigger if exists audit_budget_folders on public.budget_folders;
create trigger audit_budget_folders after insert or update or delete on public.budget_folders
  for each row execute function public.log_changes();
