-- Doc's Fitness — migration 029
-- ============================================================================
-- Round 45: LEGACY and UPSTAIRS, the in person class badges.
--
-- LEGACY (permanent) counts a member's LIFETIME booked-not-cancelled classes
-- — their real class_bookings history in this app, plus a new per-member
-- "legacy starting count" that lets Doc carry over how many classes someone
-- took on the old, pre-app system. UPSTAIRS (weekly) needs no schema change
-- at all — it's computed client-side from class_bookings joined to
-- class_sessions (already plainly readable by any signed-in member, see
-- "anyone signed in reads class sessions" in migration_023.sql), the same
-- way THE REGULAR already reads community_posts.
--
-- Three pieces, all additive and safe to re-run:
-- 1. profiles.legacy_starting_count — a new, admin-only-writable integer,
--    defaulting to 0 so no existing member's lifetime count silently
--    changes the moment this ships.
-- 2. badge_grants.badge_id's check constraint and its member-insert policy
--    both widen to allow 'legacy'/'upstairs' — the same self-grant pattern
--    the 5 existing computed badges already use.
-- 3. admin_list_members() grows one column so Member Manager's roster read
--    carries the new field in the same round trip it already uses for
--    group_chat_muted etc.
--
-- Safe to run once, and safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. profiles.legacy_starting_count
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists legacy_starting_count integer not null default 0 check (legacy_starting_count >= 0);

-- legacy_starting_count is admin-only, the same shape as in_person_plan
-- (migration_019) — the existing "members can update their own profile"
-- policy has no per-column carve-out, so without this trigger a member
-- could inflate their own LEGACY milestone by writing this column directly.
-- Unlike in_person_plan's own guard (which only trusts the Stripe webhook's
-- service-role key), this one trusts an ordinary signed-in ADMIN session —
-- Member Manager edits this field as the real admin user, never via a
-- service role.
create or replace function public.enforce_legacy_starting_count_admin_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.legacy_starting_count is distinct from old.legacy_starting_count and not public.is_admin(auth.uid()) then
    new.legacy_starting_count := old.legacy_starting_count;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_legacy_starting_count_admin_only on public.profiles;
create trigger profiles_legacy_starting_count_admin_only
  before update on public.profiles
  for each row execute function public.enforce_legacy_starting_count_admin_only();

-- ----------------------------------------------------------------------------
-- 2. badge_grants — widen badge_id to allow 'legacy'/'upstairs', and let a
-- member self-grant either one for themselves, same as the 5 existing
-- computed badges. LEGACY is permanent but stacks like COW CHAMP — one row
-- per milestone crossed (period_key holds the milestone number as text, e.g.
-- '50', '100', ...), never deleted, so "LEGACY 100" stays visible to other
-- members even after a member's own live count moves past it. UPSTAIRS is a
-- plain weekly boolean, period_key = the current week's start (the same
-- convention ON FIRE/COW KILLER/THE REGULAR already use).
--
-- The constraint's name is looked up by column rather than assumed, the same
-- technique migration_028.sql already used for challenges.scoring_type —
-- correct even if a differently-bootstrapped database named it something
-- else, and a genuine no-op on a second run (it just re-drops and re-adds
-- the byte-identical definition).
-- ----------------------------------------------------------------------------
do $$
declare
  existing_constraint text;
begin
  select con.conname into existing_constraint
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_attribute att on att.attrelid = rel.oid and att.attnum = any(con.conkey)
  where rel.relname = 'badge_grants'
    and att.attname = 'badge_id'
    and con.contype = 'c'
    and con.conrelid = 'public.badge_grants'::regclass
  limit 1;

  if existing_constraint is not null then
    execute format('alter table public.badge_grants drop constraint %I', existing_constraint);
  end if;

  alter table public.badge_grants add constraint badge_grants_badge_id_check
    check (badge_id in (
      'joker', 'on_fire', 'cow_killer', 'the_regular', 'day_one_doug', 'hundred_down', 'cow_champ',
      'legacy', 'upstairs'
    ));
end $$;

drop policy if exists "members can earn their own computed badges, admin can grant any" on public.badge_grants;
create policy "members can earn their own computed badges, admin can grant any"
  on public.badge_grants for insert
  to authenticated
  with check (
    public.is_admin(auth.uid())
    or (
      user_id = auth.uid()
      and badge_id in ('on_fire', 'cow_killer', 'the_regular', 'day_one_doug', 'hundred_down', 'legacy', 'upstairs')
    )
  );

-- ----------------------------------------------------------------------------
-- 3. admin_list_members() — one new column. The return shape is changing,
-- which `create or replace function` refuses once the columns themselves
-- differ (same Postgres limitation migration_009's founding_fifty_public_
-- status() hit, see AGENTS.md's Round 21 writeup) — drop first, then create.
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
  legacy_starting_count integer
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
    p.legacy_starting_count
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.founding_fifty_members f on f.id = p.id
  left join public.subscriptions s on s.user_id = p.id
  where public.is_admin(auth.uid())
  order by p.created_at asc;
$$;

grant execute on function public.admin_list_members() to authenticated;
