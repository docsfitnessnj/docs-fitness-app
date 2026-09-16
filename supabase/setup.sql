-- Doc's Fitness — Tier 1 backend foundation
-- ============================================================================
-- Run this ENTIRE file (except the block at the very bottom) once, in the
-- Supabase SQL Editor for this project, before using real accounts in the
-- app. It creates every table, security rule, and storage bucket the app
-- needs. It is safe to re-run: every statement uses "if not exists" /
-- "or replace" / "drop ... if exists" so running it twice does not duplicate
-- anything or wipe data that already exists.
--
-- After running this file, read the block at the very bottom of this file —
-- it must be run separately, after Doc has created his own account in the
-- app, to make that account an admin.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- PROFILES
-- One row per member, keyed to their real login (auth.users). Stores the
-- stuff people see about each other: display name, Instagram handle,
-- favorite quote, profile photo, whether they train online or at the
-- Boathouse, and whether they're an admin (Doc).
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  instagram_handle text not null default '',
  favorite_quote text not null default '',
  avatar_url text,
  how_train text check (how_train in ('online', 'boathouse')),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles are readable by any signed-in member" on public.profiles;
create policy "profiles are readable by any signed-in member"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "members can insert their own profile" on public.profiles;
create policy "members can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

drop policy if exists "members can update their own profile" on public.profiles;
create policy "members can update their own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Checks whether a given user is an admin — used throughout the policies
-- and triggers below. Ordinary SQL function (not security definer): every
-- signed-in member can already read every row of profiles (see the select
-- policy above), so this never needs elevated privileges.
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = uid), false);
$$;

-- A brand-new login (sign-up) automatically gets a blank profile row, so the
-- rest of the app never has to special-case "no profile yet."
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, created_at)
  values (new.id, coalesce(nullif(split_part(new.email, '@', 1), ''), 'Member'), now())
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- COMMUNITY: posts, comments, reactions
-- Every member reads the same feed. Posting/commenting/reacting is limited
-- to your own rows; pinning and moderating other members' posts is admin
-- only — enforced here in the database, not just hidden in the UI.
-- ----------------------------------------------------------------------------
create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  title text not null default '',
  body text not null default '',
  category text not null default 'General',
  kind text not null default 'text' check (kind in ('text', 'wod')),
  media_url text,
  media_type text check (media_type in ('image', 'video')),
  -- Only meaningful when kind = 'wod' — mirrors the app's WodPostMeta.
  workout_title text,
  workout_notes text,
  workout_results_line text,
  linked_workout_day_key text,
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.community_posts enable row level security;

drop policy if exists "posts are readable by any signed-in member" on public.community_posts;
create policy "posts are readable by any signed-in member"
  on public.community_posts for select
  to authenticated
  using (true);

drop policy if exists "members can post as themselves" on public.community_posts;
create policy "members can post as themselves"
  on public.community_posts for insert
  to authenticated
  with check (author_id = auth.uid());

