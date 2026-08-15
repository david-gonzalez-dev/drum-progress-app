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

-- Optional per-equipment minute split for a day (e.g. 20 min drumset + 10 min pad). Null means
-- "not split" -- the day's single `minutes`/`equipment` fields stay the source of truth for totals.
alter table public.practice_logs add column if not exists drumset_minutes integer check (drumset_minutes is null or drumset_minutes >= 0);
alter table public.practice_logs add column if not exists pad_minutes integer check (pad_minutes is null or pad_minutes >= 0);

-- Lets each user pick which synthesized click sound the metronome uses.
alter table public.settings add column if not exists metronome_tone text not null default 'click' check (metronome_tone in ('click', 'beep', 'wood', 'clave'));

-- Leftover seconds under a minute, e.g. from a short metronome "Add time" session (0 min 5 sec).
-- `minutes` stays the whole-minute total everything else (goals, streaks, leaderboards) reads.
alter table public.practice_logs add column if not exists seconds integer not null default 0 check (seconds >= 0 and seconds < 60);

-- Freeform "Other" items typed into the metronome's Add-Time prompt. Kept separate from the shared
-- practice_items catalog (no client insert policy there) so they render as pills without needing a
-- new item added to that global list for every user.
alter table public.practice_logs add column if not exists custom_items text[] not null default '{}';

-- Lets a user hide the "days this year / 365" stat on their Home dashboard if they don't want it.
alter table public.settings add column if not exists show_days_this_year boolean not null default true;

