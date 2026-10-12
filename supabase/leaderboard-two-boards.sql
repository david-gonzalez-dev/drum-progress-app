-- 2026-10-12: TWO LEADERBOARDS (kids under 14, adults 14+). Board comes from the age category, not from the library setting.
-- Kids only ever see kids, adults only see adults. Accounts with no age category set can't join until they set one.
drop function if exists public.leaderboard_summary();
drop function if exists public.lb_eligible();

create or replace function public.lb_eligible()
returns table (user_id uuid, display_name text, board text)
language sql stable security definer set search_path = public as $$
  select s.user_id,
    case when s.age_group in ('under_10', '10_13') then left(split_part(trim(p.name), ' ', 1), 30)
         else left(regexp_replace(trim(p.name), '^(\S+)\s+.*?(\S)\S*$', '\1 \2.'), 30) end,
    case when s.age_group in ('under_10', '10_13') then 'kids' else 'adults' end
  from public.settings s join public.profiles p on p.id = s.user_id
  where s.leaderboard_opt_in and not s.leaderboard_hidden and s.age_group is not null and length(trim(coalesce(p.name, ''))) > 0
$$;

create or replace function public.leaderboard(p_category text, p_period text, p_level text default 'all', p_limit integer default 20)
returns table (pos bigint, display_name text, score numeric, detail integer, level text, is_me boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50); v_board text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not coalesce((select s.leaderboard_opt_in from public.settings s where s.user_id = auth.uid()), false) then raise exception 'Join the leaderboard first'; end if;
  select case when s.age_group in ('under_10', '10_13') then 'kids' when s.age_group = '14_plus' then 'adults' end into v_board from public.settings s where s.user_id = auth.uid();
  if v_board is null then raise exception 'Set your age first'; end if;
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
  select coalesce(s.leaderboard_opt_in, false), case when s.age_group in ('under_10', '10_13') then 'kids' when s.age_group = '14_plus' then 'adults' end
    into v_in, v_board from public.settings s where s.user_id = auth.uid();
  v_in := coalesce(v_in, false);
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

revoke all on function public.lb_eligible() from public, anon, authenticated;
revoke all on function public.leaderboard(text, text, text, integer), public.leaderboard_summary() from public, anon;
grant execute on function public.leaderboard(text, text, text, integer) to authenticated;
grant execute on function public.leaderboard_summary() to authenticated;
