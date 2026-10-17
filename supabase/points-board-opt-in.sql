-- 2026-10-17: POINTS LEADERBOARD OPT-IN. Players 18 and older appear on the Drum Points ranking only when they switched
-- "Points leaderboard" on in Settings (separate from the worldwide leaderboard). Younger players are on it as before. Safe to re-run.
alter table public.settings add column if not exists points_board_opt_in boolean not null default false;
grant insert (points_board_opt_in) on public.settings to authenticated;
grant update (points_board_opt_in) on public.settings to authenticated;

create or replace function public.drum_points_on_board(uid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select public.age_band_on(d.date_of_birth, current_date) in ('under_10', '10_13', '14_17') from public.profile_private d where d.user_id = uid), false)
      or coalesce((select s.points_board_opt_in from public.settings s where s.user_id = uid), false)
$$;
revoke execute on function public.drum_points_on_board(uuid) from public, anon, authenticated;

-- Who is on the Points ranking of the leaderboard screen: players under 18 as before (they joined the leaderboard), and players 18 and older who switched "Points leaderboard" on.
create or replace function public.lb_points_eligible()
returns table (user_id uuid, display_name text, board text)
language sql stable security definer set search_path = public as $$
  select e.user_id, e.display_name, e.board from public.lb_eligible() e where e.board <> '18_plus'
  union all
  select s.user_id, left(regexp_replace(trim(p.name), '^(\S+)\s+.*?(\S)\S*$', '\1 \2.'), 30), '18_plus'::text
  from public.settings s join public.profiles p on p.id = s.user_id
  where s.points_board_opt_in and not s.leaderboard_hidden and length(trim(coalesce(p.name, ''))) > 0 and public.lb_board_of(s.user_id) = '18_plus'
$$;
revoke all on function public.lb_points_eligible() from public, anon, authenticated;

create or replace function public.leaderboard(p_category text, p_period text, p_level text default 'all', p_limit integer default 20)
returns table (pos bigint, display_name text, score numeric, detail integer, level text, is_me boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50); v_board text; v_joined boolean;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  v_board := public.lb_board_of(auth.uid());
  if v_board is null then raise exception 'Add your date of birth first'; end if;
  if p_category = 'points' and v_board = '18_plus' then
    v_joined := coalesce((select s.points_board_opt_in from public.settings s where s.user_id = auth.uid()), false);
  else
    v_joined := coalesce((select s.leaderboard_opt_in from public.settings s where s.user_id = auth.uid()), false);
  end if;
  if not v_joined then raise exception 'Join the leaderboard first'; end if;
  if p_category not in ('consistency', 'skill', 'points') or p_period not in ('month', 'year')
     or p_level not in ('all', 'beginner', 'intermediate', 'advanced', 'legend') then
    raise exception 'Invalid request';
  end if;
  return query
  with elig as (
    select e.user_id, e.display_name, e.board from public.lb_eligible() e where p_category <> 'points'
    union all
    select e.user_id, e.display_name, e.board from public.lb_points_eligible() e where p_category = 'points'
  ), lv as (
    select e.user_id as uid, e.display_name as nm, coalesce(l.level, 'beginner') as lvl
    from elig e left join public.lb_levels() l on l.user_id = e.user_id
    where e.board = v_board
  ), joined as (
    select lv.uid, lv.nm, s.score as sc, s.detail as dt, lv.lvl
    from lv join public.lb_scores(p_category, p_period, current_date) s on s.user_id = lv.uid
    where s.score > 0 and (p_level = 'all' or lv.lvl = p_level)
  ), ranked as (
    select rank() over (order by j.sc desc, j.dt desc) as rk, row_number() over (order by j.sc desc, j.dt desc, j.nm) as rn, j.* from joined j
  )
  select r.rk, r.nm, r.sc, r.dt, r.lvl, (r.uid = auth.uid())
  from ranked r where r.rn <= v_limit or r.uid = auth.uid() order by r.rk, r.nm;
end;
$$;
revoke all on function public.leaderboard(text, text, text, integer) from public, anon;
grant execute on function public.leaderboard(text, text, text, integer) to authenticated;
