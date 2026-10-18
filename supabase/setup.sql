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
  -- In-person plans (Monthly Unlimited, 10 Class Pack, Drop In) are still
  -- simulated — no real in-person billing yet — but the selection is stored
  -- here (not just the selecting device's local storage) so Member Manager
  -- can see it too. See admin_list_members() below.
  in_person_plan text check (in_person_plan in ('monthly_unlimited', 'ten_pack', 'drop_in')),
  is_admin boolean not null default false,
  -- Monthly Unlimited's SHOW TOMORROW'S WORKOUT setting (Settings &
  -- Notifications > IN PERSON). Defaults on so nobody's view changes until
  -- they deliberately turn it off; every other membership tier ignores it.
  show_tomorrows_workout boolean not null default true,
  -- The spotlight tour's once-ever flag, moved here (from browser
  -- localStorage) by migration_010 — set the moment the tour is completed
  -- or explicitly skipped, so it never fires again for this account on any
  -- device it signs into. NULL means "never completed or skipped."
  tour_completed_at timestamptz,
  -- Admin's per-member mute flag for DOC'S GROUP CHAT (Member Manager),
  -- added by migration_012. Blocks posting only — a muted member can still
  -- read the chat and react.
  group_chat_muted boolean not null default false,
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

-- Admin needs to write OTHER members' rows too — group_chat_muted from
-- Member Manager, added by migration_012. Same shape as "own post or admin
-- can edit" on community_posts.
drop policy if exists "admin can update any profile" on public.profiles;
create policy "admin can update any profile"
  on public.profiles for update
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

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
  -- Added by migration_017.sql — a comment's only supported media kind is
  -- a GIF (GIPHY-powered), not a general photo/video attachment feature;
  -- media_url is GIPHY's own CDN URL, same shape (url + type) as every
  -- other media-bearing table in this schema, just narrower in what
  -- media_type allows for now.
  media_url text,
  media_type text check (media_type in ('gif')),
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
-- CHALLENGES
-- One row per published Weekly Challenge (Doc's Content Library is
-- otherwise entirely on-device — see ContentLibraryContext.tsx), mirrored
-- here purely so the COW CHAMP award job below can determine a closed
-- challenge's own scoring type and week window without any client needing
-- to be open. `id` matches the Content Library entry's own id. Doc's admin
-- app upserts a row here the moment she publishes a Challenge.
-- ----------------------------------------------------------------------------
create table if not exists public.challenges (
  id text primary key,
  title text not null,
  scoring_type text not null check (scoring_type in ('time', 'rounds', 'rounds_reps')),
  week_start timestamptz not null,
  week_end timestamptz not null,
  -- Set once the award job below has processed this challenge's close, so a
  -- later run never re-scores (and re-badges) the same week twice.
  champion_awarded_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.challenges enable row level security;

drop policy if exists "challenges are readable by any signed-in member" on public.challenges;
create policy "challenges are readable by any signed-in member"
  on public.challenges for select
  to authenticated
  using (true);

drop policy if exists "only admin can add a challenge" on public.challenges;
create policy "only admin can add a challenge"
  on public.challenges for insert
  to authenticated
  with check (public.is_admin(auth.uid()));

drop policy if exists "only admin can update a challenge" on public.challenges;
create policy "only admin can update a challenge"
  on public.challenges for update
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- BADGES
-- One row per badge a member holds. DAY ONE DOUG and HUNDRED DOWN are
-- permanent (period_key stays ''); ON FIRE, COW KILLER and THE REGULAR are
-- weekly (period_key is a stable id for that Monday-anchored week, currently
-- the week's start time in epoch milliseconds) so they naturally "reset"
-- every Monday without deleting anything — the app just checks for a row
-- matching the *current* week. COW CHAMP is permanent but stacks: one row
-- per week won, period_key set to that week's `challenges.id` so the same
-- challenge can never award it twice but a member can hold many rows over
-- time — the count of those rows is the "x2"/"x3" the app shows. Everyone
-- can see everyone's badges; members can only grant themselves the 5
-- badges that are computed from their own activity, and only for
-- themselves. THE JOKER can only be granted (to anyone) or revoked by an
-- admin — see Member Manager. COW CHAMP is never member-grantable at all —
-- only the award_cow_champ_for_closed_challenges() job below (running as a
-- security definer function, same as this file's other automated triggers)
-- can insert it.
-- ----------------------------------------------------------------------------
create table if not exists public.badge_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  badge_id text not null check (
    badge_id in ('joker', 'on_fire', 'cow_killer', 'the_regular', 'day_one_doug', 'hundred_down', 'cow_champ')
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
-- COW CHAMP award — runs automatically when a Challenge closes (Saturday
-- 12:00pm ET). Backend logic, not client code: a scheduled job (pg_cron,
-- below) calls award_cow_champ_for_closed_challenges() on its own, so the
-- badge lands even if the winner never opens the app that day. It
-- replicates the same scoring math the live leaderboard uses on the client
-- (ChallengeContext.tsx's parseTimeToSeconds/parseRoundsReps) so the two
-- never disagree about who was in first place.
-- ----------------------------------------------------------------------------

-- Converts one challenge_entries row into a single comparable number, the
-- same way the app's own live leaderboard does: for 'time' scoring, lower
-- is better (an unparseable time sorts to +infinity, i.e. last place); for
-- 'rounds'/'rounds_reps', higher is better (an unparseable rounds value
-- sorts to -infinity, i.e. last place).
create or replace function public.cow_champ_sort_value(
  p_scoring_type text, p_time_taken text, p_rounds text, p_reps text
) returns numeric
language plpgsql
immutable
as $$
declare
  colon_match text[];
begin
  if p_scoring_type = 'time' then
    colon_match := regexp_match(trim(coalesce(p_time_taken, '')), '^(\d+):(\d{1,2})$');
    if colon_match is not null then
      return colon_match[1]::numeric * 60 + colon_match[2]::numeric;
    end if;
    begin
      return trim(p_time_taken)::numeric;
    exception when others then
      return 'infinity'::numeric;
    end;
  else
    declare
      rounds_num numeric;
      reps_num numeric;
    begin
      begin
        rounds_num := trim(p_rounds)::numeric;
      exception when others then
        return '-infinity'::numeric;
      end;
      begin
        reps_num := trim(coalesce(p_reps, '0'))::numeric;
      exception when others then
        reps_num := 0;
      end;
      return rounds_num * 1000 + reps_num;
    end;
  end if;
end;
$$;

-- For every challenge whose week has closed and hasn't been scored yet:
-- finds the best sort_value among its entries, grants COW CHAMP (period_key
-- = that challenge's id, so it can never double-award the same week) to
-- every entry tied for that value, then marks the challenge processed.
-- security definer (same as handle_new_user/enforce_post_pin_rules above)
-- so it can insert into badge_grants regardless of that table's own RLS,
-- which deliberately gives no one else insert access to 'cow_champ'.
create or replace function public.award_cow_champ_for_closed_challenges()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  best_value numeric;
begin
  for c in
    select * from public.challenges
    where week_end <= now() and champion_awarded_at is null
  loop
    if c.scoring_type = 'time' then
      select min(public.cow_champ_sort_value(c.scoring_type, time_taken, rounds, reps))
        into best_value
      from public.challenge_entries
      where challenge_title = c.title
        and created_at >= c.week_start and created_at < c.week_end;
    else
      select max(public.cow_champ_sort_value(c.scoring_type, time_taken, rounds, reps))
        into best_value
      from public.challenge_entries
      where challenge_title = c.title
        and created_at >= c.week_start and created_at < c.week_end;
    end if;

    if best_value is not null and best_value not in ('infinity'::numeric, '-infinity'::numeric) then
      insert into public.badge_grants (user_id, badge_id, period_key)
      select distinct user_id, 'cow_champ', c.id
      from public.challenge_entries
      where challenge_title = c.title
        and created_at >= c.week_start and created_at < c.week_end
        and public.cow_champ_sort_value(c.scoring_type, time_taken, rounds, reps) = best_value
      on conflict (user_id, badge_id, period_key) do nothing;
    end if;

    update public.challenges set champion_awarded_at = now() where id = c.id;
  end loop;
end;
$$;

-- Schedules the function above to run every 15 minutes, year round.
-- Challenges now close Saturday 12:00pm ET, which is 4pm or 5pm UTC
-- depending on the time of year (EDT vs EST) — rather than hardcode a
-- fixed UTC cron time that would drift an hour off twice a year at each
-- Daylight Saving change, this runs often enough that the real close
-- instant recorded in `challenges.week_end` (a timestamptz, already
-- correct for whichever offset was in effect — see
-- lib/challengeSchedule.ts on the client, which computes it the same way)
-- is always caught within 15 minutes, in every season. Requires the
-- pg_cron extension — on Supabase this is usually turned on from the
-- dashboard (Database -> Extensions -> pg_cron) rather than by SQL alone;
-- if the "create extension" line below errors with a permission message,
-- enable it there first and then re-run just this block.
create extension if not exists pg_cron;

do $$
declare
  existing_job_id bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- Drop the old once-a-week Monday job this replaces, if present.
    select jobid into existing_job_id from cron.job where jobname = 'award-cow-champ-weekly';
    if existing_job_id is not null then
      perform cron.unschedule(existing_job_id);
    end if;

    select jobid into existing_job_id from cron.job where jobname = 'award-cow-champ-check';
    if existing_job_id is not null then
      perform cron.unschedule(existing_job_id);
    end if;
    perform cron.schedule(
      'award-cow-champ-check',
      '*/15 * * * *',
      $cron$select public.award_cow_champ_for_closed_challenges();$cron$
    );
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- FOUNDING 50 LAUNCH OFFER
-- The first 50 online members to claim a spot during a launch window Doc
-- sets (see FOUNDING 50 LAUNCH in the admin area) get MONTHLY (ONLINE)
-- locked at $37/month instead of $57. One settings row holds the window
-- (starts_at/ends_at, both real UTC instants converted from whatever
-- Eastern-time date+time Doc enters); one row per member who's actually
-- claimed a spot — real, permanent database rows, not a number the app
-- just makes up, so the live count on the Memberships screen is always
-- exactly right no matter which device or account is looking at it.
-- ----------------------------------------------------------------------------
create table if not exists public.founding_fifty_settings (
  id int primary key default 1,
  starts_at timestamptz,
  ends_at timestamptz,
  constraint founding_fifty_settings_singleton check (id = 1)
);

alter table public.founding_fifty_settings enable row level security;

drop policy if exists "founding fifty settings readable by any signed-in member" on public.founding_fifty_settings;
create policy "founding fifty settings readable by any signed-in member"
  on public.founding_fifty_settings for select
  to authenticated
  using (true);

drop policy if exists "only admin can set the founding fifty launch window" on public.founding_fifty_settings;
create policy "only admin can set the founding fifty launch window"
  on public.founding_fifty_settings for update
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

insert into public.founding_fifty_settings (id, starts_at, ends_at)
values (1, null, null)
on conflict (id) do nothing;

create table if not exists public.founding_fifty_members (
  id uuid primary key references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now()
);

alter table public.founding_fifty_members enable row level security;

drop policy if exists "founding fifty roster readable by any signed-in member" on public.founding_fifty_members;
create policy "founding fifty roster readable by any signed-in member"
  on public.founding_fifty_members for select
  to authenticated
  using (true);

-- Claiming a spot used to be a plain member-initiated insert (the original
-- launch-offer round). Once real Stripe billing exists (see the STRIPE
-- SUBSCRIPTIONS section below), claiming a spot is a side effect of a real,
-- completed Checkout at the founding price, done by the Stripe webhook
-- (service role, bypasses RLS) — never something a signed-in member's own
-- browser session can insert directly anymore. An admin can still add
-- someone by hand (e.g. comping a spot).
drop policy if exists "members can claim their own founding fifty spot" on public.founding_fifty_members;
drop policy if exists "an admin can add a founding fifty member" on public.founding_fifty_members;
create policy "an admin can add a founding fifty member"
  on public.founding_fifty_members for insert
  to authenticated
  with check (public.is_admin(auth.uid()));

-- Hard server-side cap at 50 — the app itself already stops offering the
-- card once 50 are claimed, but this guarantees it even if two members
-- somehow claim the very last spot at the same instant.
create or replace function public.enforce_founding_fifty_capacity()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.founding_fifty_members) >= 50 then
    raise exception 'The Founding 50 is sold out.';
  end if;
  return new;
end;
$$;

drop trigger if exists founding_fifty_capacity_check on public.founding_fifty_members;
create trigger founding_fifty_capacity_check
  before insert on public.founding_fifty_members
  for each row execute function public.enforce_founding_fifty_capacity();

-- founding_fifty_public_status(): the launch window and claimed COUNT are
-- public marketing facts — the About page (the one screen a logged-out
-- stranger sees) needs them to show the founding offer during launch
-- weekend, but a signed-out client can't read either table above at all
-- (both are `to authenticated` only). This narrow function returns just
-- starts_at/ends_at/claimed_count — never the founding_fifty_members roster
-- itself, so no member's name, id, or join date is ever exposed to an
-- anonymous visitor.
create or replace function public.founding_fifty_public_status()
returns table (
  starts_at timestamptz,
  ends_at timestamptz,
  claimed_count integer
)
language sql
security definer
set search_path = public
stable
as $$
  select
    (select s.starts_at from public.founding_fifty_settings s where s.id = 1),
    (select s.ends_at from public.founding_fifty_settings s where s.id = 1),
    (select count(*)::integer from public.founding_fifty_members);
$$;

grant execute on function public.founding_fifty_public_status() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- MESSAGE DOC — one real, private inbox thread per member
-- Scope is strictly member <-> Doc, never member <-> member. One thread per
-- member (keyed by their own id, doc_threads.member_id), holding both sides'
-- "last read" timestamps so the gold unread dot (member's MESSAGE DOC row,
-- and Doc's inbox list) is real, shared, per-account state instead of a
-- device-local guess. doc_messages holds the actual back-and-forth; a
-- member can only read/write their own thread, admin can read/write every
-- thread — exactly the same shape as every other admin-vs-member table in
-- this file.
-- ----------------------------------------------------------------------------
create table if not exists public.doc_threads (
  member_id uuid primary key references public.profiles (id) on delete cascade,
  member_last_read_at timestamptz not null default now(),
  admin_last_read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.doc_threads enable row level security;

drop policy if exists "a member reads their own thread, admin reads every thread" on public.doc_threads;
create policy "a member reads their own thread, admin reads every thread"
  on public.doc_threads for select
  to authenticated
  using (member_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "a member's thread is created by themselves or by admin" on public.doc_threads;
create policy "a member's thread is created by themselves or by admin"
  on public.doc_threads for insert
  to authenticated
  with check (member_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "a member marks their own thread read, admin marks any thread read" on public.doc_threads;
create policy "a member marks their own thread read, admin marks any thread read"
  on public.doc_threads for update
  to authenticated
  using (member_id = auth.uid() or public.is_admin(auth.uid()))
  with check (member_id = auth.uid() or public.is_admin(auth.uid()));

create table if not exists public.doc_messages (
  id uuid primary key default gen_random_uuid(),
  -- Whose thread this belongs to — the member's own messages AND Doc's
  -- replies to them both carry this same member_id, so the whole
  -- conversation is one simple "where member_id = X" query either side.
  member_id uuid not null references public.profiles (id) on delete cascade,
  -- Who actually wrote this particular message — the member themselves, or
  -- whichever admin account replied as Doc.
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null default '',
  media_url text,
  media_type text check (media_type in ('image', 'video')),
  voice_url text,
  voice_duration_ms integer,
  created_at timestamptz not null default now()
);

alter table public.doc_messages enable row level security;

drop policy if exists "a member reads their own thread's messages, admin reads every thread's messages" on public.doc_messages;
create policy "a member reads their own thread's messages, admin reads every thread's messages"
  on public.doc_messages for select
  to authenticated
  using (member_id = auth.uid() or public.is_admin(auth.uid()));

-- A member can only ever post into their own thread, and only as
-- themselves — never as "Doc". An admin can post as themselves into any
-- member's thread (that's Doc replying).
drop policy if exists "members write into their own thread as themselves, admin replies into any thread" on public.doc_messages;
create policy "members write into their own thread as themselves, admin replies into any thread"
  on public.doc_messages for insert
  to authenticated
  with check (sender_id = auth.uid() and (member_id = auth.uid() or public.is_admin(auth.uid())));

drop policy if exists "the sender or admin can unsend a message" on public.doc_messages;
create policy "the sender or admin can unsend a message"
  on public.doc_messages for delete
  to authenticated
  using (sender_id = auth.uid() or public.is_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- STORAGE: message-media bucket
-- Photo/video attachments and voice notes sent through MESSAGE DOC, so a
-- photo a member sends is actually visible to Doc from her own device (not
-- just a local file URI that never leaves the sender's phone). Same public-
-- read-but-owner-write shape as the avatars bucket, except "owner" here
-- means the member who owns that thread's folder OR an admin replying into
-- it — files live at "<member id>/<filename>", same folder-ownership check
-- as avatars.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('message-media', 'message-media', true)
on conflict (id) do nothing;

drop policy if exists "message attachments are publicly viewable" on storage.objects;
create policy "message attachments are publicly viewable"
  on storage.objects for select
  to public
  using (bucket_id = 'message-media');

drop policy if exists "a member uploads into their own thread, admin uploads into any thread" on storage.objects;
create policy "a member uploads into their own thread, admin uploads into any thread"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'message-media'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin(auth.uid()))
  );

drop policy if exists "the sender or admin can delete a message attachment" on storage.objects;
create policy "the sender or admin can delete a message attachment"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'message-media'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin(auth.uid()))
  );

-- ----------------------------------------------------------------------------
-- STRIPE SUBSCRIPTIONS (ONLINE TIERS)
-- Real billing for the three ONLINE plans (Monthly $57, the Founding 50
-- rate $37, Annual $513) via Stripe Checkout + a webhook. In-person plans
-- (Monthly Unlimited, 10 Class Pack, Drop In) are untouched and stay
-- simulated — this section is online-only.
--
-- subscriptions: one row per member, the real truth about their online
-- billing. Written ONLY by the stripe-webhook Edge Function's service role
-- key, which bypasses RLS entirely — there is deliberately no write policy
-- for a signed-in member's own session below, so a member's access can
-- never change from anything other than a real Stripe event.
--
-- stripe_events: a permanent log of every webhook event received, for
-- Doc's future Command Center and for debugging — admin-readable only,
-- also service-role-write-only.
-- ----------------------------------------------------------------------------
create table if not exists public.subscriptions (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  price_id text,
  plan text check (plan in ('monthly', 'annual', 'founding')),
  -- Mirrors Stripe's own subscription.status values verbatim (trialing,
  -- active, past_due, canceled, incomplete, incomplete_expired, unpaid).
  status text,
  current_period_end timestamptz,
  trial_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

drop policy if exists "a member reads their own subscription, admin reads every subscription" on public.subscriptions;
create policy "a member reads their own subscription, admin reads every subscription"
  on public.subscriptions for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()));

-- No insert/update/delete policy for `authenticated` at all — only the
-- Stripe webhook's service role key can ever write here.

create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now()
);

alter table public.stripe_events enable row level security;

drop policy if exists "only admin can read the stripe event log" on public.stripe_events;
create policy "only admin can read the stripe event log"
  on public.stripe_events for select
  to authenticated
  using (public.is_admin(auth.uid()));

-- Same as subscriptions above: no write policy for `authenticated` — only
-- the webhook's service-role key ever inserts here. The event id itself is
-- the primary key, so a redelivered event (Stripe retries on timeout) is
-- safely ignored rather than double-processed.

-- admin_list_members(): the one call Member Manager needs for its full
-- roster in a single round trip — profile fields, the member's real email
-- (profiles never stores email; only auth.users does, which an ordinary
-- signed-in client can't query directly), their Founding 50 membership, and
-- their real online subscription row, all joined together. Security
-- definer so it can read auth.users, but it enforces its own admin check
-- inside rather than relying on RLS, and returns zero rows for anyone who
-- isn't an admin — never an error a non-admin caller could use to probe for
-- admin-only data.
create or replace function public.admin_list_members()
returns table (
  id uuid,
  display_name text,
  email text,
  how_train text,
  in_person_plan text,
  is_admin boolean,
  created_at timestamptz,
  founding_member boolean,
  sub_status text,
  sub_plan text,
  sub_current_period_end timestamptz,
  sub_trial_end timestamptz,
  sub_cancel_at_period_end boolean,
  group_chat_muted boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.id,
    p.display_name,
    u.email,
    p.how_train,
    p.in_person_plan,
    p.is_admin,
    p.created_at,
    (f.id is not null) as founding_member,
    s.status,
    s.plan,
    s.current_period_end,
    s.trial_end,
    s.cancel_at_period_end,
    p.group_chat_muted
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.founding_fifty_members f on f.id = p.id
  left join public.subscriptions s on s.user_id = p.id
  where public.is_admin(auth.uid())
  order by p.created_at asc;
$$;

grant execute on function public.admin_list_members() to authenticated;

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

-- ----------------------------------------------------------------------------
-- DOC'S GROUP CHAT
-- One shared, live group chat for the whole paid membership (migration_012),
-- updated by migration_013. WHO CAN USE IT: exactly the members
-- MembershipContext's `fullContentAccess` already treats as full access —
-- admin, an active trial, or any paying plan (online monthly/annual/
-- founding, or in-person Monthly Unlimited). `has_group_chat_access` mirrors
-- that exact rule in SQL so access is enforced by RLS, not just hidden in
-- the UI.
-- ----------------------------------------------------------------------------
create or replace function public.has_group_chat_access(uid uuid)
returns boolean
language sql
stable
as $$
  select
    public.is_admin(uid)
    or exists (
      select 1 from public.profiles p
      where p.id = uid and p.in_person_plan = 'monthly_unlimited'
    )
    or exists (
      select 1 from public.subscriptions s
      where s.user_id = uid and s.status in ('trialing', 'active')
    );
$$;

create or replace function public.is_group_chat_muted(uid uuid)
returns boolean
language sql
stable
as $$
  select coalesce((select p.group_chat_muted from public.profiles p where p.id = uid), false);
$$;

-- Messages: text, an optional photo or video, or both. No titles, no
-- threads, no editing — a message can only ever be soft-deleted (the
-- `deleted` flag), never changed, enforced below by a trigger (RLS alone
-- can't express "this column only"). Was photo_url-only (text, no type)
-- until migration_014.sql renamed it and added media_type — same shape as
-- community_posts.media_url/media_type and doc_messages.media_url/media_type.
create table if not exists public.group_chat_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null default '',
  media_url text,
  -- 'gif' added by migration_017.sql — a GIF message's media_url is
  -- GIPHY's own CDN URL, never a Supabase Storage path (GIPHY's terms
  -- prohibit rehosting their media), so nothing is ever uploaded for it.
  media_type text check (media_type in ('image', 'video', 'gif')),
  -- A lightweight poster frame for a video message, captured client-side
  -- at send time and uploaded alongside the video (migration_015.sql) —
  -- the message list renders only this, never the video file itself,
  -- until a member taps through to play it. Null for a photo message (the
  -- photo is its own thumbnail) or a video sent before this column existed.
  thumbnail_url text,
  deleted boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists group_chat_messages_created_at_idx
  on public.group_chat_messages (created_at desc);

alter table public.group_chat_messages enable row level security;

drop policy if exists "paid, trial, and admin members can read group chat messages" on public.group_chat_messages;
create policy "paid, trial, and admin members can read group chat messages"
  on public.group_chat_messages for select
  to authenticated
  using (public.has_group_chat_access(auth.uid()));

drop policy if exists "paid or trial members post as themselves, muted members cannot post" on public.group_chat_messages;
create policy "paid or trial members post as themselves, muted members cannot post"
  on public.group_chat_messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and public.has_group_chat_access(auth.uid())
    and not public.is_group_chat_muted(auth.uid())
  );

drop policy if exists "own message or admin can soft delete" on public.group_chat_messages;
create policy "own message or admin can soft delete"
  on public.group_chat_messages for update
  to authenticated
  using (sender_id = auth.uid() or public.is_admin(auth.uid()))
  with check (sender_id = auth.uid() or public.is_admin(auth.uid()));

-- A member can delete their own message; admin can delete any message —
-- "delete" is always this soft-delete update, never a real DELETE (no
-- delete policy exists below, so an actual DELETE is rejected outright).
-- Nothing else about a message may ever change, and a deleted message can't
-- be undeleted.
create or replace function public.enforce_group_chat_message_delete_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sender_id is distinct from old.sender_id
     or new.body is distinct from old.body
     or new.media_url is distinct from old.media_url
     or new.media_type is distinct from old.media_type
     or new.thumbnail_url is distinct from old.thumbnail_url
     or new.created_at is distinct from old.created_at then
    raise exception 'Group chat messages cannot be edited, only deleted.';
  end if;

  if old.deleted and not new.deleted then
    raise exception 'A deleted group chat message cannot be restored.';
  end if;

  return new;
end;
$$;

drop trigger if exists group_chat_messages_delete_only on public.group_chat_messages;
create trigger group_chat_messages_delete_only
  before update on public.group_chat_messages
  for each row execute function public.enforce_group_chat_message_delete_only();

-- Reactions: the same 4-emoji set as the Community feed (🤙 shaka, 🔥 fire,
-- 💪 flex, ❤️ heart — see REACTION_EMOJIS in CommunityContext.tsx). A
-- member can place at most one of each emoji on a given message (the unique
-- constraint below is what toggling on the client relies on) and can only
-- ever remove their own reaction. Originally shipped (migration_012) as a
-- single undifferentiated "cheer"; migration_013 added the `emoji` column
-- and widened the unique constraint from (message_id, member_id) to
-- (message_id, member_id, emoji) — this table definition is that end state.
create table if not exists public.group_chat_cheers (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.group_chat_messages (id) on delete cascade,
  member_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null default '🤙',
  created_at timestamptz not null default now(),
  unique (message_id, member_id, emoji)
);

create index if not exists group_chat_cheers_message_id_idx
  on public.group_chat_cheers (message_id);

alter table public.group_chat_cheers enable row level security;

drop policy if exists "paid, trial, and admin members can read cheers" on public.group_chat_cheers;
create policy "paid, trial, and admin members can read cheers"
  on public.group_chat_cheers for select
  to authenticated
  using (public.has_group_chat_access(auth.uid()));

-- Reacting is allowed even while muted — muting only turns off posting
-- messages. Blocked on an already-deleted message (nothing to react to).
drop policy if exists "members can cheer a message as themselves" on public.group_chat_cheers;
create policy "members can cheer a message as themselves"
  on public.group_chat_cheers for insert
  to authenticated
  with check (
    member_id = auth.uid()
    and public.has_group_chat_access(auth.uid())
    and exists (
      select 1 from public.group_chat_messages m
      where m.id = message_id and not m.deleted
    )
  );

drop policy if exists "members can remove their own cheer" on public.group_chat_cheers;
create policy "members can remove their own cheer"
  on public.group_chat_cheers for delete
  to authenticated
  using (member_id = auth.uid());

-- Pinned prompt: one settings row (same singleton-row pattern as
-- founding_fifty_settings) holding the single admin-set prompt shown
-- pinned under the chat header. Null/blank means "nothing pinned."
create table if not exists public.group_chat_settings (
  id int primary key default 1,
  pinned_prompt text,
  updated_at timestamptz not null default now(),
  constraint group_chat_settings_singleton check (id = 1)
);

alter table public.group_chat_settings enable row level security;

drop policy if exists "paid, trial, and admin members can read the pinned prompt" on public.group_chat_settings;
create policy "paid, trial, and admin members can read the pinned prompt"
  on public.group_chat_settings for select
  to authenticated
  using (public.has_group_chat_access(auth.uid()));

drop policy if exists "only admin can set or clear the pinned prompt" on public.group_chat_settings;
create policy "only admin can set or clear the pinned prompt"
  on public.group_chat_settings for update
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

insert into public.group_chat_settings (id, pinned_prompt)
values (1, null)
on conflict (id) do nothing;

-- STORAGE: group-chat-media bucket — same public-read / owner-write shape
-- as avatars and message-media. file_size_limit (migration_016.sql) caps a
-- single upload at Supabase's current plan maximum (50MB) explicitly,
-- instead of relying solely on the platform's own enforcement — keep in
-- sync with MAX_GROUP_CHAT_UPLOAD_BYTES in src/lib/useGroupChat.ts.
insert into storage.buckets (id, name, public, file_size_limit)
values ('group-chat-media', 'group-chat-media', true, 52428800)
on conflict (id) do nothing;

drop policy if exists "group chat photos are publicly viewable" on storage.objects;
create policy "group chat photos are publicly viewable"
  on storage.objects for select
  to public
  using (bucket_id = 'group-chat-media');

drop policy if exists "a member with chat access uploads into their own folder" on storage.objects;
create policy "a member with chat access uploads into their own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'group-chat-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.has_group_chat_access(auth.uid())
    and not public.is_group_chat_muted(auth.uid())
  );

drop policy if exists "the uploader or admin can delete a group chat photo" on storage.objects;
create policy "the uploader or admin can delete a group chat photo"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'group-chat-media'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin(auth.uid()))
  );

-- Unread badge (migration_016.sql): one row per member holding only when
-- they last read the chat — the unread COUNT itself is never stored
-- anywhere, it's computed client-side each time as "messages newer than my
-- last_read_at, not mine, not deleted" (see GroupChatUnreadContext.tsx).
-- Written both when a member opens the chat and again on every new message
-- that arrives while they're actively viewing it, so last_read_at never
-- falls behind what they've actually seen even if the tab closes abruptly.
-- A member with no row yet is treated as having read nothing.
create table if not exists public.group_chat_reads (
  member_id uuid primary key references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now()
);

alter table public.group_chat_reads enable row level security;

drop policy if exists "members read only their own read position" on public.group_chat_reads;
create policy "members read only their own read position"
  on public.group_chat_reads for select
  to authenticated
  using (member_id = auth.uid());

drop policy if exists "members insert only their own read position" on public.group_chat_reads;
create policy "members insert only their own read position"
  on public.group_chat_reads for insert
  to authenticated
  with check (member_id = auth.uid() and public.has_group_chat_access(auth.uid()));

drop policy if exists "members update only their own read position" on public.group_chat_reads;
create policy "members update only their own read position"
  on public.group_chat_reads for update
  to authenticated
  using (member_id = auth.uid())
  with check (member_id = auth.uid());

-- REALTIME — turn on live postgres_changes delivery for new/deleted
-- messages, reaction counts, and (scoped to just the signed-in member's own
-- row via a client-side `filter`) their own `group_chat_muted` flag,  so
-- muting takes effect without a refresh. `alter publication ... add table`
-- errors if the table is already a member, so this is guarded to stay safe
-- to re-run.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_chat_messages'
  ) then
    alter publication supabase_realtime add table public.group_chat_messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_chat_cheers'
  ) then
    alter publication supabase_realtime add table public.group_chat_cheers;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;

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
