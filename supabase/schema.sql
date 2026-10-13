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

-- Added the "almost" rating (between tense and comfortable) to the app, but the original check
-- constraint on practice_sessions.rating still only allowed the original 4 values.
alter table public.practice_sessions drop constraint if exists practice_sessions_rating_check;
alter table public.practice_sessions add constraint practice_sessions_rating_check check (rating in ('not_ready', 'tense', 'almost', 'comfortable', 'mastered'));

-- Pinned exercises now support up to 5 (was 3) and a manual display order, set from the new pin
-- manager popup. Backfill existing rows a sensible order based on when they were pinned.
alter table public.pinned_exercises add column if not exists sort_order integer not null default 0;
update public.pinned_exercises pe
set sort_order = sub.rn - 1
from (
  select user_id, exercise_en, row_number() over (partition by user_id order by pinned_at) as rn
  from public.pinned_exercises
) sub
where pe.user_id = sub.user_id and pe.exercise_en = sub.exercise_en;

-- SECURITY FIX (audit findings #1 and #2):
--
-- 1) group_members had no real gate on joining -- the old "signed-in users can
--    join groups" insert policy only checked auth.uid() = user_id, and "groups"
--    was fully readable by every signed-in user (needed so a code could be
--    looked up before joining existed). Combined, any signed-in user could list
--    every group + invite code via `select * from groups` and self-insert into
--    group_members for any group_id, completely bypassing the invite code and
--    gaining read access to that group's shared practice logs (including
--    private notes), chat and challenges.
--    Fix: invite-code joins now go through a security-definer RPC that does the
--    lookup and insert itself (bypassing RLS internally, same pattern as
--    is_group_member() below), and the direct insert policy is narrowed to only
--    the group's own creator adding themself right after creating it (matches
--    the existing create-group flow). "groups" SELECT is narrowed to members
--    (or the creator, so createGroup()'s insert().select() still returns the
--    new row before the membership insert happens in the next request).
--
-- 2) Personal Challenges' anti-backdating check (see the "Anti-backdating"
--    comment on isChallengeDayValid in page.tsx) trusted practice_logs.updated_at,
--    but the touch_updated_at trigger only ran on UPDATE -- a client could set
--    updated_at explicitly on a fresh INSERT and forge a "same-day" edit for any
--    past date, instantly completing a challenge with fabricated history. The
--    BPM-target branch had no such check at all.
--    Fix: the trigger now also covers INSERT, and practice_sessions gets an
--    equivalent server-controlled created_at via a new trigger, cross-checked
--    by the app (see page.tsx's isChallengeDayValid).

drop policy if exists "signed-in users can join groups" on public.group_members;
create policy "creator can add themself when creating a group" on public.group_members for insert to authenticated with check (
  auth.uid() = user_id and exists (select 1 from public.groups g where g.id = group_members.group_id and g.created_by = auth.uid())
);

drop policy if exists "signed-in users can view groups" on public.groups;
create policy "members and creators can view their groups" on public.groups for select to authenticated using (
  public.is_group_member(id) or created_by = auth.uid()
);

-- The only way left to join an existing group you didn't create: verifies the
-- invite code server-side and inserts the membership row in one step.
create or replace function public.join_group_by_code(p_code text)
returns table (id uuid, name text, invite_code text, created_at timestamptz, created_by uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.groups%rowtype;
begin
  select * into target from public.groups g where g.invite_code = upper(trim(p_code));
  if not found then
    return;
  end if;
  insert into public.group_members (group_id, user_id) values (target.id, auth.uid())
  on conflict (group_id, user_id) do nothing;
  return query select target.id, target.name, target.invite_code, target.created_at, target.created_by;
end;
$$;
grant execute on function public.join_group_by_code(text) to authenticated;

-- touch_updated_at now also covers INSERT, so a client can no longer set a
-- forged updated_at on a brand-new (backdated) log row.
drop trigger if exists practice_logs_touch_updated_at on public.practice_logs;
create trigger practice_logs_touch_updated_at
before insert or update on public.practice_logs
for each row execute function public.touch_updated_at();

-- practice_sessions gets the same server-controlled timestamp treatment for
-- created_at, so a forged practiced_on can't be paired with a forged created_at
-- to fake a same-day BPM-target challenge session.
create or replace function public.lock_created_at()
returns trigger
language plpgsql
as $$
begin
  new.created_at = now();
  return new;
end;
$$;
drop trigger if exists practice_sessions_lock_created_at on public.practice_sessions;
create trigger practice_sessions_lock_created_at
before insert on public.practice_sessions
for each row execute function public.lock_created_at();

-- Confirmed via `select proacl from pg_proc where proname = 'join_group_by_code'` that
-- `revoke ... from public` alone didn't remove anon's access: Supabase's public schema
-- has ALTER DEFAULT PRIVILEGES set up to grant EXECUTE on every new function directly to
-- anon/authenticated/service_role, not via the PUBLIC pseudo-role -- so anon had its own
-- separate grant that "from public" never touched. Revoking from anon explicitly instead.
-- join_group_by_code (added two migrations ago) was callable by fully unauthenticated
-- requests, not just signed-in users. A valid code couldn't actually create a bogus
-- membership (auth.uid() is null for an anon caller, and group_members.user_id is part
-- of the primary key, so the insert would hard-fail) -- but it let someone with no
-- account at all distinguish a real invite code from a fake one via the response.
-- delete_group_as_creator is skipped -- per its own comment earlier in this file, it
-- turned out to be unreliable on Supabase's API layer and was never actually deployed,
-- so it doesn't exist on the live database; guarding on to_regprocedure so this
-- migration doesn't fail if that ever changes.
revoke execute on function public.join_group_by_code(text) from anon, public;
revoke execute on function public.is_group_member(uuid) from anon, public;
grant execute on function public.join_group_by_code(text) to authenticated;
grant execute on function public.is_group_member(uuid) to authenticated;
do $$
begin
  if to_regprocedure('public.delete_group_as_creator(uuid)') is not null then
    execute 'revoke execute on function public.delete_group_as_creator(uuid) from anon, public';
    execute 'grant execute on function public.delete_group_as_creator(uuid) to authenticated';
  end if;
end $$;

-- SECURITY/INTEGRITY FIX (audit findings #3 and #4):
--
-- 3) practice_logs.minutes and practice_sessions.duration_minutes had no upper
--    bound (only >= 0). Since group members can read each other's practice_logs
--    (see the "group members can view each other's practice logs" policy
--    above), a single absurd entry -- e.g. minutes: 999999 for one day --
--    would permanently skew a shared group leaderboard for every real member
--    of that group, not just the entering user's own stats. Capping both at
--    1440 (minutes in a day), a ceiling no real practice session can reach.
--
-- 4) No application-level rate limiting existed on group or challenge
--    creation. Login/signup/password reset already get Supabase Auth's own
--    built-in rate limiting, but plain table inserts through PostgREST have
--    nothing playing that role. Both are plain INSERT trigger checks (same
--    style as the existing cap_group_messages trigger) capping how many rows
--    a single user can create in a rolling window -- generous enough that no
--    real usage pattern would ever hit them, but low enough to blunt a script.
--    (Invite-code brute-forcing via join_group_by_code isn't rate-limited
--    separately: codes are drawn from a 36^6 ≈ 2.18 billion space, which is
--    already impractical to brute-force at any sustainable request rate.)

alter table public.practice_logs drop constraint if exists practice_logs_minutes_check;
alter table public.practice_logs add constraint practice_logs_minutes_check check (minutes >= 0 and minutes <= 1440);
alter table public.practice_sessions drop constraint if exists practice_sessions_duration_minutes_check;
alter table public.practice_sessions add constraint practice_sessions_duration_minutes_check check (duration_minutes >= 0 and duration_minutes <= 1440);

create or replace function public.enforce_group_creation_rate_limit()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.groups where created_by = new.created_by and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many groups created recently. Please try again in a bit.';
  end if;
  return new;
end;
$$;
drop trigger if exists groups_rate_limit on public.groups;
create trigger groups_rate_limit
before insert on public.groups
for each row execute function public.enforce_group_creation_rate_limit();

create or replace function public.enforce_challenge_creation_rate_limit()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.challenges where created_by = new.created_by and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Too many challenges created recently. Please try again in a bit.';
  end if;
  return new;
end;
$$;
drop trigger if exists challenges_rate_limit on public.challenges;
create trigger challenges_rate_limit
before insert on public.challenges
for each row execute function public.enforce_challenge_creation_rate_limit();

-- HARDENING FIX (audit findings #5 and #6, both LOW severity / defense-in-depth):
--
-- 5) group_members.role was writable by the client on insert with no
--    constraint tying it to reality. Verified via a full-file grep that
--    nothing in the app actually reads .role for any permission decision
--    today (all real creator-only checks use groups.created_by = auth.uid()
--    instead), so this had zero live impact -- but leaving it spoofable is a
--    hazard for whatever future feature eventually trusts this column.
--    join_group_by_code already never sets role (so joiners always get the
--    column default, 'member'); this closes the one remaining path, adding a
--    check that the only way to insert role = 'owner' is the actual creator
--    adding themself.
--
-- 6) profiles was readable by every signed-in user, not just people who
--    share a group with you -- broader than the leaderboard/group-member-name
--    feature (the only real reader of other users' profiles, confirmed via
--    grep) actually needs. Narrowed to your own row plus profiles of users
--    who share a group with you, same self-join pattern already used by the
--    "group members can view each other's practice logs" policy above.

drop policy if exists "creator can add themself when creating a group" on public.group_members;
create policy "creator can add themself when creating a group" on public.group_members for insert to authenticated with check (
  auth.uid() = user_id and role = 'owner' and exists (select 1 from public.groups g where g.id = group_members.group_id and g.created_by = auth.uid())
);

drop policy if exists "profiles are visible to signed-in users" on public.profiles;
create policy "own profile or shared-group members' profiles are visible" on public.profiles for select to authenticated using (
  auth.uid() = id
  or exists (
    select 1 from public.group_members gm1
    join public.group_members gm2 on gm1.group_id = gm2.group_id
    where gm1.user_id = profiles.id and gm2.user_id = auth.uid()
  )
);

