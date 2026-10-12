-- =====================================================================================================
-- 2026-10-12: AGE CATEGORY + PRACTICE DIFFICULTY (self-service settings, admin can adjust a student's difficulty)
-- Safe to re-run. Existing rows keep working: age_group stays empty (unknown) and practice_difficulty defaults to
-- 'standard', which is exactly how the app behaved before.
-- =====================================================================================================
alter table public.settings add column if not exists age_group text check (age_group in ('under_10', '10_13', '14_plus'));
alter table public.settings add column if not exists practice_difficulty text not null default 'standard' check (practice_difficulty in ('beginner', 'developing', 'standard'));
-- A student may set both for themselves (they are preferences, like kid_mode); nothing else on the row changes.
grant insert (age_group, practice_difficulty) on public.settings to authenticated;
grant update (age_group, practice_difficulty) on public.settings to authenticated;

-- The admin (teacher) can set a student's practice difficulty; same pattern as admin_set_kid_mode.
create or replace function public.admin_set_practice_difficulty(target_user_id uuid, difficulty text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  if difficulty not in ('beginner', 'developing', 'standard') then raise exception 'Invalid difficulty'; end if;
  insert into public.settings (user_id, practice_difficulty) values (target_user_id, difficulty)
  on conflict (user_id) do update set practice_difficulty = excluded.practice_difficulty;
end;
$$;
revoke execute on function public.admin_set_practice_difficulty(uuid, text) from anon, public;
grant execute on function public.admin_set_practice_difficulty(uuid, text) to authenticated;
