-- Doc's Fitness — migration 019
-- ============================================================================
-- Stripe round two: wires the three IN PERSON plans to real sandbox
-- checkout, matching the architecture round one already built for the
-- online plans (Edge-Function-mediated Checkout, webhook-driven state,
-- never trusted from the client).
--
--   - MONTHLY UNLIMITED (IN PERSON): a real Stripe subscription. Reuses the
--     existing `subscriptions` table (widened below) exactly like the
--     online plans — same webhook, same columns, same Manage Membership
--     portal. The webhook also keeps `profiles.in_person_plan` in sync
--     ('monthly_unlimited' while active, cleared otherwise) since that
--     column already gates real access today (see
--     `has_group_chat_access()`, setup.sql) — this migration locks it so
--     only the webhook's service-role key can ever write it, closing the
--     gap where any signed-in member could previously grant themselves
--     Monthly Unlimited (and the group chat access that comes with it) by
--     just updating their own profile row.
--   - 10 CLASS PACK: a real one-time Stripe payment. On webhook
--     confirmation, grants a pack of 10 credits in the new `class_packs`
--     table below. Members can only ever read their own pack; only the
--     webhook's service-role key inserts, and credits are only ever
--     spent/refunded through the two security-definer RPCs below, which
--     enforce "this member's own active pack only" themselves rather than
--     trusting the client with a raw UPDATE.
--   - DROP IN: a real one-time Stripe payment, started from the booking
--     flow itself. The new `in_person_purchases` table is the webhook's
--     one way of telling the client (polling by Stripe Checkout Session
--     id, the same way round one polls the `subscriptions` row) that a
--     one-time purchase (10 Class Pack OR Drop In) actually completed —
--     also doubles as Doc's own audit trail for both, alongside the
--     existing `stripe_events` log.
--
-- Run this AFTER migration_018.sql. Safe to run once, and safe to re-run —
-- every statement either uses "if not exists", "or replace", or drops-then-
-- recreates a constraint/policy/trigger by its own deterministic name.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SUBSCRIPTIONS — widen `plan` to accept the new in-person monthly value.
-- Everything else about this table (columns, RLS, the webhook being the
-- only writer) is unchanged — Monthly Unlimited (IN PERSON) is a real
-- Stripe subscription like any other, just a different price/plan.
-- ----------------------------------------------------------------------------
alter table public.subscriptions drop constraint if exists subscriptions_plan_check;
alter table public.subscriptions
  add constraint subscriptions_plan_check check (plan in ('monthly', 'annual', 'founding', 'in_person_monthly'));

-- ----------------------------------------------------------------------------
-- PROFILES.IN_PERSON_PLAN — lock it to service-role-only writes.
-- This column already gates real access (has_group_chat_access() below
-- checks `in_person_plan = 'monthly_unlimited'`) and, from this round on,
-- is kept in sync by the Stripe webhook alone. Before this trigger, the
-- existing "members can update their own profile" policy (setup.sql) let
-- any signed-in member set this column to whatever they liked — harmless
-- while it was purely a simulated/preview flag, not harmless now that it's
-- a real, money-backed access switch. Every OTHER self-editable profile
-- field (display_name, instagram_handle, favorite_quote, avatar_url,
-- how_train, show_tomorrows_workout) is left completely alone by this
-- trigger — it only ever reverts in_person_plan specifically.
-- ----------------------------------------------------------------------------
create or replace function public.enforce_in_person_plan_service_role_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.in_person_plan is distinct from old.in_person_plan and auth.role() <> 'service_role' then
    new.in_person_plan := old.in_person_plan;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_in_person_plan_service_role_only on public.profiles;
create trigger profiles_in_person_plan_service_role_only
  before update on public.profiles
  for each row execute function public.enforce_in_person_plan_service_role_only();

-- ----------------------------------------------------------------------------
-- CLASS_PACKS — 10 Class Pack credits. One row per pack purchased (a member
-- can buy more than once — the RPCs below always spend/refund against
-- whichever of their packs expires soonest but still has room). `expires_at`
-- is always exactly one year from `purchased_at`, set by the webhook at
-- insert time. `total_credits` exists only so refund_class_pack_credit()
-- can cap a refund at this pack's own original size instead of a hardcoded
-- constant, in case a different pack size ever ships later.
-- ----------------------------------------------------------------------------
create table if not exists public.class_packs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  total_credits integer not null default 10,
  credits_remaining integer not null default 10 check (credits_remaining >= 0),
  purchased_at timestamptz not null default now(),
  expires_at timestamptz not null,
  stripe_checkout_session_id text unique,
  created_at timestamptz not null default now()
);