drop policy if exists "own post or admin can edit" on public.community_posts;
create policy "own post or admin can edit"
  on public.community_posts for update
  to authenticated
  using (author_id = auth.uid() or public.is_admin(auth.uid()))
  with check (author_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "own post or admin can delete" on public.community_posts;
create policy "own post or admin can delete"
  on public.community_posts for delete
  to authenticated
  using (author_id = auth.uid() or public.is_admin(auth.uid()));

-- Pinning rules that must hold no matter what: only an admin can change
-- `pinned`, and at most 3 posts can be pinned at once. A blanket UPDATE
-- policy can't express "this one column, only for admins" — a trigger can.
create or replace function public.enforce_post_pin_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pin_is_changing boolean;
  other_pinned_count integer;
begin
  if tg_op = 'INSERT' then
    pin_is_changing := new.pinned;
  else
    pin_is_changing := new.pinned is distinct from old.pinned;
  end if;

  if not pin_is_changing then
    return new;
  end if;

  if not public.is_admin(auth.uid()) then
    raise exception 'Only an admin can pin or unpin a post.';
  end if;

  if new.pinned then
    if tg_op = 'INSERT' then
      select count(*) into other_pinned_count from public.community_posts where pinned = true;
    else
      select count(*) into other_pinned_count
      from public.community_posts
      where pinned = true and id <> old.id;
    end if;

    if other_pinned_count >= 3 then
      raise exception 'At most 3 posts can be pinned at a time.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists community_posts_pin_rules on public.community_posts;
create trigger community_posts_pin_rules
  before insert or update on public.community_posts
  for each row execute function public.enforce_post_pin_rules();

create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  -- Non-null for a reply to another comment — makes the thread structure
  -- real in the data, even though today's UI only shows one flat level.
  parent_comment_id uuid references public.community_comments (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.community_comments enable row level security;

drop policy if exists "comments are readable by any signed-in member" on public.community_comments;
create policy "comments are readable by any signed-in member"
  on public.community_comments for select
  to authenticated
  using (true);

drop policy if exists "members can comment as themselves" on public.community_comments;
create policy "members can comment as themselves"
  on public.community_comments for insert
  to authenticated
  with check (author_id = auth.uid());

drop policy if exists "own comment or admin can edit" on public.community_comments;
create policy "own comment or admin can edit"
  on public.community_comments for update
  to authenticated
  using (author_id = auth.uid() or public.is_admin(auth.uid()))
  with check (author_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "own comment or admin can delete" on public.community_comments;
create policy "own comment or admin can delete"
  on public.community_comments for delete
  to authenticated
  using (author_id = auth.uid() or public.is_admin(auth.uid()));

create table if not exists public.community_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (post_id, author_id, emoji)
);

alter table public.community_reactions enable row level security;

drop policy if exists "reactions are readable by any signed-in member" on public.community_reactions;
create policy "reactions are readable by any signed-in member"
  on public.community_reactions for select
  to authenticated
  using (true);

drop policy if exists "members can react as themselves" on public.community_reactions;
create policy "members can react as themselves"
  on public.community_reactions for insert
  to authenticated
  with check (author_id = auth.uid());

drop policy if exists "members can remove their own reaction" on public.community_reactions;
create policy "members can remove their own reaction"
  on public.community_reactions for delete
  to authenticated
  using (author_id = auth.uid());

-- ----------------------------------------------------------------------------
-- WORKOUT TRACKING: WOD completions, Deck completions, Weekly Challenge
-- entries. All strictly private to the member who logged them (this is
-- "My Workouts" data) — the one exception is Challenge entries, which also
-- feed the live, shared leaderboard, so every member can read every entry.
-- ----------------------------------------------------------------------------
create table if not exists public.wod_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  day_key text not null,
  workout_title text not null default '',
  date_label text not null default '',
  workout_timestamp bigint not null default 0,
  rounds text not null default '',
  time_taken text not null default '',
  kettlebell_kg numeric,
  notes text not null default '',
  media_url text,
  media_type text check (media_type in ('image', 'video')),
  completed_at timestamptz not null default now(),
  unique (user_id, day_key)
);

alter table public.wod_completions enable row level security;

drop policy if exists "members manage only their own WOD completions" on public.wod_completions;
create policy "members manage only their own WOD completions"
  on public.wod_completions for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table if not exists public.deck_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  card_id text not null,
  completed_at timestamptz not null default now(),
  unique (user_id, card_id)
);

alter table public.deck_completions enable row level security;

drop policy if exists "members manage only their own deck completions" on public.deck_completions;
create policy "members manage only their own deck completions"
  on public.deck_completions for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table if not exists public.challenge_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  challenge_title text not null,
  kettlebell_kg numeric not null,
  rounds text not null default '',
  reps text,
  time_taken text not null default '',
  -- Vestigial: the app computes the Boathouse Crew / Online label live from
  -- each member's own profile (see ChallengeContext.tsx) rather than
  -- reading this column, but it's kept (with a harmless default) rather
  -- than dropped, since removing a column is a bigger, less reversible
  -- change than just not using one.
  tag text not null default 'Online' check (tag in ('Boathouse Crew', 'Online')),
  created_at timestamptz not null default now()
);

