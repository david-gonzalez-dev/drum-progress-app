-- =====================================================================================================
-- 2026-10-13: DATE OF BIRTH -> age band -> leaderboard category (Under 10 / 10-17 / 18+), computed on the SERVER only.
-- The date of birth lives in its own table that no client role can read or write; the app only talks to the functions below,
-- which return an age band (never the date). Safe to re-run.
-- Age bands (internal): under_10, 10_13, 14_17, 18_plus. Leaderboard categories: under_10, 10_17 (10_13 + 14_17), 18_plus.
-- =====================================================================================================

-- 1) Private storage. RLS is on with NO policies and all client privileges are revoked, so nobody but the server functions can touch it.
create table if not exists public.profile_private (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  date_of_birth date not null,
  created_at timestamptz not null default now()
);
alter table public.profile_private enable row level security;
revoke all on public.profile_private from public, anon, authenticated;
grant select, insert, update, delete on public.profile_private to service_role;

-- The old self-chosen age category is no longer used; the client may not write it any more.
revoke insert (age_group), update (age_group) on public.settings from authenticated;

-- 2) Age maths (one place). Birthdays are exact: the band changes on the birthday itself.
create or replace function public.age_band_on(dob date, asof date) returns text language sql immutable as $$
  select case
    when dob is null then null
    when date_part('year', age(asof, dob)) < 10 then 'under_10'
    when date_part('year', age(asof, dob)) < 14 then '10_13'
    when date_part('year', age(asof, dob)) < 18 then '14_17'
    else '18_plus' end
$$;
create or replace function public.lb_board_for(band text) returns text language sql immutable as $$
  select case band when 'under_10' then 'under_10' when '10_13' then '10_17' when '14_17' then '10_17' when '18_plus' then '18_plus' end
$$;
create or replace function public.lb_board_of(uid uuid) returns text language sql stable security definer set search_path = public as $$
  select public.lb_board_for(public.age_band_on(d.date_of_birth, current_date)) from public.profile_private d where d.user_id = uid
$$;

-- 3) What the app can call. Returns the band only, never the date.
create or replace function public.set_my_date_of_birth(p_dob date) returns text
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_dob is null or p_dob > current_date - interval '3 years' or p_dob < current_date - interval '110 years' then raise exception 'Invalid date of birth'; end if;
  if exists (select 1 from public.profile_private where user_id = auth.uid()) then raise exception 'Date of birth already set'; end if;
  insert into public.profile_private (user_id, date_of_birth) values (auth.uid(), p_dob);
  return public.age_band_on(p_dob, current_date);
end;
$$;
create or replace function public.my_age_band() returns text language sql stable security definer set search_path = public as $$
  select public.age_band_on(d.date_of_birth, current_date) from public.profile_private d where d.user_id = auth.uid()
$$;
-- Admin (teacher) only: read a student's band, and correct a wrongly entered date of birth (users cannot change it themselves).
create or replace function public.admin_age_band(target_user_id uuid) returns text language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  return (select public.age_band_on(d.date_of_birth, current_date) from public.profile_private d where d.user_id = target_user_id);
end;
$$;
create or replace function public.admin_set_date_of_birth(target_user_id uuid, p_dob date) returns text language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  if p_dob is null or p_dob > current_date - interval '3 years' or p_dob < current_date - interval '110 years' then raise exception 'Invalid date of birth'; end if;
  insert into public.profile_private (user_id, date_of_birth) values (target_user_id, p_dob)
  on conflict (user_id) do update set date_of_birth = excluded.date_of_birth;
  return public.age_band_on(p_dob, current_date);
end;
$$;

-- 4) Leaderboard: the category comes from the date of birth. Same scoring and ranking as before; same function signatures.
create or replace function public.lb_eligible()
returns table (user_id uuid, display_name text, board text)
language sql stable security definer set search_path = public as $$
  select x.user_id,
    case when x.band in ('under_10', '10_13', '14_17') then left(split_part(trim(x.name), ' ', 1), 30)
         else left(regexp_replace(trim(x.name), '^(\S+)\s+.*?(\S)\S*$', '\1 \2.'), 30) end,
    public.lb_board_for(x.band)
  from (
    select s.user_id, p.name, public.age_band_on(d.date_of_birth, current_date) as band, s.leaderboard_opt_in, s.leaderboard_hidden
    from public.settings s join public.profiles p on p.id = s.user_id join public.profile_private d on d.user_id = s.user_id
  ) x
  where x.leaderboard_opt_in and not x.leaderboard_hidden and length(trim(coalesce(x.name, ''))) > 0
$$;