alter table public.class_packs enable row level security;

drop policy if exists "a member reads their own class packs" on public.class_packs;
create policy "a member reads their own class packs"
  on public.class_packs for select
  to authenticated
  using (user_id = auth.uid());

-- No insert/update/delete policy for `authenticated` at all — only the
-- Stripe webhook's service-role key ever grants a pack, and the two
-- security-definer RPCs below are the only way credits ever move, each one
-- scoped to auth.uid()'s own pack(s).

-- Spends one credit from whichever of the caller's own packs expires
-- soonest among those that still have credit left — used the moment a 10
-- Class Pack member books a class. Raises if they have no active pack with
-- credit left, so a client bug can never silently book against nothing.
create or replace function public.use_class_pack_credit()
returns table (credits_remaining integer, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_pack_id uuid;
begin
  select cp.id into target_pack_id
  from public.class_packs cp
  where cp.user_id = auth.uid()
    and cp.credits_remaining > 0
    and cp.expires_at > now()
  order by cp.expires_at asc
  limit 1;

  if target_pack_id is null then
    raise exception 'No active class pack with credits remaining.';
  end if;

  -- The explicit table alias (not just `public.class_packs`) is required
  -- here, not stylistic — this function's RETURNS TABLE(credits_remaining,
  -- expires_at) declares OUT parameters of those exact names, which would
  -- otherwise shadow the bare column names in the SET/RETURNING clauses
  -- below and fail with "column reference is ambiguous".
  return query
    update public.class_packs cp
    set credits_remaining = cp.credits_remaining - 1
    where cp.id = target_pack_id
    returning cp.credits_remaining, cp.expires_at;
end;
$$;

grant execute on function public.use_class_pack_credit() to authenticated;

-- The inverse — cancelling a 10 Class Pack booking refunds the credit.
-- Silently does nothing (returns zero rows) if the caller has no pack with
-- room for a refund, rather than erroring — a cancel should never be able
-- to fail the whole action over bookkeeping.
create or replace function public.refund_class_pack_credit()
returns table (credits_remaining integer, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_pack_id uuid;
begin
  select cp.id into target_pack_id
  from public.class_packs cp
  where cp.user_id = auth.uid()
    and cp.credits_remaining < cp.total_credits
    and cp.expires_at > now()
  order by cp.expires_at asc
  limit 1;

  if target_pack_id is null then
    return;
  end if;

  return query
    update public.class_packs cp
    set credits_remaining = least(cp.credits_remaining + 1, cp.total_credits)
    where cp.id = target_pack_id
    returning cp.credits_remaining, cp.expires_at;
end;
$$;

grant execute on function public.refund_class_pack_credit() to authenticated;

-- ----------------------------------------------------------------------------
-- IN_PERSON_PURCHASES — the webhook's confirmation record for a one-time
-- in-person purchase (10 Class Pack or Drop In), keyed by the Stripe
-- Checkout Session id (not the event id — session id is what the browser's
-- own success redirect carries back, and what the client polls for). Also
-- Doc's own audit trail of every in-person one-time sale, same spirit as
-- `stripe_events` but scoped to what Member Manager would actually want to
-- show a member about their own purchase history.
-- ----------------------------------------------------------------------------
create table if not exists public.in_person_purchases (
  id text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  plan text not null check (plan in ('ten_pack', 'drop_in')),
  amount_cents integer,
  created_at timestamptz not null default now()
);

alter table public.in_person_purchases enable row level security;

drop policy if exists "a member reads their own in-person purchases" on public.in_person_purchases;
create policy "a member reads their own in-person purchases"
  on public.in_person_purchases for select
  to authenticated
  using (user_id = auth.uid());

-- No write policy for `authenticated` — only the webhook's service-role key
-- ever inserts here, same convention as stripe_events/subscriptions.
