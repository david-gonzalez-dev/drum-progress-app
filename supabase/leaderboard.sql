-- =====================================================================================================
-- 2026-10-12: UNIVERSAL (WORLDWIDE) LEADERBOARD
-- Opt-in, computed entirely on the server from the existing practice tables. The app never sends a score.
-- Safe to re-run. Run the whole block in the Supabase SQL Editor.
-- =====================================================================================================

-- 1) Opt-in (self-service) and admin-only hide switch. Only leaderboard_opt_in is granted to the app; leaderboard_hidden and
--    the opt-in timestamp are not, so nobody can un-hide themselves or fake their consent date.
alter table public.settings add column if not exists leaderboard_opt_in boolean not null default false;
alter table public.settings add column if not exists leaderboard_opted_in_at timestamptz;
alter table public.settings add column if not exists leaderboard_hidden boolean not null default false;
grant insert (leaderboard_opt_in) on public.settings to authenticated;
grant update (leaderboard_opt_in) on public.settings to authenticated;

create or replace function public.settings_leaderboard_stamp() returns trigger language plpgsql as $$
begin
  if new.leaderboard_opt_in then
    if tg_op = 'INSERT' then
      new.leaderboard_opted_in_at := now();
    elsif not coalesce(old.leaderboard_opt_in, false) then
      new.leaderboard_opted_in_at := now();
    end if;
  else
    new.leaderboard_opted_in_at := null;
  end if;
  return new;
end;
$$;
drop trigger if exists settings_leaderboard_stamp on public.settings;
create trigger settings_leaderboard_stamp before insert or update on public.settings for each row execute function public.settings_leaderboard_stamp();

-- 2) Tempo ladders and tiers, mirroring the app (Bass Drum - Heel Down has the footwork ladder; six rudiments have the
--    extended ladder up to 280 BPM; everything else uses the default ladder).
create or replace function public.lb_exercise_profile(exercise_name text) returns text language sql immutable as $$
  select case
    when exercise_name = 'Bass Drum - Heel Down' then 'footwork'
    when exercise_name in ('Double Paradiddle', 'Triple Paradiddle', 'Paradiddle-Diddle', 'Flam', 'Single Strokes Four', 'Single Strokes Seven') then 'extended'
    else 'default' end
$$;
-- Only real rungs of the ladder count (so a forged 77 BPM session can't create an extra "unlock").
create or replace function public.lb_valid_bpm(profile text, tempo integer) returns boolean language sql immutable as $$
  select case profile
    when 'footwork' then tempo between 50 and 200 and tempo % 5 = 0
    when 'extended' then (tempo between 50 and 150 and tempo % 10 = 0) or (tempo between 160 and 280 and tempo % 5 = 0)
    else (tempo between 50 and 150 and tempo % 10 = 0) or (tempo between 160 and 220 and tempo % 5 = 0) end
$$;
create or replace function public.lb_tier(profile text, tempo integer) returns text language sql immutable as $$
  select case profile
    when 'footwork' then case when tempo <= 90 then 'beginner' when tempo <= 130 then 'intermediate' when tempo <= 160 then 'advanced' else 'legend' end
    when 'extended' then case when tempo <= 90 then 'beginner' when tempo <= 170 then 'intermediate' when tempo <= 220 then 'advanced' else 'legend' end
    else case when tempo <= 90 then 'beginner' when tempo <= 150 then 'intermediate' when tempo <= 190 then 'advanced' else 'legend' end end
$$;
create or replace function public.lb_tier_rank(tier_name text) returns integer language sql immutable as $$
  select case tier_name when 'beginner' then 1 when 'intermediate' then 2 when 'advanced' then 3 else 4 end
$$;

-- 3) Trusted sessions only: logged on (or within a day of) the practice date, a real ladder tempo, and not more than 75 minutes
--    of sessions inside any 60 minutes (physically impossible otherwise). This only decides what the leaderboard counts: nothing
--    here blocks or changes what a student saves, and their own history is untouched.
create or replace function public.lb_valid_sessions()
returns table (user_id uuid, exercise text, tempo integer, practiced_on date, minutes integer, rating text)
language sql stable security definer set search_path = public as $$
  with base as (
    select s.user_id as uid, e.name_en as ex, s.bpm as t, s.practiced_on as d, s.duration_minutes as m, s.rating as r, s.created_at as c
    from public.practice_sessions s
    join public.practice_exercises e on e.id = s.practice_exercise_id
    where e.category in ('rudiments', 'exercises')
      and public.lb_valid_bpm(public.lb_exercise_profile(e.name_en), s.bpm)
      and (s.created_at at time zone 'UTC')::date between s.practiced_on - 1 and s.practiced_on + 1
  ), windowed as (
    select b.*, sum(b.m) over (partition by b.uid order by b.c range between interval '60 minutes' preceding and current row) as hour_minutes from base b
  )
  select w.uid, w.ex, w.t, w.d, w.m, w.r from windowed w where w.hour_minutes <= 75