-- Personal Challenges: a self-set structured practice goal (exercise + minutes/day, optional BPM,
-- consecutive days). exercise_en is a plain string (matching pinned_exercises' pattern) rather than a
-- foreign key, since it can point at either the practice_exercises catalog or the flat quick-log items.
create table if not exists public.personal_challenges (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  exercise_en text not null,
  target_minutes integer not null check (target_minutes > 0),
  target_bpm integer check (target_bpm is null or target_bpm > 0),
  frequency text not null default 'daily' check (frequency in ('daily')),
  length_days integer not null check (length_days > 0 and length_days <= 90),
  start_date date not null,
  created_at timestamptz not null default now()
);
alter table public.personal_challenges enable row level security;
drop policy if exists "users manage their personal challenges" on public.personal_challenges;
create policy "users manage their personal challenges" on public.personal_challenges for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Personal Challenges must be able to tell a same-day log entry from one backdated/edited later, so a
-- missed challenge day can't be "repaired" after the fact. updated_at never actually changed on edit
-- before now (Postgres only applies `default now()` at insert time), so add a trigger to keep it honest.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists practice_logs_touch_updated_at on public.practice_logs;
create trigger practice_logs_touch_updated_at
before update on public.practice_logs
for each row execute function public.touch_updated_at();

-- Renamed 4 exercises in the app's PRACTICE_EXERCISES list to note the note value they're practiced
-- at (e.g. "Heel Down" -> "Heel Down, 8th Notes"), and added 3 new ones. practice_sessions links to
-- practice_exercises by id, so renaming the catalog row (not practice_sessions) is what keeps past
-- sessions attached to the renamed exercise. pinned_exercises/personal_challenges store the name as
-- plain text, so those need their own update to stay matched.
update public.practice_exercises set name_en = 'Heel Down, 8th Notes', name_es = 'Talón abajo, corcheas' where name_en = 'Heel Down';
update public.practice_exercises set name_en = 'Heel Up, 8th Notes', name_es = 'Talón arriba, corcheas' where name_en = 'Heel Up';
update public.practice_exercises set name_en = 'Slide Technique, 8th Notes', name_es = 'Técnica de deslizamiento, corcheas' where name_en = 'Slide Technique';
update public.practice_exercises set name_en = 'Flow, 16th Notes', name_es = 'Flow, semicorcheas' where name_en = 'Flow';
insert into public.practice_exercises (category, subcategory, name_en, name_es, sort_order) values
  ('exercises', null, 'Finger Technique (Single-Handed)', 'Técnica de dedos (una mano)', 11),
  ('exercises', null, '16th Note Single Strokes Around the Set', 'Golpes simples en semicorcheas alrededor de la batería', 12),
  ('exercises', null, 'Hi-Hat Pedal 8th Notes', 'Pedal de hi-hat en corcheas', 13)
on conflict (category, name_en) do nothing;
update public.pinned_exercises set exercise_en = 'Heel Down, 8th Notes' where exercise_en = 'Heel Down';
update public.pinned_exercises set exercise_en = 'Heel Up, 8th Notes' where exercise_en = 'Heel Up';
update public.pinned_exercises set exercise_en = 'Slide Technique, 8th Notes' where exercise_en = 'Slide Technique';
update public.pinned_exercises set exercise_en = 'Flow, 16th Notes' where exercise_en = 'Flow';
update public.personal_challenges set exercise_en = 'Heel Down, 8th Notes' where exercise_en = 'Heel Down';
update public.personal_challenges set exercise_en = 'Heel Up, 8th Notes' where exercise_en = 'Heel Up';
update public.personal_challenges set exercise_en = 'Slide Technique, 8th Notes' where exercise_en = 'Slide Technique';
update public.personal_challenges set exercise_en = 'Flow, 16th Notes' where exercise_en = 'Flow';

-- Filled out the rudiments catalog with the rest of the standard 40 PAS rudiments, plus two new
-- Push Pull exercises.
insert into public.practice_exercises (category, subcategory, name_en, name_es, sort_order) values
  ('rudiments', null, 'Single Strokes Four', 'Golpes Simples Cuatro', 13),
  ('rudiments', null, 'Single Strokes Seven', 'Golpes Simples Siete', 14),
  ('rudiments', null, '5 Stroke Roll', 'Redoble de 5 Golpes', 15),
  ('rudiments', null, '6 Stroke Roll', 'Redoble de 6 Golpes', 16),
  ('rudiments', null, '7 Stroke Roll', 'Redoble de 7 Golpes', 17),
  ('rudiments', null, '9 Stroke Roll', 'Redoble de 9 Golpes', 18),
  ('rudiments', null, '10 Stroke Roll', 'Redoble de 10 Golpes', 19),
  ('rudiments', null, '11 Stroke Roll', 'Redoble de 11 Golpes', 20),
  ('rudiments', null, '13 Stroke Roll', 'Redoble de 13 Golpes', 21),
  ('rudiments', null, '15 Stroke Roll', 'Redoble de 15 Golpes', 22),
  ('rudiments', null, '17 Stroke Roll', 'Redoble de 17 Golpes', 23),
  ('rudiments', null, 'Lesson 25', 'Lección 25', 24),
  ('rudiments', null, 'Single Drag Tap', 'Drag Tap Simple', 25),
  ('rudiments', null, 'Single Dragadiddle', 'Dragadiddle Simple', 26),
  ('rudiments', null, 'Drag Paradiddle #1', 'Drag Paradiddle #1', 27),
  ('rudiments', null, 'Drag Paradiddle #2', 'Drag Paradiddle #2', 28),
  ('rudiments', null, 'Flammed Mill', 'Flammed Mill', 29),
  ('rudiments', null, 'Swiss Army Triplet', 'Swiss Army Triplet', 30),
  ('rudiments', null, 'Flamacue', 'Flamacue', 31),
  ('rudiments', null, 'Triple Stroke Roll', 'Redoble Triple', 32),
  ('rudiments', null, 'Flam Paradiddle', 'Flam Paradiddle', 33),
  ('rudiments', null, 'Patafla-fla', 'Patafla-fla', 34),
  ('rudiments', null, 'Double Drag Tap', 'Drag Tap Doble', 35),
  ('rudiments', null, 'Flam Paradiddle-diddle', 'Flam Paradiddle-diddle', 36),
  ('rudiments', null, 'Single Ratamacue', 'Ratamacue Simple', 37),
  ('rudiments', null, 'Double Ratamacue', 'Ratamacue Doble', 38),
  ('rudiments', null, 'Triple Ratamacue', 'Ratamacue Triple', 39),
  ('rudiments', null, 'Inverted Flam Tap', 'Flam Tap Invertido', 40),
  ('rudiments', null, 'Flam Drag', 'Flam Drag', 41),
  ('exercises', null, 'Push Pull - Right Hand', 'Push Pull - Mano Derecha', 14),
  ('exercises', null, 'Push Pull - Left Hand', 'Push Pull - Mano Izquierda', 15)
on conflict (category, name_en) do nothing;

-- Low-key group chat, capped to the most recent 50 messages per group so storage stays flat no
-- matter how much a group chats over time (older messages are auto-deleted after each insert).
create table if not exists public.group_messages (
  id uuid primary key default uuid_generate_v4(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (char_length(message) > 0 and char_length(message) <= 500),
  created_at timestamptz not null default now()
);
alter table public.group_messages enable row level security;
drop policy if exists "group members read messages" on public.group_messages;
create policy "group members read messages" on public.group_messages for select to authenticated using (
  exists (select 1 from public.group_members gm where gm.group_id = group_messages.group_id and gm.user_id = auth.uid())
);
drop policy if exists "group members send messages" on public.group_messages;
create policy "group members send messages" on public.group_messages for insert to authenticated with check (
  auth.uid() = user_id and exists (select 1 from public.group_members gm where gm.group_id = group_messages.group_id and gm.user_id = auth.uid())
);

-- security definer so the cleanup delete isn't blocked by RLS (it may need to delete messages sent
-- by other members of the group, not just the message that was just inserted).
create or replace function public.cap_group_messages()
returns trigger
language plpgsql
security definer
as $$
begin
  delete from public.group_messages
  where group_id = new.group_id
    and id not in (
      select id from public.group_messages
      where group_id = new.group_id
      order by created_at desc
      limit 50
    );
  return new;
end;
$$;
drop trigger if exists group_messages_cap on public.group_messages;
create trigger group_messages_cap
after insert on public.group_messages
for each row execute function public.cap_group_messages();

-- Optional context captured on the post-session rating prompt: a free-text note and/or tags for
-- common technique issues (wrist tension, lost stick control, etc.), so a session can record more
-- than just its BPM/rating.
alter table public.practice_sessions add column if not exists notes text;
alter table public.practice_sessions add column if not exists issues text[] not null default '{}';
