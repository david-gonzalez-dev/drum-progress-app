-- =====================================================================================================
-- 2026-10-14: DRUM POINTS. Players up to 16 can opt in (the app asks once). Every full minute of a Skill Trainer tempo
-- session earns 1 point (max 60 a day). Yearly and all-time boards, only against players of the same age group who also
-- opted in; first names only. Adults never see the point boards. Points are added by the server, never by the phone.
-- Safe to re-run.
-- =====================================================================================================

-- 1) New columns: whether the player was asked, and the exact seconds of a Skill Trainer session.
alter table public.settings add column if not exists points_prompted boolean not null default false;
alter table public.practice_sessions add column if not exists duration_seconds integer check (duration_seconds is null or duration_seconds between 0 and 43200);

-- 2) "Up to 16" lives in this one function (age under 17, exact to the birthday). Internal helper: the app cannot call it.
create or replace function public.drum_points_eligible(uid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select date_part('year', age(current_date, d.date_of_birth)) < 17 from public.profile_private d where d.user_id = uid), false)
$$;
revoke execute on function public.drum_points_eligible(uuid) from public, anon, authenticated;

-- 3) What the app asks: may I show Drum Points to this player, did they switch it on, were they asked yet.
create or replace function public.drum_points_state() returns table (eligible boolean, enabled boolean, prompted boolean)
language sql stable security definer set search_path = public as $$
  select public.drum_points_eligible(auth.uid()),
         coalesce((select s.points_enabled from public.settings s where s.user_id = auth.uid()), false),
         coalesce((select s.points_prompted from public.settings s where s.user_id = auth.uid()), false)
$$;
revoke execute on function public.drum_points_state() from public, anon;
grant execute on function public.drum_points_state() to authenticated;

-- 4) Switching Drum Points on or off yourself. Only players up to 16 may switch it on.
create or replace function public.set_my_drum_points(p_on boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_on and not public.drum_points_eligible(auth.uid()) then raise exception 'Drum Points are for players up to 16'; end if;
  insert into public.settings (user_id, points_enabled, points_prompted) values (auth.uid(), p_on, true)
  on conflict (user_id) do update set points_enabled = excluded.points_enabled, points_prompted = true;
end;
$$;
revoke execute on function public.set_my_drum_points(boolean) from public, anon;
grant execute on function public.set_my_drum_points(boolean) to authenticated;

-- 5) The automatic award: 1 point per full minute of a new Skill Trainer session, at most 60 points a day.
create or replace function public.award_drum_points() returns trigger language plpgsql security definer set search_path = public as $$
declare v_pts integer; v_today integer;
begin
  if new.duration_seconds is null or new.duration_seconds < 60 then return new; end if;
  if not coalesce((select s.points_enabled from public.settings s where s.user_id = new.user_id), false) then return new; end if;
  if not public.drum_points_eligible(new.user_id) then return new; end if;
  select coalesce(sum(a.amount), 0) into v_today from public.point_awards a
    where a.user_id = new.user_id and a.awarded_by = new.user_id and a.reason like 'Practice%' and a.created_at >= date_trunc('day', now());
  v_pts := least(new.duration_seconds / 60, 60 - v_today);
  if v_pts <= 0 then return new; end if;
  insert into public.point_awards (user_id, awarded_by, amount, reason) values (new.user_id, new.user_id, v_pts, 'Practice: ' || v_pts || ' min');
  return new;
end;
$$;
revoke execute on function public.award_drum_points() from public, anon, authenticated;
drop trigger if exists award_drum_points on public.practice_sessions;
create trigger award_drum_points after insert on public.practice_sessions for each row execute function public.award_drum_points();

-- 6) The board: p_period is 'year' or 'all'. Same age group only, opted in only, first names only. Adults get nothing.
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

-- 7) For the pop-up after practice (p_period: 'year', 'all' or 'week'; the week starts on Monday): my points, my place, and the player just above me with the points needed to pass them.
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

-- 8) The old all-time list (older app versions still call it): same rules now, so adults get nothing and kids only see their own age group.
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
  group by p.id, p.name order by coalesce(sum(pa.amount), 0) desc, p.name asc;
end;
$$;
revoke execute on function public.points_leaderboard() from anon, public;
grant execute on function public.points_leaderboard() to authenticated;
