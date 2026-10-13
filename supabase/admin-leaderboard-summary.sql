-- 2026-10-14: admin can see a student's leaderboard standing (shown on the student's page; read-only)
create or replace function public.admin_leaderboard_summary(target_user_id uuid)
returns table (opted_in boolean, hidden boolean, pos bigint, total bigint, level text, board text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare v_in boolean; v_hidden boolean; v_pos bigint; v_total bigint; v_level text; v_board text;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  select coalesce(s.leaderboard_opt_in, false), coalesce(s.leaderboard_hidden, false) into v_in, v_hidden from public.settings s where s.user_id = target_user_id;
  v_in := coalesce(v_in, false);
  v_hidden := coalesce(v_hidden, false);
  v_board := public.lb_board_of(target_user_id);
  select coalesce((select l.level from public.lb_levels() l where l.user_id = target_user_id), 'beginner') into v_level;
  if v_board is not null then
    select count(*) into v_total from public.lb_scores('consistency', 'month', current_date) s join public.lb_eligible() e on e.user_id = s.user_id where s.score > 0 and e.board = v_board;
    select r.rk into v_pos from (
      select s.user_id as uid, rank() over (order by s.score desc, s.detail desc) as rk
      from public.lb_scores('consistency', 'month', current_date) s join public.lb_eligible() e on e.user_id = s.user_id where s.score > 0 and e.board = v_board
    ) r where r.uid = target_user_id;
  end if;
  return query select v_in, v_hidden, v_pos, v_total, v_level, v_board;
end;
$$;
revoke all on function public.admin_leaderboard_summary(uuid) from public, anon;
grant execute on function public.admin_leaderboard_summary(uuid) to authenticated;
