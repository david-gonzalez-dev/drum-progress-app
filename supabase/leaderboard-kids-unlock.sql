-- 2026-10-12: a tempo unlocks after 1 comfortable minute for the kids age categories (under 10, 10-13), 2 minutes otherwise.
create or replace function public.lb_unlocks()
returns table (user_id uuid, exercise text, tempo integer, unlocked_on date, tier text)
language sql stable security definer set search_path = public as $$
  with q as (
    select v.user_id as uid, v.exercise as ex, v.tempo as t, v.practiced_on as d,
      sum(v.minutes) over (partition by v.user_id, v.exercise, v.tempo order by v.practiced_on) as running
    from public.lb_valid_sessions() v where v.rating in ('comfortable', 'mastered')
  ), firsts as (
    select distinct on (q.uid, q.ex, q.t) q.uid, q.ex, q.t, q.d
    from q left join public.settings st on st.user_id = q.uid
    where q.running >= case when st.age_group in ('under_10', '10_13') then 1 else 2 end
    order by q.uid, q.ex, q.t, q.d
  )
  select f.uid, f.ex, f.t, f.d, public.lb_tier(public.lb_exercise_profile(f.ex), f.t) from firsts f
$$;
