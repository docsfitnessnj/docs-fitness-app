-- Doc's Fitness — migration 007
-- ============================================================================
-- Wires real Stripe subscriptions for the ONLINE membership tiers (Monthly,
-- Founding 50, Annual). In-person plans (Monthly Unlimited, 10 Class Pack,
-- Drop In) are untouched and stay simulated.
--
-- Adds:
--   - subscriptions: one row per member, the real truth about their online
--     billing (Stripe customer/subscription id, which price, current
--     status, renewal date). Written ONLY by the Stripe webhook Edge
--     Function (using the service role key, which bypasses RLS entirely) —
--     there is deliberately no insert/update policy here for a signed-in
--     member's own browser session, so a member's access can never be
--     changed by anything other than a real Stripe event.
--   - stripe_events: a permanent log of every Stripe webhook event received,
--     for Doc's future Command Center and for debugging — admin-readable
--     only, also service-role-write-only.
--   - Founding 50: closes the old client-side "claim a spot yourself" path
--     (from the FOUNDING 50 LAUNCH round). Claiming a spot is now something
--     that only happens as a side effect of a real, completed Stripe
--     Checkout at the founding price (done by the webhook), or an admin
--     manually adding someone — never a plain signed-in member calling the
--     database directly.
--
-- Run this AFTER supabase/setup.sql. Safe to run once, and safe to re-run.
--
-- Doc: you must run this migration — see the checklist at the top of the
-- pull request for everything else you need to do (the GitHub secret, the
-- two Supabase secrets, and setting up the webhook in the Stripe dashboard).
-- ============================================================================

create table if not exists public.subscriptions (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  price_id text,
  plan text check (plan in ('monthly', 'annual', 'founding')),
  -- Mirrors Stripe's own subscription.status values verbatim (trialing,
  -- active, past_due, canceled, incomplete, incomplete_expired, unpaid) —
  -- no translation layer, so this table is always exactly as truthful as
  -- Stripe's own records.
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

-- Deliberately no insert/update/delete policy for `authenticated` at all —
-- only the Stripe webhook Edge Function (running with the service role key,
-- which bypasses Row Level Security entirely) can write here. A member's
-- own browser session can read this table but can never change a single
-- byte of it — that's the "the server decides access, never the browser"
-- rule this whole round is built around, enforced structurally rather than
-- by a policy that could be misread or loosened later.

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

-- Same as subscriptions above: no write policy for `authenticated` at all —
-- only the webhook's service-role key ever inserts here. The event id
-- itself is the primary key, which is what lets the webhook safely ignore a
-- redelivery of an event it already processed (Stripe retries on timeout).

-- Founding 50: close the old client-side claim path now that claiming a
-- spot is something real money does, not a free button tap (see
-- FoundingFiftyContext.tsx / supabase/migration_005.sql for the original
-- launch-offer round). An admin can still add someone manually (e.g.
-- comping a spot by hand); a plain signed-in member no longer can — that
-- insert now only ever happens from the Stripe webhook (service role,
-- bypasses RLS) after a real completed Checkout at the founding price. The
-- existing 50-spot capacity trigger is untouched and still enforces the cap
-- no matter who's doing the inserting.
drop policy if exists "members can claim their own founding fifty spot" on public.founding_fifty_members;
drop policy if exists "an admin can add a founding fifty member" on public.founding_fifty_members;
create policy "an admin can add a founding fifty member"
  on public.founding_fifty_members for insert
  to authenticated
  with check (public.is_admin(auth.uid()));
