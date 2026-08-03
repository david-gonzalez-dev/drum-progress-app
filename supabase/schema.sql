-- Run in the Supabase SQL editor. Every table is ready for Row Level Security policies.
create extension if not exists "uuid-ossp";

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '', avatar_url text, created_at timestamptz not null default now()
);
create table public.settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  language text not null default 'en' check (language in ('en','es')),
  daily_goal_minutes integer not null default 30, reminder_enabled boolean not null default false,
  reminder_time time, theme text not null default 'dark', updated_at timestamptz not null default now()
);
create table public.practice_items (
  id uuid primary key default uuid_generate_v4(), slug text unique not null, name_en text not null, name_es text not null, sort_order integer not null default 0
);
create table public.practice_logs (
  id uuid primary key default uuid_generate_v4(), user_id uuid not null references public.profiles(id) on delete cascade,
  practiced_on date not null, minutes integer not null check (minutes >= 0), notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id, practiced_on)
);
create table public.practice_log_items (
  log_id uuid references public.practice_logs(id) on delete cascade, item_id uuid references public.practice_items(id) on delete cascade, primary key(log_id, item_id)
);
create table public.groups (id uuid primary key default uuid_generate_v4(), name text not null, invite_code text unique not null, created_by uuid not null references public.profiles(id), created_at timestamptz not null default now());
create table public.group_members (group_id uuid references public.groups(id) on delete cascade, user_id uuid references public.profiles(id) on delete cascade, role text not null default 'member' check (role in ('owner','member')), joined_at timestamptz not null default now(), primary key(group_id, user_id));
create table public.challenges (id uuid primary key default uuid_generate_v4(), group_id uuid not null references public.groups(id) on delete cascade, created_by uuid not null references public.profiles(id), name text not null, goal_type text not null check (goal_type in ('daily','minutes','sessions')), goal_value integer not null, start_date date not null, end_date date not null, reward text, punishment text, created_at timestamptz not null default now());
create table public.challenge_members (challenge_id uuid references public.challenges(id) on delete cascade, user_id uuid references public.profiles(id) on delete cascade, joined_at timestamptz not null default now(), primary key(challenge_id, user_id));

alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.practice_logs enable row level security;
alter table public.practice_log_items enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_members enable row level security;

insert into public.practice_items (slug, name_en, name_es, sort_order) values
('rudiments','Rudiments','Rudimentos',1),('single-strokes','Single Strokes','Golpes simples',2),('double-strokes','Double Strokes','Golpes dobles',3),('paradiddles','Paradiddles','Paradiddles',4),('stick-control','Stick Control','Control de baquetas',5),('coordination','Coordination','Coordinación',6),('bass-drum','Bass Drum','Bombo',7),('rhythms','Rhythms','Ritmos',8),('permutations','Permutations','Permutaciones',9);

-- Run this policy block after the schema. Safe to re-run: each policy is dropped first if it already exists.
drop policy if exists "profiles are visible to signed-in users" on public.profiles;
create policy "profiles are visible to signed-in users" on public.profiles for select to authenticated using (true);
drop policy if exists "users can create their profile" on public.profiles;
create policy "users can create their profile" on public.profiles for insert to authenticated with check (auth.uid() = id);
drop policy if exists "users can update their profile" on public.profiles;
create policy "users can update their profile" on public.profiles for update to authenticated using (auth.uid() = id);
drop policy if exists "users manage their settings" on public.settings;
create policy "users manage their settings" on public.settings for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "users manage their practice logs" on public.practice_logs;
create policy "users manage their practice logs" on public.practice_logs for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "users manage their practice log items" on public.practice_log_items;
create policy "users manage their practice log items" on public.practice_log_items for all to authenticated using (exists (select 1 from public.practice_logs l where l.id = log_id and l.user_id = auth.uid())) with check (exists (select 1 from public.practice_logs l where l.id = log_id and l.user_id = auth.uid()));
drop policy if exists "anyone signed in reads practice items" on public.practice_items;
create policy "anyone signed in reads practice items" on public.practice_items for select to authenticated using (true);