$$;

-- A tempo is unlocked once it has 2 comfortable-or-better minutes (same rule as the app); the unlock date is the day it got there.
create or replace function public.lb_unlocks()
returns table (user_id uuid, exercise text, tempo integer, unlocked_on date, tier text)
language sql stable security definer set search_path = public as $$
  with q as (
    select v.user_id as uid, v.exercise as ex, v.tempo as t, v.practiced_on as d,
      sum(v.minutes) over (partition by v.user_id, v.exercise, v.tempo order by v.practiced_on) as running
    from public.lb_valid_sessions() v where v.rating in ('comfortable', 'mastered')
  ), firsts as (
    select distinct on (q.uid, q.ex, q.t) q.uid, q.ex, q.t, q.d from q where q.running >= 2 order by q.uid, q.ex, q.t, q.d
  )
  select f.uid, f.ex, f.t, f.d, public.lb_tier(public.lb_exercise_profile(f.ex), f.t) from firsts f
$$;

-- Level = highest tier reached in at least 1 in 4 of the exercises the person has practiced (same rule as the Progress tab).
create or replace function public.lb_levels()
returns table (user_id uuid, level text)
language sql stable security definer set search_path = public as $$
  with practiced as (select v.user_id as uid, count(distinct v.exercise) as n from public.lb_valid_sessions() v group by v.user_id),
  reached as (select u.user_id as uid, u.tier as tr, count(distinct u.exercise) as r from public.lb_unlocks() u group by u.user_id, u.tier)
  select p.uid,
    coalesce((select r.tr from reached r where r.uid = p.uid and r.r >= greatest(1, ceil(p.n / 4.0)) order by public.lb_tier_rank(r.tr) desc limit 1), 'beginner')
  from practiced p
$$;

-- Who may appear: opted in, not hidden by the admin, not a Kid Mode account, and has a name. Names are cut at 30 characters.
create or replace function public.lb_eligible()
returns table (user_id uuid, display_name text)
language sql stable security definer set search_path = public as $$
  select s.user_id, left(regexp_replace(trim(p.name), '^(\S+)\s+.*?(\S)\S*$', '\1 \2.'), 30)
  from public.settings s join public.profiles p on p.id = s.user_id
  where s.leaderboard_opt_in and not s.leaderboard_hidden and not s.kid_mode and length(trim(coalesce(p.name, ''))) > 0
$$;

