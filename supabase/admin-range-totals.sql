-- 2026-10-16: the Admin page no longer downloads every practice log of every user. It asks for the totals of a date range, worked out here.
-- Safe to run again. Only an admin can call it.
create or replace function public.admin_range_totals(p_from date, p_to date default null)
returns table (user_id uuid, total_minutes bigint, total_logs bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  return query
    select l.user_id, coalesce(sum(l.minutes), 0)::bigint, count(*)::bigint
    from public.practice_logs l
    where l.practiced_on >= p_from and (p_to is null or l.practiced_on < p_to)
    group by l.user_id;
end;
$$;
revoke all on function public.admin_range_totals(date, date) from public, anon;
grant execute on function public.admin_range_totals(date, date) to authenticated;
