-- 2026-10-15: a tempo now unlocks with ONE non-stop session of 1 minute (players up to 14) or 2 minutes (everyone else), rated Comfortable or Mastered.
-- Short sessions are no longer added together. Tempos unlocked the old way before 15 October keep counting (sessions before that day still add up).
-- This only changes what the leaderboard counts as "newly unlocked tempos". Safe to run again.
-- Note: the leaderboard only knows whole minutes per session, so it can be a little more generous than the app (which counts exact seconds).
create or replace function public.lb_unlocks()
returns table (user_id uuid, exercise text, tempo integer, unlocked_on date, tier text)
language sql stable security definer set search_path = public as $$
  with src as (
    select v.user_id as uid, v.exercise as ex, v.tempo as t, v.practiced_on as d, v.minutes as m,
      case when public.age_band_on(dd.date_of_birth, current_date) in ('under_10', '10_13') then 1 else 2 end as need
    from public.lb_valid_sessions() v
    left join public.profile_private dd on dd.user_id = v.user_id
    where v.rating in ('comfortable', 'mastered')
  ), single as (
    select s.uid, s.ex, s.t, min(s.d) as d from src s where s.m >= s.need group by s.uid, s.ex, s.t
  ), legacy_run as (
    select s.uid, s.ex, s.t, s.d, s.need,
      sum(s.m) over (partition by s.uid, s.ex, s.t order by s.d) as running
    from src s where s.d < date '2026-10-15'
  ), legacy as (
    select r.uid, r.ex, r.t, min(r.d) as d from legacy_run r where r.running >= r.need group by r.uid, r.ex, r.t
  ), firsts as (
    select u.uid, u.ex, u.t, min(u.d) as d
    from (select * from single union all select * from legacy) u
    group by u.uid, u.ex, u.t
  )
  select f.uid, f.ex, f.t, f.d, public.lb_tier(public.lb_exercise_profile(f.ex), f.t) from firsts f
$$;
revoke all on function public.lb_unlocks() from public, anon, authenticated;
