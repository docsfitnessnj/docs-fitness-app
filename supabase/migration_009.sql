-- Doc's Fitness — migration 009
-- ============================================================================
-- Fixes the Founding 50 offer being invisible on the About page for a
-- logged-out visitor. Run this AFTER supabase/setup.sql. Safe to run once,
-- and safe to re-run.
--
-- Root cause: founding_fifty_settings and founding_fifty_members are both
-- readable only `to authenticated` — a signed-out visitor's client can't
-- read either table at all, so the About page (the one screen strangers
-- see, logged out by definition) had no way to know the launch window was
-- live or how many spots were claimed. Client-side, FoundingFiftyContext's
-- own fetch is also gated on having a signed-in user, compounding the same
-- problem — that's an app-code fix, not a database one.
--
-- Fix: a single narrow, read-only function — founding_fifty_public_status()
-- — returns ONLY starts_at, ends_at, and a claimed COUNT, the three public
-- marketing facts the About door needs. It deliberately does NOT expose the
-- founding_fifty_members roster itself (no names, no member ids, no join
-- dates) to anonymous visitors — that stays exactly as locked down as it is
-- today, `to authenticated` only. This is the "safe server-side path"
-- instead of loosening either table's row-level security policy, since a
-- table-level anon SELECT grant would expose whatever columns come back
-- with it, including who each founding member is.
-- ============================================================================

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
