-- 2026-10-16: the creator of a group can remove a member from it (the member can always leave by themselves).
-- Safe to run again.
create or replace function public.remove_group_member(p_group_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not (exists (select 1 from public.groups g where g.id = p_group_id and g.created_by = auth.uid()) or public.is_admin()) then
    raise exception 'Only the creator of the group can remove members';
  end if;
  if p_user_id = auth.uid() then raise exception 'Use Leave group to leave a group yourself'; end if;
  delete from public.group_members where group_id = p_group_id and user_id = p_user_id;
end;
$$;
revoke all on function public.remove_group_member(uuid, uuid) from public, anon;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
