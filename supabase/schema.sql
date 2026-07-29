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
drop policy if exists "members can view their group's membership" on public.group_members;
create policy "members can view their group's membership" on public.group_members for select to authenticated using (
  exists (select 1 from public.group_members m where m.group_id = group_members.group_id and m.user_id = auth.uid())
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
