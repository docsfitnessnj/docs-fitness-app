-- Doc's Fitness — migration 008
-- ============================================================================
-- Member Manager rebuild: groups the admin roster by real plan instead of one
-- flat list. Run this AFTER supabase/setup.sql (and after migration_007,
-- which added the `subscriptions` table this depends on). Safe to run once,
-- and safe to re-run.
--
-- Adds:
--   - profiles.in_person_plan: in-person plans (Monthly Unlimited, 10 Class
--     Pack, Drop In) are still fully simulated — no real in-person billing
--     yet — but the simulated choice used to live ONLY in that member's own
--     browser's local storage, invisible to anyone else including Doc's own
--     Member Manager screen. This column just makes the existing simulated
--     choice visible account-wide so the admin roster can group by it. It is
--     still not real billing and still has no cancel/refund path (a later
--     dedicated round) — this migration only makes existing state visible.
--   - admin_list_members(): the one call Member Manager needs for its full
--     roster in a single round trip — profile fields, the member's real
--     email (profiles never stores email; only auth.users does, which an
--     ordinary signed-in client can't query directly), their Founding 50
--     membership, and their real online subscription row, all joined
--     together. Security definer so it can read auth.users, but it enforces
--     its own admin check inside rather than relying on RLS, and returns
--     zero rows for anyone who isn't an admin — never an error a non-admin
--     caller could use to probe for admin-only data.
--
-- Doc: you must run this migration for the new Member Manager screen to load
-- real data — see the PR description for the full checklist.
-- ============================================================================

alter table public.profiles
  add column if not exists in_person_plan text check (in_person_plan in ('monthly_unlimited', 'ten_pack', 'drop_in'));

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
  sub_cancel_at_period_end boolean
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
    s.cancel_at_period_end
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.founding_fifty_members f on f.id = p.id
  left join public.subscriptions s on s.user_id = p.id
  where public.is_admin(auth.uid())
  order by p.created_at asc;
$$;

grant execute on function public.admin_list_members() to authenticated;