-- Dashboard convenience: adds the practicing user's name next to their data when
-- browsing in Supabase Studio's Table Editor, instead of just a raw user_id. These
-- live in a separate "reporting" schema (not "public") specifically so they are NOT
-- reachable through the app's API -- Supabase only exposes the "public" schema to
-- PostgREST by default, so these views are structurally invisible to the app and to
-- anon/authenticated requests, no matter what. To browse them: in Supabase Studio's
-- Table Editor, use the schema dropdown (top left, next to the Supabase logo) and
-- switch it from "public" to "reporting".
create schema if not exists reporting;
revoke all on schema reporting from anon, authenticated;

create or replace view reporting.practice_logs as
select pl.*, p.name as user_name
from public.practice_logs pl
join public.profiles p on p.id = pl.user_id;

create or replace view reporting.practice_sessions as
select ps.*, p.name as user_name
from public.practice_sessions ps
join public.profiles p on p.id = ps.user_id;

create or replace view reporting.personal_challenges as
select pc.*, p.name as user_name
from public.personal_challenges pc
join public.profiles p on p.id = pc.user_id;

create or replace view reporting.pinned_exercises as
select pe.*, p.name as user_name
from public.pinned_exercises pe
join public.profiles p on p.id = pe.user_id;

create or replace view reporting.group_messages as
select gm.*, p.name as user_name, g.name as group_name
from public.group_messages gm
join public.profiles p on p.id = gm.user_id
join public.groups g on g.id = gm.group_id;

revoke all on all tables in schema reporting from anon, authenticated;

-- New-user onboarding: after signup, prompt for exercises to pin and a daily practice
-- goal. Detected via settings.onboarded -- false (or no settings row at all yet) means
-- "show the prompt", set true once the user finishes or explicitly skips it.
alter table public.settings add column if not exists onboarded boolean not null default false;

-- Backfill so existing users don't suddenly see the onboarding prompt: anyone who
-- already has a settings row is clearly not new.
update public.settings set onboarded = true where onboarded = false;

-- Backfill users who predate this feature and never saved any settings at all (no row
-- yet) -- give them a settings row already marked onboarded, same reasoning as above.
insert into public.settings (user_id, onboarded)
select p.id, true from public.profiles p
where not exists (select 1 from public.settings s where s.user_id = p.id);

-- daily_goal_minutes used to default to 30 for every account, even ones that never
-- explicitly chose a goal -- meaning "no goal set yet" and "chose 30 on purpose" were
-- indistinguishable, which is exactly what caused today's onboarding mess. Making the
-- column genuinely nullable with no default: null now means "not chosen yet" for real,
-- and the app shows a dedicated prompt on Home instead of a fabricated number. Existing
-- rows are left untouched -- there's no way to tell who set 30 on purpose from here, so
-- this only changes what happens for brand new users going forward.
alter table public.settings alter column daily_goal_minutes drop default;
alter table public.settings alter column daily_goal_minutes drop not null;

-- Removed the "Daily practice reminders" toggle from Settings -- it saved a boolean to
-- reminder_enabled but nothing ever read it: no push notifications, no email reminders,
-- no scheduled job of any kind actually used it. reminder_time was never wired up either
-- (no UI ever set it). Dropping both now-orphaned columns.
alter table public.settings drop column if exists reminder_enabled;
alter table public.settings drop column if exists reminder_time;

