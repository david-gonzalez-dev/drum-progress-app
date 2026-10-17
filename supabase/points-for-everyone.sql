-- =====================================================================================================
-- 2026-10-17: DRUM POINTS FOR EVERYONE. Anyone with a date of birth on file can switch Drum Points on in Settings (off by default).
-- Players under 17 are on their age group's points board as before. Older players only appear on the board when they have also
-- joined the leaderboard (their own row is always visible to themselves). Safe to re-run.
-- =====================================================================================================

-- Anyone with a date of birth (the age group decides the board). Internal helper: the app cannot call it.
create or replace function public.drum_points_eligible(uid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profile_private d where d.user_id = uid and d.date_of_birth is not null)
$$;
revoke execute on function public.drum_points_eligible(uuid) from public, anon, authenticated;

-- Who is shown to others on the points board: players under 17 (as before), and older players only once they joined the leaderboard.
create or replace function public.drum_points_on_board(uid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select date_part('year', age(current_date, d.date_of_birth)) < 17 from public.profile_private d where d.user_id = uid), false)
      or coalesce((select s.leaderboard_opt_in from public.settings s where s.user_id = uid), false)
$$;
revoke execute on function public.drum_points_on_board(uuid) from public, anon, authenticated;

create or replace function public.drum_points_board(p_period text, p_limit integer default 20)
returns table (pos bigint, display_name text, points bigint, is_me boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare v_board text; v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_period not in ('year', 'all') then raise exception 'Invalid request'; end if;
  if not public.drum_points_eligible(auth.uid()) or not coalesce((select s.points_enabled from public.settings s where s.user_id = auth.uid()), false) then return; end if;
  v_board := public.lb_board_of(auth.uid());
  return query
  with players as (
    select s.user_id as uid, left(split_part(trim(p.name), ' ', 1), 30) as nm
    from public.settings s join public.profiles p on p.id = s.user_id
    where s.points_enabled and public.drum_points_eligible(s.user_id) and public.lb_board_of(s.user_id) = v_board
      and (s.user_id = auth.uid() or public.drum_points_on_board(s.user_id))
      and length(trim(coalesce(p.name, ''))) > 0
  ), totals as (
    select pl.uid, pl.nm, coalesce(sum(a.amount), 0)::bigint as pts
    from players pl left join public.point_awards a on a.user_id = pl.uid and (p_period = 'all' or a.created_at >= date_trunc('year', now()))
    group by pl.uid, pl.nm
  ), ranked as (
    select rank() over (order by t.pts desc) as rk, row_number() over (order by t.pts desc, t.nm) as rn, t.* from totals t
  )
  select r.rk, r.nm, r.pts, (r.uid = auth.uid())
  from ranked r where (r.rn <= v_limit and r.pts > 0) or r.uid = auth.uid() order by r.rk, r.nm;
end;
$$;
revoke execute on function public.drum_points_board(text, integer) from public, anon;
grant execute on function public.drum_points_board(text, integer) to authenticated;

create or replace function public.drum_points_summary(p_period text)
returns table (points bigint, pos bigint, total bigint, above_name text, above_gap bigint)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare v_board text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_period not in ('year', 'all', 'week') then raise exception 'Invalid request'; end if;
  if not public.drum_points_eligible(auth.uid()) or not coalesce((select s.points_enabled from public.settings s where s.user_id = auth.uid()), false) then return; end if;
  v_board := public.lb_board_of(auth.uid());
  return query
  with players as (
    select s.user_id as uid, left(split_part(trim(p.name), ' ', 1), 30) as nm
    from public.settings s join public.profiles p on p.id = s.user_id
    where s.points_enabled and public.drum_points_eligible(s.user_id) and public.lb_board_of(s.user_id) = v_board
      and (s.user_id = auth.uid() or public.drum_points_on_board(s.user_id))
      and length(trim(coalesce(p.name, ''))) > 0
  ), totals as (
    select pl.uid, pl.nm, coalesce(sum(a.amount), 0)::bigint as pts
    from players pl left join public.point_awards a on a.user_id = pl.uid and a.created_at >= (case p_period when 'all' then timestamptz '-infinity' when 'week' then date_trunc('week', now()) else date_trunc('year', now()) end)
    group by pl.uid, pl.nm
  ), me as (
    select t.pts as mp from totals t where t.uid = auth.uid()
  )
  select (select m.mp from me m),
         (select 1 + count(*) from totals t where t.pts > (select m.mp from me m)),
         (select count(*) from totals t where t.pts > 0 or t.uid = auth.uid()),
         (select t.nm from totals t where t.pts > (select m.mp from me m) order by t.pts asc, t.nm limit 1),
         (select min(t.pts) - (select m.mp from me m) + 1 from totals t where t.pts > (select m.mp from me m))
  where exists (select 1 from me);
end;
$$;
revoke execute on function public.drum_points_summary(text) from public, anon;
grant execute on function public.drum_points_summary(text) to authenticated;

create or replace function public.points_leaderboard()
returns table (id uuid, name text, total_points bigint)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare v_board text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not public.drum_points_eligible(auth.uid()) or not coalesce((select s.points_enabled from public.settings s where s.user_id = auth.uid()), false) then return; end if;
  v_board := public.lb_board_of(auth.uid());
  return query
  select p.id, left(split_part(trim(p.name), ' ', 1), 30), coalesce(sum(pa.amount), 0)::bigint
  from public.profiles p
  join public.settings s on s.user_id = p.id
  left join public.point_awards pa on pa.user_id = p.id
  where s.points_enabled and public.drum_points_eligible(p.id) and public.lb_board_of(p.id) = v_board
    and (p.id = auth.uid() or public.drum_points_on_board(p.id))
  group by p.id, p.name order by coalesce(sum(pa.amount), 0) desc, p.name asc;
end;
$$;
revoke execute on function public.points_leaderboard() from anon, public;
grant execute on function public.points_leaderboard() to authenticated;
