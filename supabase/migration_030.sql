-- Doc's Fitness — migration 030
-- ============================================================================
-- Round 46: the content scheduling engine and the 4 WOD week.
--
-- The existing Content Library (ContentLibraryContext.tsx) is entirely
-- local-device localStorage -- it was never built to be invisible-until-a-
-- real-instant, cross-device, or work with nobody's app open. This migration
-- adds a genuinely new, server-side scheduling system for exactly the two
-- content types that need those properties: a week's 4 real WODs (Mon/Tue/
-- Thu/Fri) and its one Challenge of the Week. Everything else the local
-- Content Library already drives (Steady State Saturday, Sunday Setup, any
-- ad-hoc single-entry override) is completely untouched.
--
-- Five pieces, all additive and safe to re-run:
-- 1. scheduled_weeks / scheduled_wods / scheduled_cows -- the new tables.
--    RLS gates every read on `release_at <= now() or admin` so a scheduled-
--    but-not-yet-released week is invisible to every read path (the WODs
--    tab, Community, search) by construction -- there is no separate
--    client-side filter to keep in sync.
-- 2. release_scheduled_weeks_if_due() -- a security definer function, run
--    every 15 minutes by pg_cron (same cadence/rationale as the existing
--    award-cow-champ-check job: a scheduled task's own release_at is
--    already a DST-correct instant, so polling often enough catches it
--    within 15 minutes in every season without hardcoding a UTC cron time
--    that would drift an hour at each Daylight Saving change). On release:
--    marks the week released, mirrors its COW into `challenges` (the same
--    shape the client's own local-mirror already writes, so COW CHAMP
--    keeps working unmodified), unpins the previous auto-release post, and
--    posts the new pinned release post from Doc's own admin account.
-- 3. post_last_call_if_due() -- a second security definer function, same
--    15-minute cadence, posting the Saturday 8:00am ET LAST CALL message
--    (not pinned) once per challenge cycle, guarded by a new
--    challenges.last_call_posted_at column (mirrors champion_awarded_at's
--    own idempotency pattern).
-- 4. community_posts gains `is_weekly_release` (a plain boolean, not a new
--    `kind` value -- CommunityContext.tsx's own Post.kind is a narrow
--    'text'|'wod' union, and widening it would be a type-safety collision
--    for no real benefit) so the release job can reliably find and unpin
--    its own previous post without guessing from author/pinned alone, and
--    enforce_post_pin_rules() is widened to allow auth.uid() is null
--    through (a pg_cron security-definer job has no JWT at all -- that can
--    only be a server-initiated action, never a real member request, since
--    this table's insert policy is `to authenticated` only).
-- 5. challenges.last_call_posted_at -- the LAST CALL idempotency guard.
--
-- Email-on-release is explicitly out of scope this round (needs
-- transactional email setup) -- release_scheduled_weeks_if_due() has a
-- one-line comment marking exactly where that hook would go later.
--
-- Safe to run once, and safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------

create table if not exists public.scheduled_weeks (
  id uuid primary key default gen_random_uuid(),
  -- The Monday this week's 4 WODs cover (Tue/Thu/Fri follow by simple +1/
  -- +3/+4 day offsets, Wed is COW day) -- a plain calendar date, matching
  -- how every other weekly boundary in this app already works
  -- (data/content.ts's own getWeekStart, local-device midnight). Not
  -- derived from release_at's own Eastern-time date, to avoid a
  -- cross-timezone mismatch between "the release instant" (always Eastern)
  -- and "which days this week covers" (always local-device).
  week_start_date date not null unique,
  -- The exact Sunday 6:00pm ET instant this week unlocks -- always the
  -- Sunday immediately before week_start_date. A generated column, not
  -- client-computed, so it's always correct across a Daylight Saving
  -- change with zero chance of client drift -- the same technique
  -- migration_023.sql's class_sessions.start_at already established.
  release_at timestamptz generated always as (
    ((week_start_date - 1) + time '18:00') at time zone 'America/New_York'
  ) stored,
  -- Set once release_scheduled_weeks_if_due() has processed this week, so a
  -- later run never re-releases (and re-posts) the same week twice.
  released_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table if not exists public.scheduled_wods (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.scheduled_weeks (id) on delete cascade,
  day_of_week text not null check (day_of_week in ('mon', 'tue', 'thu', 'fri')),
  name text not null,
  format text not null default '',
  format_description text not null default '',
  movements text[] not null default '{}',
  video_url text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  unique (week_id, day_of_week)
);

create table if not exists public.scheduled_cows (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null unique references public.scheduled_weeks (id) on delete cascade,
  name text not null,
  video_url text not null default '',
  scoring_type text not null default 'time' check (scoring_type in ('time', 'rounds_reps', 'emom')),
  -- Deliberately flatter than ContentWorkout's own COW-specific shape
  -- (Round 39's kettlebellsDudes/kettlebellsFemales split, catchIntro/
  -- catchPenalties/catchFollowUp split) — the Part 4 import spec's own
  -- COW columns are exactly these four plain-text fields (one "Prescribed
  -- kettlebells" column, one "The Catch" column), and inventing a
  -- dudes/females or intro/penalty/follow-up split from a single imported
  -- string would mean guessing at a parse the brief never specified. The
  -- COW room renders these as plain text blocks for a scheduled-system
  -- COW, a simpler but still clean treatment, alongside (not replacing)
  -- the richer local-system rendering Round 39/40 already built.
  kettlebells text,
  the_work text,
  the_catch text,
  finish_note text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- RLS -- the one gate every read path (WODs tab, Community, search) goes
-- through, so unreleased content is invisible everywhere by construction.
-- ----------------------------------------------------------------------------
alter table public.scheduled_weeks enable row level security;
alter table public.scheduled_wods enable row level security;
alter table public.scheduled_cows enable row level security;

create or replace function public.scheduled_week_is_released(p_week_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.scheduled_weeks w
    where w.id = p_week_id and (w.release_at <= now() or public.is_admin(auth.uid()))
  );
$$;

drop policy if exists "scheduled weeks readable once released, admin always" on public.scheduled_weeks;
create policy "scheduled weeks readable once released, admin always"
  on public.scheduled_weeks for select
  to authenticated
  using (release_at <= now() or public.is_admin(auth.uid()));

drop policy if exists "only admin can insert scheduled weeks" on public.scheduled_weeks;
create policy "only admin can insert scheduled weeks"
  on public.scheduled_weeks for insert
  to authenticated
  with check (public.is_admin(auth.uid()));

drop policy if exists "only admin can update scheduled weeks" on public.scheduled_weeks;
create policy "only admin can update scheduled weeks"
  on public.scheduled_weeks for update
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists "only admin can delete scheduled weeks" on public.scheduled_weeks;
create policy "only admin can delete scheduled weeks"
  on public.scheduled_weeks for delete
  to authenticated
  using (public.is_admin(auth.uid()));

drop policy if exists "scheduled wods readable once their week is released" on public.scheduled_wods;
create policy "scheduled wods readable once their week is released"
  on public.scheduled_wods for select
  to authenticated
  using (public.scheduled_week_is_released(week_id));

drop policy if exists "only admin can insert scheduled wods" on public.scheduled_wods;
create policy "only admin can insert scheduled wods"
  on public.scheduled_wods for insert
  to authenticated
  with check (public.is_admin(auth.uid()));

drop policy if exists "only admin can update scheduled wods" on public.scheduled_wods;
create policy "only admin can update scheduled wods"
  on public.scheduled_wods for update
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists "only admin can delete scheduled wods" on public.scheduled_wods;
create policy "only admin can delete scheduled wods"
  on public.scheduled_wods for delete
  to authenticated
  using (public.is_admin(auth.uid()));

drop policy if exists "scheduled cows readable once their week is released" on public.scheduled_cows;
create policy "scheduled cows readable once their week is released"
  on public.scheduled_cows for select
  to authenticated
  using (public.scheduled_week_is_released(week_id));

drop policy if exists "only admin can insert scheduled cows" on public.scheduled_cows;
create policy "only admin can insert scheduled cows"
  on public.scheduled_cows for insert
  to authenticated
  with check (public.is_admin(auth.uid()));

drop policy if exists "only admin can update scheduled cows" on public.scheduled_cows;
create policy "only admin can update scheduled cows"
  on public.scheduled_cows for update
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists "only admin can delete scheduled cows" on public.scheduled_cows;
create policy "only admin can delete scheduled cows"
  on public.scheduled_cows for delete
  to authenticated
  using (public.is_admin(auth.uid()));

-- A narrow, member-safe peek at the one fact the countdown needs without
-- exposing anything about an unreleased week's own content: the soonest
-- upcoming release instant, or null if nothing is scheduled ahead. Security
-- definer (bypasses the SELECT RLS above on purpose, same convention as
-- founding_fifty_public_status()'s own anon-safe narrow read of an
-- otherwise-gated table) -- the countdown is approved to show "all week
-- long, for paid tiers," which an ordinary member's own RLS-gated read of
-- scheduled_weeks could never satisfy on its own (an unreleased week's row
-- is invisible to them by design).
create or replace function public.next_scheduled_release_at()
returns timestamptz
language sql
security definer
set search_path = public
stable
as $$
  select min(release_at) from public.scheduled_weeks where released_at is null;
$$;

grant execute on function public.next_scheduled_release_at() to authenticated;

-- ----------------------------------------------------------------------------
-- 2. community_posts.is_weekly_release + the pin-trigger carve-out needed
-- for a cron-invoked security-definer insert (no JWT, so auth.uid() is
-- null) to be allowed to pin/unpin at all.
-- ----------------------------------------------------------------------------
alter table public.community_posts
  add column if not exists is_weekly_release boolean not null default false;

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

  -- Round 46: auth.uid() is null when this fires from a security-definer
  -- server job with no end-user session at all (release_scheduled_weeks_
  -- if_due running via pg_cron) -- that can only be a server-initiated
  -- action, never a request through PostgREST (every authenticated request
  -- carries a real uid, and this table's insert policy is `to authenticated`
  -- only, so anon has no path here at all), so it's treated the same as an
  -- admin action -- consistent with every other security-definer job in
  -- this file already running with elevated privilege.
  if auth.uid() is not null and not public.is_admin(auth.uid()) then
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

-- ----------------------------------------------------------------------------
-- 3. challenges.last_call_posted_at -- the LAST CALL idempotency guard,
-- same shape as champion_awarded_at above it.
-- ----------------------------------------------------------------------------
alter table public.challenges
  add column if not exists last_call_posted_at timestamptz;

-- ----------------------------------------------------------------------------
-- 4. release_scheduled_weeks_if_due() -- the release moment itself.
-- security definer (same as award_cow_champ_for_closed_challenges above) so
-- it can insert a pinned post as Doc's own admin account and bypass RLS on
-- every table it touches regardless of who (if anyone) is signed in when
-- pg_cron fires it.
-- ----------------------------------------------------------------------------
create or replace function public.release_scheduled_weeks_if_due()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  w record;
  admin_id uuid;
  cow record;
  wod_names text;
  post_body text;
begin
  select id into admin_id from public.profiles where is_admin = true order by created_at asc limit 1;
  if admin_id is null then
    return;
  end if;

  for w in
    select * from public.scheduled_weeks
    where release_at <= now() and released_at is null
    order by release_at asc
  loop
    update public.scheduled_weeks set released_at = now() where id = w.id;

    -- Mirror this week's COW into challenges -- the same shape the client's
    -- own best-effort local mirror already writes for a Content-Library-
    -- published Challenge, so award_cow_champ_for_closed_challenges() (and
    -- the live leaderboard's own scoring) keep working unmodified for a
    -- scheduled-system COW too. week_start_date + 5 = Saturday of this
    -- same week; noon ET that day is always the real close instant.
    select * into cow from public.scheduled_cows where week_id = w.id;
    if cow.id is not null then
      insert into public.challenges (id, title, scoring_type, week_start, week_end)
      values (
        w.id::text,
        cow.name,
        cow.scoring_type,
        w.release_at,
        ((w.week_start_date + 5) + time '12:00') at time zone 'America/New_York'
      )
      on conflict (id) do update set
        title = excluded.title,
        scoring_type = excluded.scoring_type,
        week_start = excluded.week_start,
        week_end = excluded.week_end;
    end if;

    -- Unpin the previous auto-release post (there is at most one at a
    -- time) before inserting the new one, to stay under the 3-pin cap.
    update public.community_posts set pinned = false where is_weekly_release = true and pinned = true;

    select string_agg(name, E'\n' order by
      case day_of_week when 'mon' then 1 when 'tue' then 2 when 'thu' then 3 when 'fri' then 4 end)
      into wod_names
    from public.scheduled_wods
    where week_id = w.id;

    post_body := 'THE NEW WEEK IS LIVE. Fresh WODs and a new COW just dropped. See you Monday morning.'
      || case when wod_names is not null then E'\n\n' || wod_names else '' end;

    insert into public.community_posts (author_id, title, body, kind, pinned, is_weekly_release)
    values (admin_id, '', post_body, 'text', true, true);

    -- A future round can add a transactional-email hook right here (same
    -- loop iteration, same "this week just went live" instant) without any
    -- restructuring -- everything this round builds already resolves "the
    -- week that just released" and "who to notify" at exactly this point.
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. post_last_call_if_due() -- Saturday 8:00am ET, once per challenge
-- cycle. Scoped to "the currently-open cycle, inside its own last-call
-- window" (week_end - 4h <= now() < week_end) rather than a literal 8am
-- check, so it's correct regardless of how often the 15-minute cron
-- actually lands inside that 4-hour window, and never matches a long-past
-- closed cycle (now() < week_end already excludes those).
-- ----------------------------------------------------------------------------
create or replace function public.post_last_call_if_due()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  admin_id uuid;
begin
  select id into admin_id from public.profiles where is_admin = true order by created_at asc limit 1;
  if admin_id is null then
    return;
  end if;

  for c in
    select * from public.challenges
    where last_call_posted_at is null
      and now() >= week_end - interval '4 hours'
      and now() < week_end
  loop
    insert into public.community_posts (author_id, title, body, kind, pinned)
    values (
      admin_id,
      '',
      'LAST CALL. The COW closes at noon. The leaderboard locks. Post your score or hold your peace.',
      'text',
      false
    );
    update public.challenges set last_call_posted_at = now() where id = c.id;
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- pg_cron registration -- both jobs every 15 minutes, same cadence/
-- rationale as the existing award-cow-champ-check job above.
-- ----------------------------------------------------------------------------
create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (select 1 from cron.job where jobname = 'release-scheduled-weeks-check') then
      perform cron.schedule(
        'release-scheduled-weeks-check',
        '*/15 * * * *',
        $cron$select public.release_scheduled_weeks_if_due();$cron$
      );
    end if;

    if not exists (select 1 from cron.job where jobname = 'post-last-call-check') then
      perform cron.schedule(
        'post-last-call-check',
        '*/15 * * * *',
        $cron$select public.post_last_call_if_due();$cron$
      );
    end if;
  end if;
end;
$$;
