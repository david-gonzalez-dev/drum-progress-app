-- 2026-10-14: PUSH NOTIFICATIONS for cheers. Each phone that turned notifications on has one row here (its push address).
-- Safe to re-run. Only the person's own rows are visible to them; the sending function uses the service key.
create table if not exists public.push_tokens (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('ios', 'android')),
  tz text not null default 'Europe/Amsterdam',
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;
drop policy if exists "own push tokens" on public.push_tokens;
create policy "own push tokens" on public.push_tokens for select to authenticated using (user_id = auth.uid());
grant select on public.push_tokens to authenticated;
grant select, insert, update, delete on public.push_tokens to service_role;

-- The app registers / removes this phone through these two functions (a phone that changes owner moves to the new person).
create or replace function public.register_push_token(p_token text, p_platform text, p_tz text default 'Europe/Amsterdam') returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_platform not in ('ios', 'android') or length(coalesce(p_token, '')) < 20 then raise exception 'Invalid push address'; end if;
  insert into public.push_tokens (user_id, token, platform, tz) values (auth.uid(), p_token, p_platform, left(coalesce(p_tz, 'Europe/Amsterdam'), 64))
  on conflict (token) do update set user_id = auth.uid(), platform = excluded.platform, tz = excluded.tz, last_seen = now();
end;
$$;
create or replace function public.unregister_push_token(p_token text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  delete from public.push_tokens where token = p_token and user_id = auth.uid();
end;
$$;
revoke all on function public.register_push_token(text, text, text), public.unregister_push_token(text) from public, anon;
grant execute on function public.register_push_token(text, text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;
