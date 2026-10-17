-- 2026-10-17: RENAME A GROUP. The person who made the group, or an admin, can change its name (max 30 characters). Safe to re-run.
create or replace function public.rename_group(target_group_id uuid, new_name text) returns void
language plpgsql security definer set search_path = public as $$
declare v_name text := left(trim(coalesce(new_name, '')), 30);
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if length(v_name) = 0 then raise exception 'The name cannot be empty'; end if;
  if not exists (select 1 from public.groups g where g.id = target_group_id and (g.created_by = auth.uid() or public.is_admin())) then raise exception 'Not allowed'; end if;
  update public.groups set name = v_name where id = target_group_id;
end;
$$;
revoke execute on function public.rename_group(uuid, text) from public, anon;
grant execute on function public.rename_group(uuid, text) to authenticated;