alter table public.challenge_entries enable row level security;

drop policy if exists "challenge entries are readable by any signed-in member" on public.challenge_entries;
create policy "challenge entries are readable by any signed-in member"
  on public.challenge_entries for select
  to authenticated
  using (true);

drop policy if exists "members can post their own challenge entry" on public.challenge_entries;
create policy "members can post their own challenge entry"
  on public.challenge_entries for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "members manage only their own challenge entries" on public.challenge_entries;
create policy "members manage only their own challenge entries"
  on public.challenge_entries for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "members can delete their own challenge entry" on public.challenge_entries;
create policy "members can delete their own challenge entry"
  on public.challenge_entries for delete
  to authenticated
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- BADGES
-- One row per badge a member holds. DAY ONE DOUG and HUNDRED DOWN are
-- permanent (period_key stays ''); ON FIRE, COW KILLER and THE REGULAR are
-- weekly (period_key is a stable id for that Monday-anchored week, currently
-- the week's start time in epoch milliseconds) so they naturally "reset"
-- every Monday without deleting anything — the app just checks for a row
-- matching the *current* week. Everyone can see everyone's badges;
-- members can only grant themselves the 5 badges that are computed from
-- their own activity, and only for themselves. THE JOKER can only be
-- granted (to anyone) or revoked by an admin — see Member Manager.
-- ----------------------------------------------------------------------------
create table if not exists public.badge_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  badge_id text not null check (
    badge_id in ('joker', 'on_fire', 'cow_killer', 'the_regular', 'day_one_doug', 'hundred_down')
  ),
  period_key text not null default '',
  granted_by uuid references public.profiles (id),
  granted_at timestamptz not null default now(),
  unique (user_id, badge_id, period_key)
);

alter table public.badge_grants enable row level security;

drop policy if exists "badges are readable by any signed-in member" on public.badge_grants;
create policy "badges are readable by any signed-in member"
  on public.badge_grants for select
  to authenticated
  using (true);

drop policy if exists "members can earn their own computed badges, admin can grant any" on public.badge_grants;
create policy "members can earn their own computed badges, admin can grant any"
  on public.badge_grants for insert
  to authenticated
  with check (
    public.is_admin(auth.uid())
    or (
      user_id = auth.uid()
      and badge_id in ('on_fire', 'cow_killer', 'the_regular', 'day_one_doug', 'hundred_down')
    )
  );

drop policy if exists "only admin can revoke a badge" on public.badge_grants;
create policy "only admin can revoke a badge"
  on public.badge_grants for delete
  to authenticated
  using (public.is_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- STORAGE: avatars bucket
-- Judgment call: the bucket is public for *viewing* (a plain image URL, the
-- same approach essentially every app takes for profile photos, and it
-- avoids every avatar everywhere in the app needing a refreshed signed URL)
-- — but only the owner can ever upload, replace, or delete their own photo,
-- enforced below. Files are stored as "<user id>/<filename>" so ownership
-- can be checked directly from the path.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatar images are publicly viewable" on storage.objects;
create policy "avatar images are publicly viewable"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

drop policy if exists "members can upload their own avatar" on storage.objects;
create policy "members can upload their own avatar"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "members can replace their own avatar" on storage.objects;
create policy "members can replace their own avatar"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "members can delete their own avatar" on storage.objects;
create policy "members can delete their own avatar"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================================
-- Everything above this line is the full backend. Run it once, in full.
-- ============================================================================


-- ============================================================================
-- RUN THIS BLOCK SEPARATELY AFTER DOC CREATES HIS OWN ACCOUNT IN THE APP
-- ============================================================================
-- Sign up for a real account in the app first (the normal WELCOME screen —
-- email + password), so a profile row exists to promote. Then come back
-- here, replace YOUR_EMAIL_HERE with the exact email used to sign up, and
-- run just this statement by itself.

update public.profiles
set is_admin = true
where id = (select id from auth.users where email = 'YOUR_EMAIL_HERE');