-- Admin activity view: lets a designated admin account see when users have logged
-- practice, without having to dig through the Supabase dashboard directly. Read-only --
-- an admin can see everyone's activity but cannot edit or delete anyone else's data.
--
-- admin_users has no insert/update/delete policy at all (default-deny), so the only way
-- to grant admin access is manually inserting a row via the Supabase SQL editor -- never
-- from the app itself, and never something a user could grant themselves.
create table if not exists public.admin_users (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;

-- security definer + bypasses RLS internally, same pattern as is_group_member() --
-- avoids the recursion that would happen if the admin_users select policy tried to
-- query admin_users directly through RLS.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as 'select exists (select 1 from public.admin_users where user_id = auth.uid());';
revoke execute on function public.is_admin() from anon, public;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "admins can view admin list" on public.admin_users;
create policy "admins can view admin list" on public.admin_users for select to authenticated using (public.is_admin());

-- Additive read-only policies -- OR'd with each table's existing policies, so nothing
-- already working changes. Admins can now also SELECT (never insert/update/delete)
-- any user's practice logs, practice sessions, or profile.
drop policy if exists "admins can view all practice logs" on public.practice_logs;
create policy "admins can view all practice logs" on public.practice_logs for select to authenticated using (public.is_admin());
drop policy if exists "admins can view all practice sessions" on public.practice_sessions;
create policy "admins can view all practice sessions" on public.practice_sessions for select to authenticated using (public.is_admin());
drop policy if exists "admins can view all profiles" on public.profiles;
create policy "admins can view all profiles" on public.profiles for select to authenticated using (public.is_admin());

-- auth.users (email) isn't reachable through the normal client API at all -- this
-- function is the one controlled, read-only way to surface it, and only to a verified
-- admin (checked again inside the function itself, not just relying on the caller
-- already being gated by the app's UI).
create or replace function public.admin_list_users()
returns table (id uuid, name text, email text, last_active date)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  return query
    select
      p.id,
      p.name,
      u.email::text,
      greatest(
        (select max(pl.practiced_on) from public.practice_logs pl where pl.user_id = p.id),
        (select max(ps.practiced_on) from public.practice_sessions ps where ps.user_id = p.id)
      ) as last_active
    from public.profiles p
    join auth.users u on u.id = p.id
    order by last_active desc nulls last, p.name asc;
end;
$$;
revoke execute on function public.admin_list_users() from anon, public;
grant execute on function public.admin_list_users() to authenticated;

-- Admin dashboard: adds per-user total_logs/total_minutes so the admin screen can show
-- "who logs the most" / "who practices the most" leaderboards, not just a plain list.
-- Return columns changed, so this needs a drop + recreate (create or replace can't change
-- a function's return type).
drop function if exists public.admin_list_users();
create function public.admin_list_users()
returns table (id uuid, name text, email text, last_active date, total_logs bigint, total_minutes bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  return query
    select
      p.id,
      p.name,
      u.email::text,
      greatest(
        (select max(pl.practiced_on) from public.practice_logs pl where pl.user_id = p.id),
        (select max(ps.practiced_on) from public.practice_sessions ps where ps.user_id = p.id)
      ) as last_active,
      (select count(*) from public.practice_logs pl where pl.user_id = p.id) as total_logs,
      coalesce((select sum(pl.minutes) from public.practice_logs pl where pl.user_id = p.id), 0)
        + coalesce((select sum(ps.duration_minutes) from public.practice_sessions ps where ps.user_id = p.id), 0) as total_minutes
    from public.profiles p
    join auth.users u on u.id = p.id
    order by last_active desc nulls last, p.name asc;
end;
$$;
revoke execute on function public.admin_list_users() from anon, public;
grant execute on function public.admin_list_users() to authenticated;

-- Personal, sticky "what did you practice" items and method books a student types themselves,
-- so they reappear as reusable pills in future sessions instead of being retyped every time.
-- Separate from practice_exercises/practice_items since these are per-user free text, not a
-- shared curated catalog.
create table if not exists public.user_practice_items (
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('item', 'book')),
  name text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, name)
);
alter table public.user_practice_items enable row level security;
drop policy if exists "users manage their practice items" on public.user_practice_items;
create policy "users manage their practice items" on public.user_practice_items for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Quick Practice / Day Editor elements: "Bass Drum" renamed to "Footwork" (a broader label for
-- foot technique in general, not just the drum itself), plus two new elements. Renaming name_en
-- on the existing row (rather than inserting a new one) keeps every already-logged session's
-- item_id link intact -- only the displayed text changes.
update public.practice_items set name_en = 'Footwork', name_es = 'Trabajo de pies' where slug = 'bass-drum';
insert into public.practice_items (slug, name_en, name_es, sort_order) values
  ('fills', 'Fills', 'Fills', 10),
  ('songs', 'Songs', 'Canciones', 11)
on conflict (slug) do nothing;

-- Admin dashboard bug: the admin could already see a user's practice_logs rows (minutes, date,
-- custom_items) but not their resolved practice_log_items -- that table's only policy scoped
-- select to the log's own owner, with no admin bypass, so flat "what did you practice" tags
-- saved via the practice_items catalog (Rhythms, Coordination, etc., anything picked through
-- `selected` rather than customItems) silently disappeared from the admin's per-user log view.
-- Additive, same pattern as the other admin read policies -- doesn't narrow the existing one.
drop policy if exists "admins can view all practice log items" on public.practice_log_items;
create policy "admins can view all practice log items" on public.practice_log_items for select to authenticated using (public.is_admin());

-- Lets the admin tell whether a day's Quick Practice minutes came from a metronome
-- free-play session or were just typed in manually -- previously indistinguishable
-- since both paths wrote to the same practice_logs row/columns.
alter table public.practice_logs add column if not exists used_metronome boolean not null default false;

-- Admin per-user summary now shows pinned exercises ("Your Focus"); pinned_exercises had
-- only owner-scoped access, no admin bypass -- additive, same pattern as the other admin
-- read policies.
drop policy if exists "admins can view all pinned exercises" on public.pinned_exercises;
create policy "admins can view all pinned exercises" on public.pinned_exercises for select to authenticated using (public.is_admin());

-- Teacher-awarded points + Kid Mode. Points are an event log (not a mutable counter) so a
-- correction is a visible audit entry ("-1, reason: duplicate award") rather than a silent
-- edit, matching how practice_logs/practice_sessions already work in this schema.
create table if not exists public.point_awards (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  awarded_by uuid not null references public.profiles(id),
  amount integer not null check (amount <> 0),
  reason text,
  created_at timestamptz not null default now()
);
alter table public.point_awards enable row level security;
drop policy if exists "users view their own point awards" on public.point_awards;
create policy "users view their own point awards" on public.point_awards for select to authenticated using (auth.uid() = user_id);
drop policy if exists "admins can view all point awards" on public.point_awards;
create policy "admins can view all point awards" on public.point_awards for select to authenticated using (public.is_admin());

-- Per-student Kid Mode, set by the admin only (see admin_set_kid_mode below), never self-toggled.
alter table public.settings add column if not exists kid_mode boolean not null default false;

-- The only path that can ever insert a point award -- checks is_admin() internally so no
-- blanket write policy is needed on the table itself.
create or replace function public.admin_award_points(target_user_id uuid, points_amount integer, points_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  insert into public.point_awards (user_id, awarded_by, amount, reason) values (target_user_id, auth.uid(), points_amount, points_reason);
end;
$$;
revoke execute on function public.admin_award_points(uuid, integer, text) from anon, public;
grant execute on function public.admin_award_points(uuid, integer, text) to authenticated;

-- Touches only kid_mode (via insert ... on conflict do update set kid_mode = ...) so admin can
-- never accidentally change a student's language/goal/etc while flipping this.
create or replace function public.admin_set_kid_mode(target_user_id uuid, enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  insert into public.settings (user_id, kid_mode) values (target_user_id, enabled)
  on conflict (user_id) do update set kid_mode = excluded.kid_mode;
end;
$$;
revoke execute on function public.admin_set_kid_mode(uuid, boolean) from anon, public;
grant execute on function public.admin_set_kid_mode(uuid, boolean) to authenticated;

-- Student-facing leaderboard: returns only name + aggregate total (never the raw reason/
-- awarded_by columns) so a student's "why" notes stay private between them and the teacher.
create or replace function public.points_leaderboard()
returns table (id uuid, name text, total_points bigint)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.name, coalesce(sum(pa.amount), 0) as total_points
  from public.profiles p left join public.point_awards pa on pa.user_id = p.id
  group by p.id, p.name order by total_points desc, p.name asc;
$$;
revoke execute on function public.points_leaderboard() from anon, public;
grant execute on function public.points_leaderboard() to authenticated;

-- Per-student "Point Game" opt-in, set by the admin only (see admin_set_points_enabled
-- below), never self-toggled. Off by default so new students don't show up ranked with
-- 0 points until the admin decides to include them in the game.
alter table public.settings add column if not exists points_enabled boolean not null default false;

create or replace function public.admin_set_points_enabled(target_user_id uuid, enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  insert into public.settings (user_id, points_enabled) values (target_user_id, enabled)
  on conflict (user_id) do update set points_enabled = excluded.points_enabled;
end;
$$;
revoke execute on function public.admin_set_points_enabled(uuid, boolean) from anon, public;
grant execute on function public.admin_set_points_enabled(uuid, boolean) to authenticated;

-- Redefine the leaderboard to only rank students the admin has opted into the point game.
create or replace function public.points_leaderboard()
returns table (id uuid, name text, total_points bigint)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.name, coalesce(sum(pa.amount), 0) as total_points
  from public.profiles p
  join public.settings s on s.user_id = p.id
  left join public.point_awards pa on pa.user_id = p.id
  where s.points_enabled = true
  group by p.id, p.name order by total_points desc, p.name asc;
$$;
revoke execute on function public.points_leaderboard() from anon, public;
grant execute on function public.points_leaderboard() to authenticated;

-- Lets admin read every student's personal challenges, needed for the Achievements section
-- on the admin per-student report (trophy chips for completed challenges).
drop policy if exists "admins can view all personal challenges" on public.personal_challenges;
create policy "admins can view all personal challenges" on public.personal_challenges for select to authenticated using (public.is_admin());

-- Fix admin_list_users()'s total_minutes: it was adding Skill Trainer session minutes on top
-- of daily-log minutes, but a day's practice_logs.minutes is already the FULL total for that
-- day (Skill Trainer time gets folded into it -- see the app's own "leftover = log.minutes -
-- structuredMinutesByDay" logic used for "most practiced"). Adding session minutes on top
-- double-counted that overlap and inflated every student's "All time" total.
create or replace function public.admin_list_users()
returns table (id uuid, name text, email text, last_active date, total_logs bigint, total_minutes bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  return query
    select
      p.id,
      p.name,
      u.email::text,
      greatest(
        (select max(pl.practiced_on) from public.practice_logs pl where pl.user_id = p.id),
        (select max(ps.practiced_on) from public.practice_sessions ps where ps.user_id = p.id)
      ) as last_active,
      (select count(*) from public.practice_logs pl where pl.user_id = p.id) as total_logs,
      coalesce((select sum(pl.minutes) from public.practice_logs pl where pl.user_id = p.id), 0) as total_minutes
    from public.profiles p
    join auth.users u on u.id = p.id
    order by last_active desc nulls last, p.name asc;
end;
$$;
revoke execute on function public.admin_list_users() from anon, public;
grant execute on function public.admin_list_users() to authenticated;

-- Renamed 4 footwork exercises to an "Equipment - Technique" pattern and moved the note value
-- (8th notes) into the app's subdivision badge instead of the name -- matching what was already
-- done for rudiments. Also splits the old single "Hi-Hat Pedal 8th Notes" entry: renamed to
-- "Hi-hat Pedal - Heel Up" and added a new "Hi-hat Pedal - Heel Down" alongside it.
-- practice_sessions links to practice_exercises by id, so renaming the catalog row (not
-- practice_sessions) is what keeps past sessions attached. pinned_exercises/personal_challenges
-- store the name as plain text, so those need their own update to stay matched.
update public.practice_exercises set name_en = 'Bass Drum - Heel Down', name_es = 'Bombo - Talón Abajo' where name_en = 'Heel Down, 8th Notes';
update public.practice_exercises set name_en = 'Bass Drum - Heel Up', name_es = 'Bombo - Talón Arriba' where name_en = 'Heel Up, 8th Notes';
update public.practice_exercises set name_en = 'Bass Drum - Slide Technique', name_es = 'Bombo - Técnica de Deslizamiento' where name_en = 'Slide Technique, 8th Notes';
update public.practice_exercises set name_en = 'Hi-hat Pedal - Heel Up', name_es = 'Pedal de Hi-hat - Talón Arriba' where name_en = 'Hi-Hat Pedal 8th Notes';
insert into public.practice_exercises (category, subcategory, name_en, name_es, sort_order) values
  ('exercises', null, 'Hi-hat Pedal - Heel Down', 'Pedal de Hi-hat - Talón Abajo', 16)
on conflict (category, name_en) do nothing;
update public.pinned_exercises set exercise_en = 'Bass Drum - Heel Down' where exercise_en = 'Heel Down, 8th Notes';
update public.pinned_exercises set exercise_en = 'Bass Drum - Heel Up' where exercise_en = 'Heel Up, 8th Notes';
update public.pinned_exercises set exercise_en = 'Bass Drum - Slide Technique' where exercise_en = 'Slide Technique, 8th Notes';
update public.pinned_exercises set exercise_en = 'Hi-hat Pedal - Heel Up' where exercise_en = 'Hi-Hat Pedal 8th Notes';
update public.personal_challenges set exercise_en = 'Bass Drum - Heel Down' where exercise_en = 'Heel Down, 8th Notes';
update public.personal_challenges set exercise_en = 'Bass Drum - Heel Up' where exercise_en = 'Heel Up, 8th Notes';
update public.personal_challenges set exercise_en = 'Bass Drum - Slide Technique' where exercise_en = 'Slide Technique, 8th Notes';
update public.personal_challenges set exercise_en = 'Hi-hat Pedal - Heel Up' where exercise_en = 'Hi-Hat Pedal 8th Notes';

-- Group teacher/admin role: lets students in a group identify their teacher (any group
-- member who is a global admin, via the existing admin_users/is_admin() system -- no new
-- role table) and lets that teacher hide their own competitive stats (leaderboard position,
-- minutes, streaks, recent improvements) from the group without losing their membership,
-- their "Teacher · Admin" identity, or their own ability to see/manage the group.
alter table public.groups add column if not exists show_teacher_stats boolean not null default true;

-- security definer + bypasses admin_users' own RLS internally, same reasoning as is_admin()
-- above -- a non-admin caller's RLS-filtered view of admin_users would otherwise make this
-- always return false for other people, silently disabling the hide-stats feature.
create or replace function public.is_admin_user(target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as 'select exists (select 1 from public.admin_users where user_id = target_user_id);';
revoke execute on function public.is_admin_user(uuid) from anon, public;
grant execute on function public.is_admin_user(uuid) to authenticated;

-- Any member of a group can ask who its teacher is (if any) -- this is identity, not a
-- stats leak, so it only checks group membership, not is_admin() on the caller.
create or replace function public.group_teacher_id(target_group_id uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select gm.user_id
  from public.group_members gm
  where gm.group_id = target_group_id
    and public.is_group_member(target_group_id)
    and public.is_admin_user(gm.user_id)
  limit 1;
$$;
revoke execute on function public.group_teacher_id(uuid) from anon, public;
grant execute on function public.group_teacher_id(uuid) to authenticated;

-- Only a group's own teacher (a global admin who is a member of this specific group) can
-- flip this -- a regular student, or an admin who isn't in this group, cannot.
create or replace function public.admin_set_group_teacher_stats(target_group_id uuid, enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  if not public.is_group_member(target_group_id) then
    raise exception 'Not a member of this group';
  end if;
  update public.groups set show_teacher_stats = enabled where id = target_group_id;
end;
$$;
revoke execute on function public.admin_set_group_teacher_stats(uuid, boolean) from anon, public;
grant execute on function public.admin_set_group_teacher_stats(uuid, boolean) to authenticated;

-- Enforce the hide-stats setting at the data level (not just the UI): a group member can no
-- longer see another member's practice_logs rows if that other member is this group's
-- teacher and the group has turned teacher stats off. The teacher's own "users manage their
-- practice logs" policy is untouched, so this never affects the teacher's own visibility.
drop policy if exists "group members can view each other's practice logs" on public.practice_logs;
create policy "group members can view each other's practice logs" on public.practice_logs for select to authenticated using (
  exists (
    select 1 from public.group_members gm1
    join public.group_members gm2 on gm1.group_id = gm2.group_id
    join public.groups g on g.id = gm1.group_id
    where gm1.user_id = practice_logs.user_id and gm2.user_id = auth.uid()
      and (g.show_teacher_stats = true or not public.is_admin_user(practice_logs.user_id))
  )
);

-- Same enforcement for Skill Trainer sessions, which feed the group's "Recent Improvements"
-- board. This also newly lets group members see each other's sessions at all -- no such
-- policy existed before, so that board only ever showed the viewer's own progress.
drop policy if exists "group members can view each other's practice sessions" on public.practice_sessions;
create policy "group members can view each other's practice sessions" on public.practice_sessions for select to authenticated using (
  exists (
    select 1 from public.group_members gm1
    join public.group_members gm2 on gm1.group_id = gm2.group_id
    join public.groups g on g.id = gm1.group_id
    where gm1.user_id = practice_sessions.user_id and gm2.user_id = auth.uid()
      and (g.show_teacher_stats = true or not public.is_admin_user(practice_sessions.user_id))
  )
);

-- Group creation/settings expansion: practice-day counting window, an on/off switch for group
-- chat, and an on/off switch for the weekly awards board. Defaults are chosen so EXISTING
-- groups behave exactly as before (chat already always showed -> true; days-this-year already
-- counted Jan1-Dec31 -> count_days_from_creation false; weekly awards is brand new UI that
-- shouldn't appear unasked -> false). New groups explicitly opt into all three at creation time
-- via the client's insert payload, matching the suggested "default ON" creation form.
alter table public.groups add column if not exists count_days_from_creation boolean not null default false;
alter table public.groups add column if not exists chat_enabled boolean not null default true;
alter table public.groups add column if not exists weekly_awards_enabled boolean not null default false;

-- Single settings RPC for every teacher-controlled group flag (replaces
-- admin_set_group_teacher_stats as the client's write path going forward; that older function
-- is left in place, just unused, per this schema's append-only convention). Any parameter left
-- null keeps that column's current value, so the client only ever sends the one flag it's
-- actually toggling.
create or replace function public.admin_set_group_settings(
  target_group_id uuid,
  p_show_teacher_stats boolean default null,
  p_chat_enabled boolean default null,
  p_weekly_awards_enabled boolean default null,
  p_count_days_from_creation boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  if not public.is_group_member(target_group_id) then
    raise exception 'Not a member of this group';
  end if;
  update public.groups set
    show_teacher_stats = coalesce(p_show_teacher_stats, show_teacher_stats),
    chat_enabled = coalesce(p_chat_enabled, chat_enabled),
    weekly_awards_enabled = coalesce(p_weekly_awards_enabled, weekly_awards_enabled),
    count_days_from_creation = coalesce(p_count_days_from_creation, count_days_from_creation)
  where id = target_group_id;
end;
$$;
revoke execute on function public.admin_set_group_settings(uuid, boolean, boolean, boolean, boolean) from anon, public;
grant execute on function public.admin_set_group_settings(uuid, boolean, boolean, boolean, boolean) to authenticated;

-- Practice-day counting, take 2: a specific calendar date the teacher picks, not just an
-- on/off "from today" switch. Supersedes the 5-arg admin_set_group_settings from the previous
-- migration (dropped + recreated with the wider signature, since nothing outside this feature
-- depended on the old one yet) -- the client now always calls the 7-arg version.
alter table public.groups add column if not exists stats_start_date date;

drop function if exists public.admin_set_group_settings(uuid, boolean, boolean, boolean, boolean);
create or replace function public.admin_set_group_settings(
  target_group_id uuid,
  p_show_teacher_stats boolean default null,
  p_chat_enabled boolean default null,
  p_weekly_awards_enabled boolean default null,
  p_count_days_from_creation boolean default null,
  p_stats_start_date date default null,
  -- stats_start_date genuinely needs to go back to null sometimes (switching back to "from
  -- today" or "calendar year"), so a plain coalesce can't tell "leave it alone" apart from
  -- "clear it" -- this flag makes that explicit. Every other flag keeps the simpler
  -- coalesce-against-current-value pattern since none of them ever need to be unset to null.
  p_update_stats_start_date boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  if not public.is_group_member(target_group_id) then
    raise exception 'Not a member of this group';
  end if;
  update public.groups set
    show_teacher_stats = coalesce(p_show_teacher_stats, show_teacher_stats),
    chat_enabled = coalesce(p_chat_enabled, chat_enabled),
    weekly_awards_enabled = coalesce(p_weekly_awards_enabled, weekly_awards_enabled),
    count_days_from_creation = coalesce(p_count_days_from_creation, count_days_from_creation),
    stats_start_date = case when p_update_stats_start_date then p_stats_start_date else stats_start_date end
  where id = target_group_id;
end;
$$;
revoke execute on function public.admin_set_group_settings(uuid, boolean, boolean, boolean, boolean, date, boolean) from anon, public;
grant execute on function public.admin_set_group_settings(uuid, boolean, boolean, boolean, boolean, date, boolean) to authenticated;

-- SECURITY AUDIT FIXES (2026-09-25 read-only audit, findings B1/B2, plus one bug found while
-- fixing B2 -- see comments on each block below).

-- BUG FOUND WHILE FIXING B2: settings had no admin-read policy at all -- the admin per-student
-- page's kid_mode/points_enabled fetch (openUser() in page.tsx) was silently returning no row
-- for every student (RLS only ever allowed auth.uid() = user_id to select), so the admin's
-- "Mode"/"Point Game" toggle always displayed OFF regardless of the student's real setting.
-- Additive, same pattern as every other "admins can view all ..." policy in this file.
drop policy if exists "admins can view all settings" on public.settings;
create policy "admins can view all settings" on public.settings for select to authenticated using (public.is_admin());

-- FIX (audit finding B2): points_enabled is documented, and used by the app, as admin-only --
-- the client never writes it directly, only through admin_set_points_enabled -- but the
-- original blanket "for all" policy on settings (see top of this file) still let a user UPDATE
-- it directly via the API, bypassing that RPC and self-opting in/out of the leaderboard against
-- the teacher's decision. Column-level grants close that gap without touching the RPC (a
-- security definer function runs as its owner, not the caller, so it's unaffected by this).
--
-- kid_mode is deliberately left updatable here: unlike points_enabled, the app already treats
-- it as a genuine self-service preference (set during onboarding and editable any time in
-- Settings -- see finishOnboarding/saveSettings in page.tsx), with the admin's admin_set_kid_mode
-- only ever adjusting the same value, not enforcing it. Locking it down at the DB level would
-- break that already-shipped, legitimate flow. The stale "never self-toggled" comment on kid_mode
-- above (and in page.tsx) has been corrected to describe what actually ships.
-- Both INSERT and UPDATE need the same column-level restriction: an upsert's first-ever write
-- for a user (no existing row yet) goes through INSERT, not UPDATE, so restricting only one of
-- the two would leave points_enabled settable exactly once, on a brand-new account.
revoke insert, update on public.settings from authenticated;
grant insert (user_id, language, daily_goal_minutes, metronome_tone, show_days_this_year, onboarded, kid_mode) on public.settings to authenticated;
grant update (language, daily_goal_minutes, metronome_tone, show_days_this_year, onboarded, kid_mode) on public.settings to authenticated;

-- FIX (audit finding B1): "signed-in users can join challenges" only checked auth.uid() =
-- user_id, never that the caller is actually a member of the challenge's own group -- the same
-- bug already found and fixed for group_members joins (see "SECURITY FIX" comment earlier in
-- this file), just never mirrored onto challenge_members. Narrowing to require membership in
-- the challenge's group, same join pattern already used by "group members can create challenges".
drop policy if exists "signed-in users can join challenges" on public.challenge_members;
drop policy if exists "group members can join challenges" on public.challenge_members;
create policy "group members can join challenges" on public.challenge_members for insert to authenticated with check (
  auth.uid() = user_id and exists (
    select 1 from public.challenges c
    join public.group_members m on m.group_id = c.group_id
    where c.id = challenge_id and m.user_id = auth.uid()
  )
);

-- FIX (audit finding B5): group_messages had no rate limit, unlike groups/challenges (see the
-- rate-limit triggers earlier in this file) -- a member could spam a group's chat with rapid
-- inserts. Same style trigger, generous enough that no real conversation would ever hit it.
create or replace function public.enforce_group_message_rate_limit()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.group_messages where user_id = new.user_id and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Sending messages too fast. Please slow down.';
  end if;
  return new;
end;
$$;
drop trigger if exists group_messages_rate_limit on public.group_messages;
create trigger group_messages_rate_limit
before insert on public.group_messages
for each row execute function public.enforce_group_message_rate_limit();

-- FIX (audit finding B6): several free-text fields had no length limit at all, unlike
-- group_messages.message (already capped at 500). Not a security issue on their own (all are
-- RLS-scoped to the owner or shared read-only with a group/admin, and React escapes everything
-- on render) -- just hardening against an oversized paste breaking layout or bloating storage.
alter table public.practice_logs drop constraint if exists practice_logs_notes_length_check;
alter table public.practice_logs add constraint practice_logs_notes_length_check check (notes is null or char_length(notes) <= 2000);
alter table public.practice_sessions drop constraint if exists practice_sessions_notes_length_check;
alter table public.practice_sessions add constraint practice_sessions_notes_length_check check (notes is null or char_length(notes) <= 2000);
alter table public.profiles drop constraint if exists profiles_name_length_check;
alter table public.profiles add constraint profiles_name_length_check check (char_length(name) <= 100);
alter table public.challenges drop constraint if exists challenges_name_length_check;
alter table public.challenges add constraint challenges_name_length_check check (char_length(name) <= 200);
alter table public.challenges drop constraint if exists challenges_reward_length_check;
alter table public.challenges add constraint challenges_reward_length_check check (reward is null or char_length(reward) <= 500);
alter table public.challenges drop constraint if exists challenges_punishment_length_check;
alter table public.challenges add constraint challenges_punishment_length_check check (punishment is null or char_length(punishment) <= 500);

-- FIX (audit finding B7): MAX_PINNED_EXERCISES (5) was only enforced client-side in page.tsx --
-- harmless today (pinning more isn't an advantage of any kind), but a direct API call could
-- exceed it. Trigger mirrors the same style as the other row-count limits in this file.
create or replace function public.enforce_max_pinned_exercises()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.pinned_exercises where user_id = new.user_id) >= 5 then
    raise exception 'You can only pin up to 5 exercises.';
  end if;
  return new;
end;
$$;
drop trigger if exists pinned_exercises_max_limit on public.pinned_exercises;
create trigger pinned_exercises_max_limit
before insert on public.pinned_exercises
for each row execute function public.enforce_max_pinned_exercises();

-- FOLLOW-UP TO B6: two more freeform-text fields missed in the first pass, same rationale as the
-- notes/name/reward/punishment caps above.
--
-- user_practice_items.name (sticky custom "what did you practice" / method-book entries a
-- student types themselves) had no length limit -- plain check constraint, same as profiles.name.
alter table public.user_practice_items drop constraint if exists user_practice_items_name_length_check;
alter table public.user_practice_items add constraint user_practice_items_name_length_check check (char_length(name) <= 100);

-- practice_logs.custom_items is a text[] (freeform "Other" pills typed into the metronome's
-- Add-Time prompt), visible to group members via the existing group-visibility policy on
-- practice_logs -- unlike the plain-text columns above, a check constraint can't validate a
-- subquery over an array's elements, so this needs a trigger instead (same style as the other
-- triggers in this file): caps the number of pills per day and each pill's length.
create or replace function public.enforce_custom_items_limits()
returns trigger
language plpgsql
as $$
begin
  if array_length(new.custom_items, 1) > 20 then
    raise exception 'Too many custom items for one day.';
  end if;
  if exists (select 1 from unnest(new.custom_items) as item where char_length(item) > 100) then
    raise exception 'A custom item name is too long.';
  end if;
  return new;
end;
$$;
drop trigger if exists practice_logs_custom_items_limits on public.practice_logs;
create trigger practice_logs_custom_items_limits
before insert or update on public.practice_logs
for each row execute function public.enforce_custom_items_limits();

-- New Hand Techniques exercises: three short sticking patterns (see the `pattern` field on their
-- PRACTICE_EXERCISES entries in page.tsx for the short "1 eighth + 2 sixteenth" style
-- description). practice_sessions links to practice_exercises by id (looked up by name_en), so
-- these need a matching catalog row here for Skill Trainer/BPM tracking to work at all.
insert into public.practice_exercises (category, subcategory, name_en, name_es, sort_order) values
  ('exercises', null, 'Three-Note Pattern #1', 'Patrón de Tres Notas #1', 17),
  ('exercises', null, 'Three-Note Pattern #2', 'Patrón de Tres Notas #2', 18),
  ('exercises', null, 'Three-Note Pattern #3', 'Patrón de Tres Notas #3', 19)
on conflict (category, name_en) do nothing;

-- BUG FOUND while adding the above: "R L L (Triplets)" has existed in the app's own
-- PRACTICE_EXERCISES list (page.tsx) since it was added, but was never inserted into this
-- catalog table -- so practice_exercises lookup by name_en has always failed for it, meaning
-- every Skill Trainer session logged against it silently saved with no practice_exercise_id and
-- was invisible to tier/BPM progress tracking. Backfilling it now, matching its exact english/
-- spanish labels.
insert into public.practice_exercises (category, subcategory, name_en, name_es, sort_order) values
  ('exercises', 'Permutations', 'R L L (Triplets)', 'R L L (Tresillos)', 20)
on conflict (category, name_en) do nothing;

-- ACCOUNT DELETION FIX (found while preparing the App Store release): deleting an account runs
-- auth.users -> profiles -> everything else via "on delete cascade", but three columns pointed at
-- profiles(id) WITHOUT any delete rule, so the database refused the whole deletion for anyone who
-- had created a group, created a challenge, or (as a teacher) given points. Apple requires account
-- deletion to always work. After this:
--   * a deleted user's groups and challenges are deleted with them (group members, challenge
--     participants and group data cascade from there, same as when a creator deletes a group);
--   * points a deleted teacher gave stay on the students' history, but "awarded_by" becomes empty.
-- The loop drops whatever the existing foreign keys on these columns are called, so this is safe to
-- re-run.
do $$
declare
  r record;
begin
  for r in
    select con.conname, rel.relname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    join pg_attribute att on att.attrelid = rel.oid and att.attnum = any(con.conkey)
    where n.nspname = 'public' and con.contype = 'f'
      and ((rel.relname = 'groups' and att.attname = 'created_by')
        or (rel.relname = 'challenges' and att.attname = 'created_by')
        or (rel.relname = 'point_awards' and att.attname = 'awarded_by'))
  loop
    execute format('alter table public.%I drop constraint %I', r.relname, r.conname);
  end loop;
end $$;
alter table public.groups add constraint groups_created_by_fkey foreign key (created_by) references public.profiles(id) on delete cascade;
alter table public.challenges add constraint challenges_created_by_fkey foreign key (created_by) references public.profiles(id) on delete cascade;
alter table public.point_awards alter column awarded_by drop not null;
alter table public.point_awards add constraint point_awards_awarded_by_fkey foreign key (awarded_by) references public.profiles(id) on delete set null;

-- GROUP CHAT REMOVED (children use the app, and Apple requires report/block/moderation for chat
-- between users): the app no longer has chat, and this closes it at the database too. With row level
-- security still enabled on group_messages and no policy left, nobody can read or write it through
-- the API. Existing messages are NOT deleted by this -- delete from public.group_messages; would
-- purge them.
drop policy if exists "group members read messages" on public.group_messages;
drop policy if exists "group members send messages" on public.group_messages;

-- PRIVATE PRACTICE NOTES, PART 1 (additive, safe to run any time). Group members used to read each
-- other's whole practice_logs / practice_sessions rows (a row-level policy can't hide one column),
-- which exposed the free-text notes (and Skill Trainer issue tags) of children to their group. The
-- group screens now read other members through these two views instead: same rows the old group
-- policies allowed (including the "teacher can hide their stats" rule), minus notes and issues.
-- The views run with the view owner's rights on purpose (so they can see rows the caller's own
-- policies would hide) but only ever return rows for people the caller shares a group with.
create or replace view public.group_practice_logs as
select pl.id, pl.user_id, pl.practiced_on, pl.minutes, pl.seconds, pl.equipment, pl.drumset_minutes, pl.pad_minutes, pl.custom_items
from public.practice_logs pl
where exists (
  select 1 from public.group_members gm1
  join public.group_members gm2 on gm1.group_id = gm2.group_id
  join public.groups g on g.id = gm1.group_id
  where gm1.user_id = pl.user_id and gm2.user_id = auth.uid()
    and (g.show_teacher_stats = true or not public.is_admin_user(pl.user_id))
);
create or replace view public.group_practice_sessions as
select ps.id, ps.user_id, ps.practice_exercise_id, ps.bpm, ps.rating, ps.duration_minutes, ps.practiced_on, ps.created_at
from public.practice_sessions ps
where exists (
  select 1 from public.group_members gm1
  join public.group_members gm2 on gm1.group_id = gm2.group_id
  join public.groups g on g.id = gm1.group_id
  where gm1.user_id = ps.user_id and gm2.user_id = auth.uid()
    and (g.show_teacher_stats = true or not public.is_admin_user(ps.user_id))
);
revoke all on public.group_practice_logs from anon, public;
revoke all on public.group_practice_sessions from anon, public;
grant select on public.group_practice_logs to authenticated;
grant select on public.group_practice_sessions to authenticated;
notify pgrst, 'reload schema';

-- PRIVATE PRACTICE NOTES, PART 2 -- RUN ONLY AFTER the app version that reads the two views above
-- is live (before that, the old app still needs these policies to show the group screens). With
-- these two policies gone, only the owner (and an admin/teacher, via their own existing policies)
-- can read the base tables, so notes are private at the database level.
drop policy if exists "group members can view each other's practice logs" on public.practice_logs;
drop policy if exists "group members can view each other's practice sessions" on public.practice_sessions;

-- FIX FOR A REGRESSION IN THE "SECURITY AUDIT FIXES" BLOCK ABOVE: saving settings failed with
-- "permission denied for table settings". The app saves with an upsert (INSERT ... ON CONFLICT DO
-- UPDATE), and PostgREST writes that as "DO UPDATE SET user_id = EXCLUDED.user_id, language = ...":
-- the conflict column itself is in the SET list, so the column-level UPDATE grant needs user_id too.
-- This is safe: the row-level policy ("auth.uid() = user_id" in with check) still stops anyone from
-- pointing a row at another user. points_enabled stays admin-only (still not granted).
grant update (user_id) on public.settings to authenticated;

-- GROUP VIEW: ONLY STANDARD EXERCISES AND BOOKS (part A, safe to run any time). custom_items also holds
-- free text students type themselves ("My items", their own books), which every other group member could
-- read. The group view now returns only items from the app's own lists: exercise names from the
-- practice_exercises catalog and the built-in books (keep this list in sync with PRACTICE_BOOKS in
-- page.tsx). Same columns and order as before, so "create or replace" is allowed.
create or replace view public.group_practice_logs as
select pl.id, pl.user_id, pl.practiced_on, pl.minutes, pl.seconds, pl.equipment, pl.drumset_minutes, pl.pad_minutes,
  array(
    select t.ci from unnest(pl.custom_items) with ordinality as t(ci, ord)
    where t.ci in (select pe.name_en from public.practice_exercises pe)
       or t.ci in ('Stick Control', 'Syncopation', '4-Way Coordination', 'Rhythmic Illusions', '150 Rudimental Solos')
    order by t.ord
  ) as custom_items
from public.practice_logs pl
where exists (
  select 1 from public.group_members gm1
  join public.group_members gm2 on gm1.group_id = gm2.group_id
  join public.groups g on g.id = gm1.group_id
  where gm1.user_id = pl.user_id and gm2.user_id = auth.uid()
    and (g.show_teacher_stats = true or not public.is_admin_user(pl.user_id))
);

-- ONLY GROUP ADMINS CREATE CHALLENGES (part B -- RUN ONLY AFTER the app update that hides the "New
-- challenge" button for students is live). Challenge names, rewards and punishments are free text that
-- the whole group sees; with children in groups, only the admin (teacher) may write them. Members can
-- still join challenges; challenges that students created earlier stay as they are.
drop policy if exists "group members can create challenges" on public.challenges;
drop policy if exists "group admins can create challenges" on public.challenges;
create policy "group admins can create challenges" on public.challenges for insert to authenticated with check (
  auth.uid() = created_by and public.is_admin() and exists (
    select 1 from public.group_members m where m.group_id = challenges.group_id and m.user_id = auth.uid()
  )
);

-- ASSIGN A CHALLENGE (admin gives a student a personal challenge, no shared group needed).
-- Reuses personal_challenges. assigned_by is the admin who gave it (null = the student's own challenge).
-- A student can add/change/delete only her OWN challenges; assigned ones are read-only for her, and only
-- the admin who assigned it can remove it. No new table, so no extra grants are needed.
alter table public.personal_challenges add column if not exists assigned_by uuid references public.profiles(id) on delete set null;

drop policy if exists "users manage their personal challenges" on public.personal_challenges;
drop policy if exists "users view their personal challenges" on public.personal_challenges;
drop policy if exists "users add their own personal challenges" on public.personal_challenges;
drop policy if exists "users change their own personal challenges" on public.personal_challenges;
drop policy if exists "users delete their own personal challenges" on public.personal_challenges;
drop policy if exists "admins assign personal challenges" on public.personal_challenges;
drop policy if exists "admins remove challenges they assigned" on public.personal_challenges;

create policy "users view their personal challenges" on public.personal_challenges for select to authenticated using (auth.uid() = user_id);
create policy "users add their own personal challenges" on public.personal_challenges for insert to authenticated with check (auth.uid() = user_id and assigned_by is null);
create policy "users change their own personal challenges" on public.personal_challenges for update to authenticated using (auth.uid() = user_id and assigned_by is null) with check (auth.uid() = user_id and assigned_by is null);
create policy "users delete their own personal challenges" on public.personal_challenges for delete to authenticated using (auth.uid() = user_id and assigned_by is null);
create policy "admins assign personal challenges" on public.personal_challenges for insert to authenticated with check (public.is_admin() and assigned_by = auth.uid());
create policy "admins remove challenges they assigned" on public.personal_challenges for delete to authenticated using (public.is_admin() and assigned_by = auth.uid());

-- GROUP CHEERS (replaces the chat): members tap a ready-made message to cheer the whole group or one
-- member. Nobody types anything: cheer_key must be one of the fixed keys below (keep this list in sync
-- with CHEER_KEYS in page.tsx), so there is no free text to moderate. NEW TABLE, so it has explicit grants.
create table if not exists public.group_cheers (
  id uuid primary key default uuid_generate_v4(),
  group_id uuid not null references public.groups(id) on delete cascade,
  from_user uuid not null,
  to_user uuid,
  cheer_key text not null check (cheer_key in ('letsgo','keepitup','greatpractice','streak','proud','gopractice')),
  created_at timestamptz not null default now(),
  constraint group_cheers_from_user_fkey foreign key (from_user) references public.profiles(id) on delete cascade,
  constraint group_cheers_to_user_fkey foreign key (to_user) references public.profiles(id) on delete cascade
);
create index if not exists group_cheers_group_created_idx on public.group_cheers (group_id, created_at desc);
alter table public.group_cheers enable row level security;

-- Read: a cheer for the whole group (to_user is null), one addressed to me, or one I sent.
drop policy if exists "members read their cheers" on public.group_cheers;
create policy "members read their cheers" on public.group_cheers for select to authenticated using (
  public.is_group_member(group_id) and (to_user is null or to_user = auth.uid() or from_user = auth.uid())
);
-- Send: only as myself, inside a group I belong to, and only to someone in that same group.
drop policy if exists "members send cheers" on public.group_cheers;
create policy "members send cheers" on public.group_cheers for insert to authenticated with check (
  from_user = auth.uid() and public.is_group_member(group_id)
  and (to_user is null or exists (select 1 from public.group_members gm where gm.group_id = group_cheers.group_id and gm.user_id = to_user))
);

grant select, insert on public.group_cheers to authenticated;
grant select, insert, update, delete on public.group_cheers to service_role;

-- Anti-spam (max 5 cheers a minute and 60 a day per person) and tidy-up (cheers older than 14 days are
-- deleted), both run after every insert. security definer so the cleanup can delete other people's rows.
create or replace function public.group_cheers_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.group_cheers where from_user = new.from_user and created_at > now() - interval '1 minute') > 5 then
    raise exception 'Too many cheers, slow down a little.';
  end if;
  if (select count(*) from public.group_cheers where from_user = new.from_user and created_at > now() - interval '1 day') > 60 then
    raise exception 'Daily cheer limit reached.';
  end if;
  delete from public.group_cheers where group_id = new.group_id and created_at < now() - interval '14 days';
  return new;
end;
$$;
revoke execute on function public.group_cheers_guard() from anon, public;
drop trigger if exists group_cheers_guard_trg on public.group_cheers;
create trigger group_cheers_guard_trg after insert on public.group_cheers for each row execute function public.group_cheers_guard();

-- CHEERS, round 2: two more ready-made cheers ("Good job!", "Yes!") and the sender can delete their own
-- cheer. Keep the key list in sync with CHEER_KEYS in page.tsx.
alter table public.group_cheers drop constraint if exists group_cheers_cheer_key_check;
alter table public.group_cheers add constraint group_cheers_cheer_key_check check (cheer_key in ('letsgo','keepitup','greatpractice','streak','proud','gopractice','goodjob','yes'));
drop policy if exists "senders delete their cheers" on public.group_cheers;
create policy "senders delete their cheers" on public.group_cheers for delete to authenticated using (from_user = auth.uid());
grant delete on public.group_cheers to authenticated;

-- CHEER HEARTS: a member who receives a cheer can heart it; the sender sees who did. One row per
-- (cheer, member), so hearting twice is impossible and un-hearting just deletes the row. NEW TABLE, so it has
-- explicit grants. A member can only heart a cheer they can already see (RLS on group_cheers applies inside the
-- check) and never their own.
create table if not exists public.group_cheer_hearts (
  cheer_id uuid not null references public.group_cheers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (cheer_id, user_id)
);
alter table public.group_cheer_hearts enable row level security;
drop policy if exists "see hearts on cheers I can see" on public.group_cheer_hearts;
create policy "see hearts on cheers I can see" on public.group_cheer_hearts for select to authenticated using (
  exists (select 1 from public.group_cheers c where c.id = group_cheer_hearts.cheer_id)
);
drop policy if exists "heart a cheer sent to me" on public.group_cheer_hearts;
create policy "heart a cheer sent to me" on public.group_cheer_hearts for insert to authenticated with check (
  user_id = auth.uid() and exists (select 1 from public.group_cheers c where c.id = group_cheer_hearts.cheer_id and c.from_user <> auth.uid())
);
drop policy if exists "remove my heart" on public.group_cheer_hearts;
create policy "remove my heart" on public.group_cheer_hearts for delete to authenticated using (user_id = auth.uid());
grant select, insert, delete on public.group_cheer_hearts to authenticated;
grant select, insert, update, delete on public.group_cheer_hearts to service_role;

-- TEST ONLY: let a sender heart their own cheer (so hearts can be tried with one account). Pair with
-- ALLOW_SELF_HEART in page.tsx. To go back, run the "revert" policy below instead.
drop policy if exists "heart a cheer sent to me" on public.group_cheer_hearts;
create policy "heart a cheer sent to me" on public.group_cheer_hearts for insert to authenticated with check (
  user_id = auth.uid() and exists (select 1 from public.group_cheers c where c.id = group_cheer_hearts.cheer_id)
);
-- REVERT (run later, with ALLOW_SELF_HEART = false):
-- drop policy if exists "heart a cheer sent to me" on public.group_cheer_hearts;
-- create policy "heart a cheer sent to me" on public.group_cheer_hearts for insert to authenticated with check (
--   user_id = auth.uid() and exists (select 1 from public.group_cheers c where c.id = group_cheer_hearts.cheer_id and c.from_user <> auth.uid())
-- );

-- 2026-10-10: Dutch language option. The settings table only allowed 'en' and 'es'.
-- Safe to re-run.
alter table public.settings drop constraint if exists settings_language_check;
alter table public.settings add constraint settings_language_check check (language in ('en','es','nl'));

-- 2026-10-10: the app offers Footwork, Fills and Songs as practice tags, but they were missing from this catalog, so
-- ticking them saved nothing (the tag silently dropped). Safe to re-run.
insert into public.practice_items (slug, name_en, name_es, sort_order) values
  ('footwork', 'Footwork', 'Trabajo de pies', 20),
  ('fills', 'Fills', 'Fills', 21),
  ('songs', 'Songs', 'Canciones', 22)
on conflict (slug) do nothing;

-- 2026-10-10: the harder rudiments have tempo levels up to 280 BPM, but sessions were limited to 40-240 BPM,
-- so saving a session at 245+ BPM would have been refused. Safe to re-run.
alter table public.practice_sessions drop constraint if exists practice_sessions_bpm_check;
alter table public.practice_sessions add constraint practice_sessions_bpm_check check (bpm between 40 and 300);

-- =====================================================================================================
-- 2026-10-12: UNIVERSAL (WORLDWIDE) LEADERBOARD
-- Opt-in, computed entirely on the server from the existing practice tables. The app never sends a score.
-- Safe to re-run. Run the whole block in the Supabase SQL Editor.
-- =====================================================================================================

-- 1) Opt-in (self-service) and admin-only hide switch. Only leaderboard_opt_in is granted to the app; leaderboard_hidden and
--    the opt-in timestamp are not, so nobody can un-hide themselves or fake their consent date.
alter table public.settings add column if not exists leaderboard_opt_in boolean not null default false;
alter table public.settings add column if not exists leaderboard_opted_in_at timestamptz;
alter table public.settings add column if not exists leaderboard_hidden boolean not null default false;
grant insert (leaderboard_opt_in) on public.settings to authenticated;
grant update (leaderboard_opt_in) on public.settings to authenticated;

create or replace function public.settings_leaderboard_stamp() returns trigger language plpgsql as $$
begin
  if new.leaderboard_opt_in then
    if tg_op = 'INSERT' then
      new.leaderboard_opted_in_at := now();
    elsif not coalesce(old.leaderboard_opt_in, false) then
      new.leaderboard_opted_in_at := now();
    end if;
  else
    new.leaderboard_opted_in_at := null;
  end if;
  return new;
end;
$$;
drop trigger if exists settings_leaderboard_stamp on public.settings;
create trigger settings_leaderboard_stamp before insert or update on public.settings for each row execute function public.settings_leaderboard_stamp();

-- 2) Tempo ladders and tiers, mirroring the app (Bass Drum - Heel Down has the footwork ladder; six rudiments have the
--    extended ladder up to 280 BPM; everything else uses the default ladder).
create or replace function public.lb_exercise_profile(exercise_name text) returns text language sql immutable as $$
  select case
    when exercise_name = 'Bass Drum - Heel Down' then 'footwork'
    when exercise_name in ('Single Strokes Seven', 'Single Drag Tap') then 'cap180'
    when exercise_name in ('Double Paradiddle', 'Triple Paradiddle', 'Paradiddle-Diddle', 'Flam', 'Single Strokes Four') then 'extended'
    else 'default' end
$$;
-- Only real rungs of the ladder count (so a forged 77 BPM session can't create an extra "unlock").
create or replace function public.lb_valid_bpm(profile text, tempo integer) returns boolean language sql immutable as $$
  select case profile
    when 'footwork' then tempo between 50 and 200 and tempo % 5 = 0
    when 'cap180' then (tempo between 50 and 150 and tempo % 10 = 0) or (tempo between 160 and 180 and tempo % 5 = 0)
    when 'extended' then (tempo between 50 and 150 and tempo % 10 = 0) or (tempo between 160 and 280 and tempo % 5 = 0)
    else (tempo between 50 and 150 and tempo % 10 = 0) or (tempo between 160 and 220 and tempo % 5 = 0) end
$$;
create or replace function public.lb_tier(profile text, tempo integer) returns text language sql immutable as $$
  select case profile
    when 'cap180' then case when tempo <= 80 then 'beginner' when tempo <= 120 then 'intermediate' when tempo <= 160 then 'advanced' else 'legend' end
    when 'footwork' then case when tempo <= 90 then 'beginner' when tempo <= 130 then 'intermediate' when tempo <= 160 then 'advanced' else 'legend' end
    when 'extended' then case when tempo <= 90 then 'beginner' when tempo <= 170 then 'intermediate' when tempo <= 220 then 'advanced' else 'legend' end
    else case when tempo <= 90 then 'beginner' when tempo <= 150 then 'intermediate' when tempo <= 190 then 'advanced' else 'legend' end end
$$;
create or replace function public.lb_tier_rank(tier_name text) returns integer language sql immutable as $$
  select case tier_name when 'beginner' then 1 when 'intermediate' then 2 when 'advanced' then 3 else 4 end
$$;

-- 3) Trusted sessions only: logged on (or within a day of) the practice date, a real ladder tempo, and not more than 75 minutes
--    of sessions inside any 60 minutes (physically impossible otherwise). This only decides what the leaderboard counts: nothing
--    here blocks or changes what a student saves, and their own history is untouched.
create or replace function public.lb_valid_sessions()
returns table (user_id uuid, exercise text, tempo integer, practiced_on date, minutes integer, rating text)
language sql stable security definer set search_path = public as $$
  with base as (
    select s.user_id as uid, e.name_en as ex, s.bpm as t, s.practiced_on as d, s.duration_minutes as m, s.rating as r, s.created_at as c
    from public.practice_sessions s
    join public.practice_exercises e on e.id = s.practice_exercise_id
    where e.category in ('rudiments', 'exercises')
      and public.lb_valid_bpm(public.lb_exercise_profile(e.name_en), s.bpm)
      and (s.created_at at time zone 'UTC')::date between s.practiced_on - 1 and s.practiced_on + 1
  ), windowed as (
    select b.*, sum(b.m) over (partition by b.uid order by b.c range between interval '60 minutes' preceding and current row) as hour_minutes from base b
  )
  select w.uid, w.ex, w.t, w.d, w.m, w.r from windowed w where w.hour_minutes <= 75
$$;

-- A tempo is unlocked once it has 2 comfortable-or-better minutes (same rule as the app); the unlock date is the day it got there.
create or replace function public.lb_unlocks()
returns table (user_id uuid, exercise text, tempo integer, unlocked_on date, tier text)
language sql stable security definer set search_path = public as $$
  with q as (
    select v.user_id as uid, v.exercise as ex, v.tempo as t, v.practiced_on as d,
      sum(v.minutes) over (partition by v.user_id, v.exercise, v.tempo order by v.practiced_on) as running
    from public.lb_valid_sessions() v where v.rating in ('comfortable', 'mastered')
  ), firsts as (
    select distinct on (q.uid, q.ex, q.t) q.uid, q.ex, q.t, q.d from q where q.running >= 2 order by q.uid, q.ex, q.t, q.d
  )
  select f.uid, f.ex, f.t, f.d, public.lb_tier(public.lb_exercise_profile(f.ex), f.t) from firsts f
$$;

-- Level = highest tier reached in at least 1 in 4 of the exercises the person has practiced (same rule as the Progress tab).
create or replace function public.lb_levels()
returns table (user_id uuid, level text)
language sql stable security definer set search_path = public as $$
  with practiced as (select v.user_id as uid, count(distinct v.exercise) as n from public.lb_valid_sessions() v group by v.user_id),
  reached as (select u.user_id as uid, u.tier as tr, count(distinct u.exercise) as r from public.lb_unlocks() u group by u.user_id, u.tier)
  select p.uid,
    coalesce((select r.tr from reached r where r.uid = p.uid and r.r >= greatest(1, ceil(p.n / 4.0)) order by public.lb_tier_rank(r.tr) desc limit 1), 'beginner')
  from practiced p
$$;

-- Who may appear: opted in, not hidden by the admin, not a Kid Mode account, and has a name. Names are cut at 30 characters.
create or replace function public.lb_eligible()
returns table (user_id uuid, display_name text)
language sql stable security definer set search_path = public as $$
  select s.user_id, left(regexp_replace(trim(p.name), '^(\S+)\s+.*?(\S)\S*$', '\1 \2.'), 30)
  from public.settings s join public.profiles p on p.id = s.user_id
  where s.leaderboard_opt_in and not s.leaderboard_hidden and not s.kid_mode and length(trim(coalesce(p.name, ''))) > 0
$$;

-- 4) Scores for one category and period, as of a date (the public function passes today's date; tests can pass another).
--    consistency = practice days (5+ minutes each) in the period, tie-break = longest streak. Total minutes are never ranked.
--    skill       = tempos newly unlocked in the period, tie-break = number of different exercises.
--    points      = existing teacher-awarded points in the period (must be above zero).
create or replace function public.lb_scores(p_category text, p_period text, p_asof date)
returns table (user_id uuid, score numeric, detail integer)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare v_start date := case when p_period = 'year' then date_trunc('year', p_asof)::date else date_trunc('month', p_asof)::date end;
begin
  if p_category = 'consistency' then
    return query
    with days as (
      select distinct l.user_id as uid, l.practiced_on as d from public.practice_logs l
      where l.minutes >= 5 and l.practiced_on between v_start and p_asof
        and (l.created_at at time zone 'UTC')::date between l.practiced_on - 1 and l.practiced_on + 1
    ), islands as (
      select d.uid, d.d - (row_number() over (partition by d.uid order by d.d))::integer as grp from days d
    ), runs as (select i.uid, i.grp, count(*) as len from islands i group by i.uid, i.grp)
    select r.uid, sum(r.len)::numeric, max(r.len)::integer from runs r group by r.uid;
  elsif p_category = 'skill' then
    return query
    select u.user_id, count(*)::numeric, count(distinct u.exercise)::integer from public.lb_unlocks() u
    where u.unlocked_on between v_start and p_asof group by u.user_id;
  elsif p_category = 'points' then
    return query
    select a.user_id, sum(a.amount)::numeric, count(*)::integer from public.point_awards a
    where a.created_at >= v_start and a.created_at < (p_asof + 1) group by a.user_id having sum(a.amount) > 0;
  end if;
end;
$$;

-- 5) What the app calls. Returns names, positions, scores and levels only: never ids, emails, notes or practice rows. Your own row is
--    always included, even when you are outside the top list.
create or replace function public.leaderboard(p_category text, p_period text, p_level text default 'all', p_limit integer default 20)
returns table (pos bigint, display_name text, score numeric, detail integer, level text, is_me boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not coalesce((select s.leaderboard_opt_in from public.settings s where s.user_id = auth.uid()), false) then raise exception 'Join the leaderboard first'; end if;
  if p_category not in ('consistency', 'skill', 'points') or p_period not in ('month', 'year')
     or p_level not in ('all', 'beginner', 'intermediate', 'advanced', 'legend') then
    raise exception 'Invalid request';
  end if;
  return query
  with lv as (
    select e.user_id as uid, e.display_name as nm, coalesce(l.level, 'beginner') as lvl
    from public.lb_eligible() e left join public.lb_levels() l on l.user_id = e.user_id
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

-- Small summary for the card on the Progress tab: are you in, your rank this month (consistency), where you were yesterday, your level.
create or replace function public.leaderboard_summary()
returns table (opted_in boolean, eligible boolean, pos bigint, total bigint, prev_pos bigint, level text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare v_in boolean; v_elig boolean; v_pos bigint; v_total bigint; v_prev bigint; v_level text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select coalesce(s.leaderboard_opt_in, false) into v_in from public.settings s where s.user_id = auth.uid();
  v_in := coalesce(v_in, false);
  select exists (select 1 from public.lb_eligible() e where e.user_id = auth.uid()) into v_elig;
  select coalesce((select l.level from public.lb_levels() l where l.user_id = auth.uid()), 'beginner') into v_level;
  select count(*) into v_total from public.lb_scores('consistency', 'month', current_date) s join public.lb_eligible() e on e.user_id = s.user_id where s.score > 0;
  select r.rk into v_pos from (
    select s.user_id as uid, rank() over (order by s.score desc, s.detail desc) as rk
    from public.lb_scores('consistency', 'month', current_date) s join public.lb_eligible() e on e.user_id = s.user_id where s.score > 0
  ) r where r.uid = auth.uid();
  -- yesterday's rank, only when yesterday is still in the same month (otherwise there is nothing to compare with)
  if date_trunc('month', current_date - 1) = date_trunc('month', current_date) then
    select r.rk into v_prev from (
      select s.user_id as uid, rank() over (order by s.score desc, s.detail desc) as rk
      from public.lb_scores('consistency', 'month', current_date - 1) s join public.lb_eligible() e on e.user_id = s.user_id where s.score > 0
    ) r where r.uid = auth.uid();
  end if;
  return query select v_in, v_elig, v_pos, v_total, v_prev, v_level;
end;
$$;

-- Admin moderation: hide a name from the worldwide leaderboard (the student's practice history is not touched).
create or replace function public.admin_set_leaderboard_hidden(target_user_id uuid, hidden boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  insert into public.settings (user_id, leaderboard_hidden) values (target_user_id, hidden)
  on conflict (user_id) do update set leaderboard_hidden = excluded.leaderboard_hidden;
end;
$$;

-- 6) Permissions: the building blocks are not callable from the app at all; only the three public functions are, and only when signed in.
revoke all on function public.lb_exercise_profile(text), public.lb_valid_bpm(text, integer), public.lb_tier(text, integer), public.lb_tier_rank(text) from public, anon, authenticated;
revoke all on function public.lb_valid_sessions(), public.lb_unlocks(), public.lb_levels(), public.lb_eligible(), public.lb_scores(text, text, date) from public, anon, authenticated;
revoke all on function public.leaderboard(text, text, text, integer), public.leaderboard_summary(), public.admin_set_leaderboard_hidden(uuid, boolean) from public, anon;
grant execute on function public.leaderboard(text, text, text, integer) to authenticated;
grant execute on function public.leaderboard_summary() to authenticated;
grant execute on function public.admin_set_leaderboard_hidden(uuid, boolean) to authenticated;

-- 2026-10-12: age category + practice difficulty (also in supabase/age-difficulty.sql)
alter table public.settings add column if not exists age_group text check (age_group in ('under_10', '10_13', '14_plus'));
alter table public.settings add column if not exists practice_difficulty text not null default 'standard' check (practice_difficulty in ('beginner', 'developing', 'standard'));
-- A student may set both for themselves (they are preferences, like kid_mode); nothing else on the row changes.
grant insert (age_group, practice_difficulty) on public.settings to authenticated;
grant update (age_group, practice_difficulty) on public.settings to authenticated;

-- The admin (teacher) can set a student's practice difficulty; same pattern as admin_set_kid_mode.
create or replace function public.admin_set_practice_difficulty(target_user_id uuid, difficulty text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  if difficulty not in ('beginner', 'developing', 'standard') then raise exception 'Invalid difficulty'; end if;
  insert into public.settings (user_id, practice_difficulty) values (target_user_id, difficulty)
  on conflict (user_id) do update set practice_difficulty = excluded.practice_difficulty;
end;
$$;
revoke execute on function public.admin_set_practice_difficulty(uuid, text) from anon, public;
grant execute on function public.admin_set_practice_difficulty(uuid, text) to authenticated;

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

-- 2026-10-13: date of birth + age bands (also in supabase/date-of-birth.sql)

-- 1) Private storage. RLS is on with NO policies and all client privileges are revoked, so nobody but the server functions can touch it.
create table if not exists public.profile_private (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  date_of_birth date not null,
  created_at timestamptz not null default now()
);
alter table public.profile_private enable row level security;
revoke all on public.profile_private from public, anon, authenticated;
grant select, insert, update, delete on public.profile_private to service_role;

-- The old self-chosen age category is no longer used; the client may not write it any more.
revoke insert (age_group), update (age_group) on public.settings from authenticated;

-- 2) Age maths (one place). Birthdays are exact: the band changes on the birthday itself.
create or replace function public.age_band_on(dob date, asof date) returns text language sql immutable as $$
  select case
    when dob is null then null
    when date_part('year', age(asof, dob)) < 10 then 'under_10'
    when date_part('year', age(asof, dob)) < 14 then '10_13'
    when date_part('year', age(asof, dob)) < 18 then '14_17'
    else '18_plus' end
$$;
create or replace function public.lb_board_for(band text) returns text language sql immutable as $$
  select case band when 'under_10' then 'under_10' when '10_13' then '10_17' when '14_17' then '10_17' when '18_plus' then '18_plus' end
$$;
create or replace function public.lb_board_of(uid uuid) returns text language sql stable security definer set search_path = public as $$
  select public.lb_board_for(public.age_band_on(d.date_of_birth, current_date)) from public.profile_private d where d.user_id = uid
$$;

-- 3) What the app can call. Returns the band only, never the date.
create or replace function public.set_my_date_of_birth(p_dob date) returns text
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_dob is null or p_dob > current_date - interval '3 years' or p_dob < current_date - interval '110 years' then raise exception 'Invalid date of birth'; end if;
  if exists (select 1 from public.profile_private where user_id = auth.uid()) then raise exception 'Date of birth already set'; end if;
  insert into public.profile_private (user_id, date_of_birth) values (auth.uid(), p_dob);
  return public.age_band_on(p_dob, current_date);
end;
$$;
create or replace function public.my_age_band() returns text language sql stable security definer set search_path = public as $$
  select public.age_band_on(d.date_of_birth, current_date) from public.profile_private d where d.user_id = auth.uid()
$$;
-- Admin (teacher) only: read a student's band, and correct a wrongly entered date of birth (users cannot change it themselves).
create or replace function public.admin_age_band(target_user_id uuid) returns text language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  return (select public.age_band_on(d.date_of_birth, current_date) from public.profile_private d where d.user_id = target_user_id);
end;
$$;
create or replace function public.admin_set_date_of_birth(target_user_id uuid, p_dob date) returns text language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  if p_dob is null or p_dob > current_date - interval '3 years' or p_dob < current_date - interval '110 years' then raise exception 'Invalid date of birth'; end if;
  insert into public.profile_private (user_id, date_of_birth) values (target_user_id, p_dob)
  on conflict (user_id) do update set date_of_birth = excluded.date_of_birth;
  return public.age_band_on(p_dob, current_date);
end;
$$;

-- 4) Leaderboard: the category comes from the date of birth. Same scoring and ranking as before; same function signatures.
create or replace function public.lb_eligible()
returns table (user_id uuid, display_name text, board text)
language sql stable security definer set search_path = public as $$
  select x.user_id,
    case when x.band in ('under_10', '10_13', '14_17') then left(split_part(trim(x.name), ' ', 1), 30)
         else left(regexp_replace(trim(x.name), '^(\S+)\s+.*?(\S)\S*$', '\1 \2.'), 30) end,
    public.lb_board_for(x.band)
  from (
    select s.user_id, p.name, public.age_band_on(d.date_of_birth, current_date) as band, s.leaderboard_opt_in, s.leaderboard_hidden
    from public.settings s join public.profiles p on p.id = s.user_id join public.profile_private d on d.user_id = s.user_id
  ) x
  where x.leaderboard_opt_in and not x.leaderboard_hidden and length(trim(coalesce(x.name, ''))) > 0
$$;

create or replace function public.leaderboard(p_category text, p_period text, p_level text default 'all', p_limit integer default 20)
returns table (pos bigint, display_name text, score numeric, detail integer, level text, is_me boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50); v_board text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not coalesce((select s.leaderboard_opt_in from public.settings s where s.user_id = auth.uid()), false) then raise exception 'Join the leaderboard first'; end if;
  v_board := public.lb_board_of(auth.uid());
  if v_board is null then raise exception 'Add your date of birth first'; end if;
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
  select coalesce(s.leaderboard_opt_in, false) into v_in from public.settings s where s.user_id = auth.uid();
  v_in := coalesce(v_in, false);
  v_board := public.lb_board_of(auth.uid());
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

-- A tempo unlocks after 1 comfortable minute for under 14 (bands under_10 and 10_13), 2 otherwise.
create or replace function public.lb_unlocks()
returns table (user_id uuid, exercise text, tempo integer, unlocked_on date, tier text)
language sql stable security definer set search_path = public as $$
  with q as (
    select v.user_id as uid, v.exercise as ex, v.tempo as t, v.practiced_on as d,
      sum(v.minutes) over (partition by v.user_id, v.exercise, v.tempo order by v.practiced_on) as running
    from public.lb_valid_sessions() v where v.rating in ('comfortable', 'mastered')
  ), firsts as (
    select distinct on (q.uid, q.ex, q.t) q.uid, q.ex, q.t, q.d
    from q left join public.profile_private dd on dd.user_id = q.uid
    where q.running >= case when public.age_band_on(dd.date_of_birth, current_date) in ('under_10', '10_13') then 1 else 2 end
    order by q.uid, q.ex, q.t, q.d
  )
  select f.uid, f.ex, f.t, f.d, public.lb_tier(public.lb_exercise_profile(f.ex), f.t) from firsts f
$$;

-- 5) Permissions: internal helpers are not callable from the app; only these are, and only when signed in.
revoke all on function public.age_band_on(date, date), public.lb_board_for(text), public.lb_board_of(uuid), public.lb_eligible(), public.lb_unlocks() from public, anon, authenticated;
revoke all on function public.set_my_date_of_birth(date), public.my_age_band(), public.admin_age_band(uuid), public.admin_set_date_of_birth(uuid, date) from public, anon;
revoke all on function public.leaderboard(text, text, text, integer), public.leaderboard_summary() from public, anon;
grant execute on function public.set_my_date_of_birth(date) to authenticated;
grant execute on function public.my_age_band() to authenticated;
grant execute on function public.admin_age_band(uuid) to authenticated;
grant execute on function public.admin_set_date_of_birth(uuid, date) to authenticated;
grant execute on function public.leaderboard(text, text, text, integer) to authenticated;
grant execute on function public.leaderboard_summary() to authenticated;

-- 2026-10-13: wood is the default metronome sound for new accounts
alter table public.settings alter column metronome_tone set default 'wood';

-- 2026-10-13: Flamacue joins the 180 BPM ladder
create or replace function public.lb_exercise_profile(exercise_name text) returns text language sql immutable as $$
  select case
    when exercise_name = 'Bass Drum - Heel Down' then 'footwork'
    when exercise_name in ('Single Strokes Seven', 'Single Drag Tap', 'Flamacue') then 'cap180'
    when exercise_name in ('Double Paradiddle', 'Triple Paradiddle', 'Paradiddle-Diddle', 'Flam', 'Single Strokes Four') then 'extended'
    else 'default' end
$$;

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

-- 2026-10-14: Flam Paradiddle-diddle joins the 180 BPM ladder
create or replace function public.lb_exercise_profile(exercise_name text) returns text language sql immutable as $$
  select case
    when exercise_name = 'Bass Drum - Heel Down' then 'footwork'
    when exercise_name in ('Single Strokes Seven', 'Single Drag Tap', 'Flamacue', 'Flam Paradiddle-diddle') then 'cap180'
    when exercise_name in ('Double Paradiddle', 'Triple Paradiddle', 'Paradiddle-Diddle', 'Flam', 'Single Strokes Four') then 'extended'
    else 'default' end
$$;

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
