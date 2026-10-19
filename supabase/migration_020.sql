-- Doc's Fitness — migration 020
-- ============================================================================
-- Completions are account data, not device data.
--
-- AUDIT FINDING: `wod_completions` and `deck_completions` already exist in
-- supabase/setup.sql, and the app's code (WorkoutLogContext.tsx,
-- DeckProgressContext.tsx) already reads and writes them exclusively — there
-- is no currently-active code path that stores a completed WOD or a
-- completed Deck card only on the device. BUT neither table has ever
-- appeared in a numbered migration file (001 through 019) — only in
-- setup.sql, the from-scratch reference script. That means a production
-- database that was brought up by running migrations in order, the normal
-- way this project ships schema changes, never actually received these two
-- tables. This — not "the data lives only on the device" — is the real root
-- cause of the reported bug: the client's writes to `wod_completions` /
-- `deck_completions` were firing against a table that doesn't exist in
-- production, the (unawaited, unchecked) write silently failed, and the
-- completion only ever existed in that tab's in-memory React state —
-- optimistic, and gone the moment the app re-fetches from the real database
-- after a sign-out/sign-in. This migration closes that gap: every statement
-- below uses "if not exists" / "drop ... if exists", so running it against a
-- database that's missing these tables creates them, and running it against
-- one that (by whatever means) already has them is a safe no-op either way.
--
-- What's genuinely new in this migration: `deck_browse_order`. The Deck of
-- WODs' browse-grid card layout (which face-down slot each not-yet-completed
-- card sits in, with completed cards frozen in their slot) was, until now, a
-- deliberate local-only design choice (see the removed comment in
-- DeckProgressContext.tsx) — reasoned as "purely local device UI state, not
-- tracked progress." This round's instructions call it out by name as
-- progress that should follow the account, so it does from here on: new
-- table below, one row per member.
--
-- Also audited and found to already be fully database-backed, with no
-- device-only storage left to migrate: `challenge_entries` (COWS weekly
-- challenge submissions — ChallengeContext.tsx reads/writes it exclusively).
-- Also audited and found to be local-only ON PURPOSE, correctly out of
-- scope (not completion/progress data): in-progress WOD log drafts
-- (`docsfitness.workoutLogDrafts.v1` — nobody else needs to see a result
-- before it's marked complete), the physical-deck upsell's once-a-month
-- throttle (`docsfitness.deckUpsell.v1` — a marketing nudge dismissal, not
-- progress), and THE FOUNDING 50 badge grant (`docsfitness.foundingFiftyGrants.v1`
-- — already explicitly out of scope per BadgeContext.tsx's own comment).
-- Class sign-ups (ClassSignUpContext.tsx) are a separate, pre-existing,
-- clearly-labeled local-only demo system for upcoming bookings, not
-- completion/progress data — moving that to a real multi-user backend is a
-- materially larger feature (admin roster, notifications) and out of scope
-- for this round.
--
-- Run this AFTER migration_019.sql. Safe to run once, and safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- WOD_COMPLETIONS — one row per day a member marks a WOD (or the Saturday
-- Steady State) complete, with their logged results. Identical to the
-- definition already in setup.sql; recreated here (idempotently) because no
-- prior numbered migration ever shipped it.
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

-- ----------------------------------------------------------------------------
-- DECK_COMPLETIONS — one row per Deck of WODs card a member has completed.
-- Identical to the definition already in setup.sql; recreated here
-- (idempotently) for the same reason as wod_completions above.
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- DECK_BROWSE_ORDER — one row per member: the Browse Deck grid's current
-- card order (an array of 54 card ids), so a reshuffled grid with completed
-- cards frozen in place looks the same on every device a member signs into,
-- not just the one it was last shuffled on. The whole order is written as
-- one JSON array rather than one row per card — there's exactly one active
-- order per member, it's always replaced as a whole (a reshuffle moves many
-- slots at once), and nothing else ever needs to query it by card.
-- ----------------------------------------------------------------------------
create table if not exists public.deck_browse_order (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  card_order jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.deck_browse_order enable row level security;

drop policy if exists "members manage only their own deck browse order" on public.deck_browse_order;
create policy "members manage only their own deck browse order"
  on public.deck_browse_order for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Note for a future round (explicitly out of scope here): badges and
-- completion counts (ON FIRE, THE REGULAR, HUNDRED DOWN, DAY ONE DOUG) read
-- their progress from wod_completions/deck_completions/challenge_entries
-- already (see BadgeContext.tsx) — this migration only closes the gap where
-- those tables may never have reached production, and adds browse-order
-- sync. No badge logic changes here.