-- 4) Scores for one category and period, as of a date (the public function passes today's date; tests can pass another).
--    consistency = practice days (5+ minutes each) in the period, tie-break = longest streak. Total minutes are never ranked.
--    skill       = tempos newly unlocked in the period, tie-break = number of different exercises.
--    points      = existing teacher-awarded points in the period (must be above zero).
create or replace function public.lb_scores(p_category text, p_period text, p_asof date)
returns table (user_id uuid, score numeric, detail integer)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare v_start date := case when p_period = 'year' then date_trunc('year', p_asof)::date else date_trunc('month', p_asof)::date end;
begin
  if p_category = 'consistency' then
    return query
    with days as (
      select distinct l.user_id as uid, l.practiced_on as d from public.practice_logs l
      where l.minutes >= 5 and l.practiced_on between v_start and p_asof
        and (l.created_at at time zone 'UTC')::date between l.practiced_on - 1 and l.practiced_on + 1
    ), islands as (
      select d.uid, d.d - (row_number() over (partition by d.uid order by d.d))::integer as grp from days d
    ), runs as (select i.uid, i.grp, count(*) as len from islands i group by i.uid, i.grp)
    select r.uid, sum(r.len)::numeric, max(r.len)::integer from runs r group by r.uid;
  elsif p_category = 'skill' then
    return query
    select u.user_id, count(*)::numeric, count(distinct u.exercise)::integer from public.lb_unlocks() u
    where u.unlocked_on between v_start and p_asof group by u.user_id;
  elsif p_category = 'points' then
    return query
    select a.user_id, sum(a.amount)::numeric, count(*)::integer from public.point_awards a
    where a.created_at >= v_start and a.created_at < (p_asof + 1) group by a.user_id having sum(a.amount) > 0;
  end if;
end;
$$;

-- 5) What the app calls. Returns names, positions, scores and levels only: never ids, emails, notes or practice rows. Your own row is
--    always included, even when you are outside the top list.
create or replace function public.leaderboard(p_category text, p_period text, p_level text default 'all', p_limit integer default 20)
returns table (pos bigint, display_name text, score numeric, detail integer, level text, is_me boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not coalesce((select s.leaderboard_opt_in from public.settings s where s.user_id = auth.uid()), false) then raise exception 'Join the leaderboard first'; end if;
  if p_category not in ('consistency', 'skill', 'points') or p_period not in ('month', 'year')
     or p_level not in ('all', 'beginner', 'intermediate', 'advanced', 'legend') then
    raise exception 'Invalid request';
  end if;
  return query
  with lv as (
    select e.user_id as uid, e.display_name as nm, coalesce(l.level, 'beginner') as lvl
    from public.lb_eligible() e left join public.lb_levels() l on l.user_id = e.user_id
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

-- Small summary for the card on the Progress tab: are you in, your rank this month (consistency), where you were yesterday, your level.
create or replace function public.leaderboard_summary()
returns table (opted_in boolean, eligible boolean, pos bigint, total bigint, prev_pos bigint, level text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare v_in boolean; v_elig boolean; v_pos bigint; v_total bigint; v_prev bigint; v_level text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select coalesce(s.leaderboard_opt_in, false) into v_in from public.settings s where s.user_id = auth.uid();
  v_in := coalesce(v_in, false);
  select exists (select 1 from public.lb_eligible() e where e.user_id = auth.uid()) into v_elig;
  select coalesce((select l.level from public.lb_levels() l where l.user_id = auth.uid()), 'beginner') into v_level;
  select count(*) into v_total from public.lb_scores('consistency', 'month', current_date) s join public.lb_eligible() e on e.user_id = s.user_id where s.score > 0;
  select r.rk into v_pos from (
    select s.user_id as uid, rank() over (order by s.score desc, s.detail desc) as rk
    from public.lb_scores('consistency', 'month', current_date) s join public.lb_eligible() e on e.user_id = s.user_id where s.score > 0
  ) r where r.uid = auth.uid();
  -- yesterday's rank, only when yesterday is still in the same month (otherwise there is nothing to compare with)
  if date_trunc('month', current_date - 1) = date_trunc('month', current_date) then
    select r.rk into v_prev from (
      select s.user_id as uid, rank() over (order by s.score desc, s.detail desc) as rk
      from public.lb_scores('consistency', 'month', current_date - 1) s join public.lb_eligible() e on e.user_id = s.user_id where s.score > 0
    ) r where r.uid = auth.uid();
  end if;
  return query select v_in, v_elig, v_pos, v_total, v_prev, v_level;
end;
$$;

-- Admin moderation: hide a name from the worldwide leaderboard (the student's practice history is not touched).
create or replace function public.admin_set_leaderboard_hidden(target_user_id uuid, hidden boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  insert into public.settings (user_id, leaderboard_hidden) values (target_user_id, hidden)
  on conflict (user_id) do update set leaderboard_hidden = excluded.leaderboard_hidden;
end;
$$;

-- 6) Permissions: the building blocks are not callable from the app at all; only the three public functions are, and only when signed in.
revoke all on function public.lb_exercise_profile(text), public.lb_valid_bpm(text, integer), public.lb_tier(text, integer), public.lb_tier_rank(text) from public, anon, authenticated;
revoke all on function public.lb_valid_sessions(), public.lb_unlocks(), public.lb_levels(), public.lb_eligible(), public.lb_scores(text, text, date) from public, anon, authenticated;
revoke all on function public.leaderboard(text, text, text, integer), public.leaderboard_summary(), public.admin_set_leaderboard_hidden(uuid, boolean) from public, anon;
grant execute on function public.leaderboard(text, text, text, integer) to authenticated;
grant execute on function public.leaderboard_summary() to authenticated;
grant execute on function public.admin_set_leaderboard_hidden(uuid, boolean) to authenticated;
