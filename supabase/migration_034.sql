-- Doc's Fitness — migration 034
-- ============================================================================
-- Round 62: an OPTIONAL Dawn vs Yawn Christmas Classic team on a Weekly
-- Challenge (COW) score entry.
--
-- `challenge_entries` gains a nullable `team` column, the identical shape
-- Round 39/migration_027's own `level` column already established: a member
-- can post a score with no team picked at all (an online member, a
-- non-competitor, or any entry posted before this round or outside the
-- Classic's own window) — the leaderboard then simply omits it, never
-- guesses. Additive and optional in both directions: no existing row is
-- touched, and no existing client that doesn't send `team` breaks (the
-- column defaults to null).
--
-- This migration is plumbing only. It carries no team-scoring logic, no
-- roster, no admin screen — the three Christmas COW workouts themselves
-- arrive later through the existing scheduled-weeks import, and the real
-- team scoring (roster participation, top-performer bonuses, the 2v2
-- finale) is computed by the owner outside the app entirely.
--
-- Safe to run once, and safe to re-run — `add column if not exists` is a
-- no-op the second time.
-- ============================================================================

alter table public.challenge_entries
  add column if not exists team text check (team in ('DAWN', 'YAWN'));
