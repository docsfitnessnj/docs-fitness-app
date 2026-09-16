-- Doc's Fitness — migration 002
-- ============================================================================
-- Fix-round cleanup: "Virtual" -> "Online" everywhere, including the one
-- place it was baked into the database schema. The app no longer reads or
-- writes this column for anything shown to members (the leaderboard now
-- computes the Boathouse Crew / Online label live from each member's own
-- profile — see ChallengeContext.tsx), but the column, its default, and its
-- check constraint still say "Virtual," which is worth cleaning up rather
-- than leaving a stale, confusing value sitting in the schema.
--
-- Safe to run once, and safe to re-run. Run this AFTER supabase/setup.sql.
-- ============================================================================

update public.challenge_entries set tag = 'Online' where tag = 'Virtual';

alter table public.challenge_entries alter column tag set default 'Online';

alter table public.challenge_entries drop constraint if exists challenge_entries_tag_check;

alter table public.challenge_entries
  add constraint challenge_entries_tag_check check (tag in ('Boathouse Crew', 'Online'));
