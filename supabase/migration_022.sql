-- Doc's Fitness — migration 022
-- ============================================================================
-- THE FOUNDING 50 LAUNCH gets an explicit ON/OFF switch.
--
-- Until now the launch window was considered "live" purely from the saved
-- starts_at/ends_at dates — the only way to take the offer down was
-- deleting both dates and retyping them later, with no record of what they
-- were. This adds a real, persisted `enabled` column to
-- founding_fifty_settings: OFF disables the entire founding experience
-- everywhere (About page takeover, Memberships banner, the $37 no-trial
-- Stripe checkout path) no matter what the saved dates say; ON behaves
-- exactly as the dates/spots-remaining logic always has. The saved dates
-- themselves are untouched by this column either way — toggling OFF then
-- back ON preserves them.
--
-- Defaults to false (OFF) so this migration can never accidentally arm
-- anything on its own.
--
-- founding_fifty_public_status() (migration_009.sql) is the one anon-safe
-- channel the logged-out About page reads through — it must hand back
-- `enabled` too, or a logged-out visitor's own takeover check would have no
-- way to honor the switch. Its RETURNS TABLE shape is changing, so it has
-- to be dropped and recreated rather than CREATE OR REPLACE, which
-- Postgres refuses once the return columns themselves differ.
--
-- The server-side Stripe checkout path (supabase/functions/create-checkout)
-- now also reads this column directly (service role, same query it already
-- runs for starts_at/ends_at) before ever honoring the $37 founding price —
-- a stale/forged client request can never get the founding rate while the
-- switch is off, regardless of what the dates say.
--
-- Run this AFTER migration_021.sql. Safe to run once, and safe to re-run.
-- ============================================================================

alter table public.founding_fifty_settings
  add column if not exists enabled boolean not null default false;

drop function if exists public.founding_fifty_public_status();

create function public.founding_fifty_public_status()
returns table (
  starts_at timestamptz,
  ends_at timestamptz,
  claimed_count integer,
  enabled boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    (select s.starts_at from public.founding_fifty_settings s where s.id = 1),
    (select s.ends_at from public.founding_fifty_settings s where s.id = 1),
    (select count(*)::integer from public.founding_fifty_members),
    (select s.enabled from public.founding_fifty_settings s where s.id = 1);
$$;

grant execute on function public.founding_fifty_public_status() to anon, authenticated;
