-- Doc's Fitness — migration 027
-- ============================================================================
-- Round 39: an OPTIONAL Rx / Scaled / Modified level on a Weekly Challenge
-- (COW) score entry.
--
-- `challenge_entries` gains a nullable `level` column — a member can post a
-- score with no level picked at all (the leaderboard then simply omits it,
-- never guesses), so this is additive and optional in both directions: no
-- existing row is touched, and no existing client that doesn't send `level`
-- breaks (the column defaults to null).
--
-- Safe to run once, and safe to re-run — `add column if not exists` is a
-- no-op the second time.
-- ============================================================================

alter table public.challenge_entries
  add column if not exists level text check (level in ('Rx', 'Scaled', 'Modified'));
