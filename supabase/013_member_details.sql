-- Member application details collected at sign-up (student number already exists as student_no).
alter table public.profiles
  add column if not exists college      text,
  add column if not exists program      text,
  add column if not exists year_section text;

-- Store the details sent with the sign-up form
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, student_no, college, program, year_section)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'student_no', ''),
    nullif(new.raw_user_meta_data->>'college', ''),
    nullif(new.raw_user_meta_data->>'program', ''),
    nullif(new.raw_user_meta_data->>'year_section', '')
  );
  return new;
end $$;
