-- Lets a signed-in player read back their OWN date of birth (the Settings screen shows it greyed out). Nobody else's can be read.
create or replace function public.my_date_of_birth() returns date language sql stable security definer set search_path = public as $$
  select d.date_of_birth from public.profile_private d where d.user_id = auth.uid()
$$;
revoke all on function public.my_date_of_birth() from public, anon;
grant execute on function public.my_date_of_birth() to authenticated;