create or replace function public.leaderboard(p_category text, p_period text, p_level text default 'all', p_limit integer default 20)
returns table (pos bigint, display_name text, score numeric, detail integer, level text, is_me boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50); v_board text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not coalesce((select s.leaderboard_opt_in from public.settings s where s.user_id = auth.uid()), false) then raise exception 'Join the leaderboard first'; end if;
  v_board := public.lb_board_of(auth.uid());
  if v_board is null then raise exception 'Add your date of birth first'; end if;
  if p_category not in ('consistency', 'skill', 'points') or p_period not in ('month', 'year')
     or p_level not in ('all', 'beginner', 'intermediate', 'advanced', 'legend') then
    raise exception 'Invalid request';
  end if;
  return query
  with lv as (
    select e.user_id as uid, e.display_name as nm, coalesce(l.level, 'beginner') as lvl
    from public.lb_eligible() e left join public.lb_levels() l on l.user_id = e.user_id
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

create or replace function public.leaderboard_summary()
returns table (opted_in boolean, eligible boolean, pos bigint, total bigint, prev_pos bigint, level text, board text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare v_in boolean; v_elig boolean; v_pos bigint; v_total bigint; v_prev bigint; v_level text; v_board text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select coalesce(s.leaderboard_opt_in, false) into v_in from public.settings s where s.user_id = auth.uid();
  v_in := coalesce(v_in, false);
  v_board := public.lb_board_of(auth.uid());
  select exists (select 1 from public.lb_eligible() e where e.user_id = auth.uid()) into v_elig;
  select coalesce((select l.level from public.lb_levels() l where l.user_id = auth.uid()), 'beginner') into v_level;
  if v_board is not null then
    select count(*) into v_total from public.lb_scores('consistency', 'month', current_date) s join public.lb_eligible() e on e.user_id = s.user_id where s.score > 0 and e.board = v_board;
    select r.rk into v_pos from (
      select s.user_id as uid, rank() over (order by s.score desc, s.detail desc) as rk
      from public.lb_scores('consistency', 'month', current_date) s join public.lb_eligible() e on e.user_id = s.user_id where s.score > 0 and e.board = v_board
    ) r where r.uid = auth.uid();
    if date_trunc('month', current_date - 1) = date_trunc('month', current_date) then
      select r.rk into v_prev from (
        select s.user_id as uid, rank() over (order by s.score desc, s.detail desc) as rk
        from public.lb_scores('consistency', 'month', current_date - 1) s join public.lb_eligible() e on e.user_id = s.user_id where s.score > 0 and e.board = v_board
      ) r where r.uid = auth.uid();
    end if;
  end if;
  return query select v_in, v_elig, v_pos, v_total, v_prev, v_level, v_board;
end;
$$;

-- A tempo unlocks after 1 comfortable minute for under 14 (bands under_10 and 10_13), 2 otherwise.
create or replace function public.lb_unlocks()
returns table (user_id uuid, exercise text, tempo integer, unlocked_on date, tier text)
language sql stable security definer set search_path = public as $$
  with q as (
    select v.user_id as uid, v.exercise as ex, v.tempo as t, v.practiced_on as d,
      sum(v.minutes) over (partition by v.user_id, v.exercise, v.tempo order by v.practiced_on) as running
    from public.lb_valid_sessions() v where v.rating in ('comfortable', 'mastered')
  ), firsts as (
    select distinct on (q.uid, q.ex, q.t) q.uid, q.ex, q.t, q.d
    from q left join public.profile_private dd on dd.user_id = q.uid
    where q.running >= case when public.age_band_on(dd.date_of_birth, current_date) in ('under_10', '10_13') then 1 else 2 end
    order by q.uid, q.ex, q.t, q.d
  )
  select f.uid, f.ex, f.t, f.d, public.lb_tier(public.lb_exercise_profile(f.ex), f.t) from firsts f
$$;

-- 5) Permissions: internal helpers are not callable from the app; only these are, and only when signed in.
revoke all on function public.age_band_on(date, date), public.lb_board_for(text), public.lb_board_of(uuid), public.lb_eligible(), public.lb_unlocks() from public, anon, authenticated;
revoke all on function public.set_my_date_of_birth(date), public.my_age_band(), public.admin_age_band(uuid), public.admin_set_date_of_birth(uuid, date) from public, anon;
revoke all on function public.leaderboard(text, text, text, integer), public.leaderboard_summary() from public, anon;
grant execute on function public.set_my_date_of_birth(date) to authenticated;
grant execute on function public.my_age_band() to authenticated;
grant execute on function public.admin_age_band(uuid) to authenticated;
grant execute on function public.admin_set_date_of_birth(uuid, date) to authenticated;
grant execute on function public.leaderboard(text, text, text, integer) to authenticated;
grant execute on function public.leaderboard_summary() to authenticated;