-- Groups: any signed-in user can look up a group (needed to join by invite code before membership exists).
drop policy if exists "signed-in users can view groups" on public.groups;
create policy "signed-in users can view groups" on public.groups for select to authenticated using (true);
drop policy if exists "signed-in users can create groups" on public.groups;
create policy "signed-in users can create groups" on public.groups for insert to authenticated with check (auth.uid() = created_by);
-- security definer bypasses RLS internally, avoiding "infinite recursion detected in policy for relation group_members"
-- (a policy on group_members can't query group_members directly without triggering itself).
create or replace function public.is_group_member(target_group_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as 'select exists (select 1 from public.group_members where group_id = target_group_id and user_id = auth.uid());';

drop policy if exists "members can view their group's membership" on public.group_members;
create policy "members can view their group's membership" on public.group_members for select to authenticated using (
  public.is_group_member(group_id)
);
drop policy if exists "signed-in users can join groups" on public.group_members;
create policy "signed-in users can join groups" on public.group_members for insert to authenticated with check (auth.uid() = user_id);

-- Challenges: visible and manageable by members of the owning group.
drop policy if exists "group members can view challenges" on public.challenges;
create policy "group members can view challenges" on public.challenges for select to authenticated using (
  exists (select 1 from public.group_members m where m.group_id = challenges.group_id and m.user_id = auth.uid())
);
drop policy if exists "group members can create challenges" on public.challenges;
create policy "group members can create challenges" on public.challenges for insert to authenticated with check (
  auth.uid() = created_by and exists (select 1 from public.group_members m where m.group_id = challenges.group_id and m.user_id = auth.uid())
);
drop policy if exists "group members can view challenge participants" on public.challenge_members;
create policy "group members can view challenge participants" on public.challenge_members for select to authenticated using (
  exists (
    select 1 from public.challenges c
    join public.group_members m on m.group_id = c.group_id
    where c.id = challenge_id and m.user_id = auth.uid()
  )
);
drop policy if exists "signed-in users can join challenges" on public.challenge_members;
create policy "signed-in users can join challenges" on public.challenge_members for insert to authenticated with check (auth.uid() = user_id);

-- Group progress view: lets group members see each other's practice logs (read-only), so the group calendar/leaderboard can show everyone's activity.
-- This does not change who can create/edit/delete a log -- the existing "users manage their practice logs" policy still restricts writes to the log's own owner.
drop policy if exists "group members can view each other's practice logs" on public.practice_logs;
create policy "group members can view each other's practice logs" on public.practice_logs for select to authenticated using (
  exists (
    select 1 from public.group_members gm1
    join public.group_members gm2 on gm1.group_id = gm2.group_id
    where gm1.user_id = practice_logs.user_id and gm2.user_id = auth.uid()
  )
);

-- Leaving a group and deleting a challenge had no policy at all, so both would silently fail with "no rows affected".
drop policy if exists "users can leave groups" on public.group_members;
create policy "users can leave groups" on public.group_members for delete to authenticated using (auth.uid() = user_id);
drop policy if exists "creator can delete their challenge" on public.challenges;
create policy "creator can delete their challenge" on public.challenges for delete to authenticated using (auth.uid() = created_by);

-- Lets each person pick their own dot color for the group calendar.
alter table public.profiles add column if not exists color text not null default '#ff6b1a';

-- Tracks whether a session was on a drumset or a practice pad, for separate monthly metrics later.
alter table public.practice_logs add column if not exists equipment text check (equipment in ('drumset', 'pad'));

-- Practice Mode: one row per timed session against a specific exercise + BPM, rated by the user.
create table if not exists public.practice_sessions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  practice_item_id uuid references public.practice_items(id),
  bpm integer not null check (bpm between 40 and 240),
  rating text not null check (rating in ('not_ready', 'tense', 'comfortable', 'mastered')),
  duration_minutes integer not null check (duration_minutes >= 0),
  practiced_on date not null default current_date,
  created_at timestamptz not null default now()
);
alter table public.practice_sessions enable row level security;
drop policy if exists "users manage their practice sessions" on public.practice_sessions;
create policy "users manage their practice sessions" on public.practice_sessions for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Practice Mode's own categorized exercise catalog (Rudiments / Exercises / Rhythms), separate from
-- the flat list used for daily "what did you practice" logging.
create table if not exists public.practice_exercises (
  id uuid primary key default uuid_generate_v4(),
  category text not null check (category in ('rudiments', 'exercises', 'rhythms')),
  subcategory text,
  name_en text not null,
  name_es text not null,
  sort_order integer not null default 0,
  unique (category, name_en)
);
alter table public.practice_exercises enable row level security;
drop policy if exists "anyone signed in reads practice exercises" on public.practice_exercises;
create policy "anyone signed in reads practice exercises" on public.practice_exercises for select to authenticated using (true);

insert into public.practice_exercises (category, subcategory, name_en, name_es, sort_order) values
  ('rudiments', null, 'Single Strokes', 'Golpes simples', 1),
  ('rudiments', null, 'Double Strokes', 'Golpes dobles', 2),
  ('rudiments', null, 'Single Paradiddle', 'Paradiddle simple', 3),
  ('rudiments', null, 'Double Paradiddle', 'Paradiddle doble', 4),
  ('rudiments', null, 'Triple Paradiddle', 'Paradiddle triple', 5),
  ('rudiments', null, 'Paradiddle-Diddle', 'Paradiddle-diddle', 6),
  ('rudiments', null, 'Flam', 'Flam', 7),
  ('rudiments', null, 'Flam Accent', 'Flam acentuado', 8),
  ('rudiments', null, 'Flam Tap', 'Flam tap', 9),
  ('rudiments', null, 'Drag', 'Drag', 10),
  ('rudiments', null, 'Double Drag', 'Drag doble', 11),
  ('rudiments', null, 'Ratamacue', 'Ratamacue', 12),
  ('exercises', 'Bass Drum', 'Heel Down', 'Talón abajo', 1),
  ('exercises', 'Bass Drum', 'Heel Up', 'Talón arriba', 2),
  ('exercises', 'Bass Drum', 'Slide Technique', 'Técnica de deslizamiento', 3),
  ('exercises', 'Bass Drum', 'Double Bass Drum', 'Doble bombo', 4),
  ('exercises', null, 'Flow', 'Flow', 5),
  ('exercises', 'Permutations', 'RLKK', 'RLKK', 6),
  ('exercises', 'Permutations', 'RKKL', 'RKKL', 7),
  ('exercises', 'Permutations', 'KKRL', 'KKRL', 8),
  ('exercises', 'Permutations', 'KRLK', 'KRLK', 9),
  ('exercises', 'Permutations', 'RLLK', 'RLLK', 10)
on conflict (category, name_en) do nothing;

-- practice_sessions now points at the new catalog instead of the old flat practice_items table.
alter table public.practice_sessions add column if not exists practice_exercise_id uuid references public.practice_exercises(id);
alter table public.practice_sessions drop column if exists practice_item_id;

-- Group calendar color: was defaulting every profile to the same orange, making the dots useless.
-- Now null means "no color picked yet" so the app can auto-assign one instead of everyone matching.
alter table public.profiles alter column color drop default;
alter table public.profiles alter column color drop not null;
update public.profiles set color = null where color = '#ff6b1a';

-- Progress tab: lets a user pin a Practice Mode exercise as a current focus, shown with its tier progress.
create table if not exists public.pinned_exercises (
  user_id uuid not null references public.profiles(id) on delete cascade,
  exercise_en text not null,
  pinned_at timestamptz not null default now(),
  primary key (user_id, exercise_en)
);
alter table public.pinned_exercises enable row level security;
drop policy if exists "users manage their pinned exercises" on public.pinned_exercises;
create policy "users manage their pinned exercises" on public.pinned_exercises for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Equipment can now also be "both" (drumset + practice pad in the same day).
-- Drops any existing check constraint on this column (whatever it's actually named) before adding the widened one.
do $$
declare
  r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_attribute att on att.attrelid = rel.oid and att.attnum = any(con.conkey)
    where rel.relname = 'practice_logs' and att.attname = 'equipment' and con.contype = 'c'
  loop
    execute format('alter table public.practice_logs drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.practice_logs add constraint practice_logs_equipment_check check (equipment in ('drumset', 'pad', 'both'));

-- Lets the group's creator delete it entirely. group_members, challenges and challenge_members all
-- reference groups with "on delete cascade", so deleting a group cleans those up automatically.
drop policy if exists "creator can delete their group" on public.groups;
create policy "creator can delete their group" on public.groups for delete to authenticated using (auth.uid() = created_by);

-- The row-level security policies on group_members/challenges/challenge_members only let each person
-- delete their OWN rows, which blocks the cascade above from removing other members' rows when a
-- group is deleted. This function runs with elevated privileges (like is_group_member) to do the
-- whole deletion in one step, after checking the caller is actually the group's creator.
create or replace function public.delete_group_as_creator(target_group_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.groups where id = target_group_id and created_by = auth.uid();
  get diagnostics deleted_count = row_count;
  return deleted_count > 0;
end;
$$;
grant execute on function public.delete_group_as_creator(uuid) to authenticated;

-- The delete_group_as_creator() function above turned out to be unreliable in practice (Supabase's
-- API layer kept serving a stale "function not found" error even after a manual schema reload and a
-- full project restart). Switching to a simpler, more reliable fix instead: widen the delete policies
-- on the tables a group-delete cascades into, so the app's plain "delete from groups" works directly.
-- These are additive (OR'd with the existing narrower policies), so nothing already working changes.
drop policy if exists "creator can remove any member when deleting their group" on public.group_members;
create policy "creator can remove any member when deleting their group" on public.group_members for delete to authenticated using (
  exists (select 1 from public.groups g where g.id = group_members.group_id and g.created_by = auth.uid())
);
drop policy if exists "creator can delete any challenge when deleting their group" on public.challenges;
create policy "creator can delete any challenge when deleting their group" on public.challenges for delete to authenticated using (
  exists (select 1 from public.groups g where g.id = challenges.group_id and g.created_by = auth.uid())
);
drop policy if exists "creator can remove challenge participants when deleting their group" on public.challenge_members;
create policy "creator can remove challenge participants when deleting their group" on public.challenge_members for delete to authenticated using (
  exists (
    select 1 from public.challenges c
    join public.groups g on g.id = c.group_id
    where c.id = challenge_members.challenge_id and g.created_by = auth.uid()
  )
);
