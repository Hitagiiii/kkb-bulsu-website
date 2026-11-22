-- Enable Supabase Realtime for the consolidated merch order spreadsheet.
-- This changes publication membership only; it adds no tables or columns.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'merch_orders'
  ) then
    alter publication supabase_realtime add table public.merch_orders;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'merch_payments'
  ) then
    alter publication supabase_realtime add table public.merch_payments;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'merch_items'
  ) then
    alter publication supabase_realtime add table public.merch_items;
  end if;
end
$$;
