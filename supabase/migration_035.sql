-- Doc's Fitness — migration 035
-- ============================================================================
-- Round 65 Part 3.2: an admin-only starting class-pack balance, for
-- migrating existing Somble members who still have classes remaining on
-- their old packs.
--
-- `admin_grant_class_pack_credits(p_user_id, p_credits)` is a new
-- security-definer RPC, the same admin-gated convention as every other
-- admin write in this app (`is_admin(auth.uid())` checked inside the
-- function itself, never trusted from RLS alone) — there is still no
-- insert/update policy on `class_packs` for `authenticated` at all
-- (migration_019), so this is the ONLY way an admin-granted balance can
-- ever reach that table; a member can never call this on themselves even
-- though `grant execute` is to `authenticated` — the function's own
-- FORBIDDEN check is the real gate, the same two-layer shape every other
-- admin RPC in this app already uses.
--
-- One admin-granted row per member, identified by
-- `stripe_checkout_session_id is null` — a real Stripe purchase always
-- carries a real session id (migration_019's own `unique` column on that
-- exact field), so this is never ambiguous with a real purchased pack.
-- Setting credits a second time UPDATES that same row (a fresh 1-year
-- expiry from today each time, since "no payment attached" means there's
-- nothing else to track beyond the current balance); a member's own real
-- purchased pack, if they have one, is a separate row and is never touched
-- by this function. `use_class_pack_credit()`/`refund_class_pack_credit()`
-- (migration_019) need no changes at all — they already pick whichever of
-- a member's own packs expires soonest among those with credit left,
-- regardless of which pack is a real purchase and which is an admin grant,
-- so booking/cancelling against an admin-granted balance already works
-- exactly like a real purchased one.
--
-- `admin_list_members()` widens to surface this one admin-granted row's
-- own current balance back to Member Manager, so the input field prefills
-- with the real saved number instead of always starting blank — the same
-- "prefill with the real saved value" convention `legacy_starting_count`
-- already established (Round 45). Its RETURNS TABLE shape is changing,
-- which Postgres refuses via CREATE OR REPLACE once the columns
-- themselves differ — drop then create, the same workaround every prior
-- round that widened this function's shape has used.
--
-- Safe to run once, and safe to re-run.
-- ============================================================================

create or replace function public.admin_grant_class_pack_credits(p_user_id uuid, p_credits integer)
returns table (credits_remaining integer, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_pack_id uuid;
  new_expires_at timestamptz := now() + interval '1 year';
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'FORBIDDEN';
  end if;
  if p_credits is null or p_credits < 0 then
    raise exception 'Credits must be zero or more.';
  end if;

  select cp.id into target_pack_id
  from public.class_packs cp
  where cp.user_id = p_user_id
    and cp.stripe_checkout_session_id is null;

  if target_pack_id is null then
    insert into public.class_packs (user_id, total_credits, credits_remaining, purchased_at, expires_at, stripe_checkout_session_id)
    values (p_user_id, p_credits, p_credits, now(), new_expires_at, null)
    returning id into target_pack_id;
  else
    update public.class_packs cp
    set total_credits = p_credits, credits_remaining = p_credits, expires_at = new_expires_at
    where cp.id = target_pack_id;
  end if;

  return query
    select cp.credits_remaining, cp.expires_at
    from public.class_packs cp
    where cp.id = target_pack_id;
end;
$$;

grant execute on function public.admin_grant_class_pack_credits(uuid, integer) to authenticated;

-- ----------------------------------------------------------------------------
-- admin_list_members() widens to surface the real admin-granted balance —
-- see the top comment above for why this needs drop-then-create rather
-- than a plain CREATE OR REPLACE.
-- ----------------------------------------------------------------------------
drop function if exists public.admin_list_members();

create function public.admin_list_members()
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
  sub_cancel_at_period_end boolean,
  group_chat_muted boolean,
  legacy_starting_count integer,
  pack_credits_remaining integer
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
    s.cancel_at_period_end,
    p.group_chat_muted,
    p.legacy_starting_count,
    coalesce(gp.credits_remaining, 0) as pack_credits_remaining
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.founding_fifty_members f on f.id = p.id
  left join public.subscriptions s on s.user_id = p.id
  left join (
    select cp.user_id, cp.credits_remaining
    from public.class_packs cp
    where cp.stripe_checkout_session_id is null
  ) gp on gp.user_id = p.id
  where public.is_admin(auth.uid())
  order by p.created_at asc;
$$;

grant execute on function public.admin_list_members() to authenticated;
