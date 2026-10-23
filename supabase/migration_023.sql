-- ============================================================================
-- MIGRATION 023: real, server-backed class booking.
--
-- Replaces ClassSignUpContext (src/context/ClassSignUpContext.tsx) — a
-- purely device-local Record<string, ClassSignUp> keyed by
-- `${dateKey}::${classId}`, with no capacity, no waitlist, and no userId at
-- all (just a denormalized display-name string) — with real, shared,
-- capacity-enforced server state every device and every admin sees the
-- same copy of. Also adds DOWNBEACH PILATES WITH MARINA, a new $20 paid
-- guest class every member (including Monthly Unlimited) pays for, with no
-- capacity cap and no spots-left display anywhere member-facing.
--
-- Idempotent and safe to run twice, same convention as every prior
-- migration in this file set (migration_022 was the most recently tested
-- against a real local Postgres instance both fresh and already-migrated;
-- this one gets the same treatment — see the PR description).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- CLASS_TEMPLATES — the weekly recipe class_sessions are generated from.
-- Mirrors src/data/schedule.ts's real class names exactly (Dawn Patrol is
-- the 5:30 AM name only; every 9:30 AM MWF/TTh class is Yawn Patrol) plus
-- the new Wednesday 8:30 AM Pilates guest class. `weekdays` uses the same
-- 0=Sunday..6=Saturday convention Postgres's own extract(dow from ...)
-- already uses, so session generation below needs no index translation.
-- `default_capacity` is the one admin-editable control for "Doc's classes
-- default to a cap of 30, editable per class by admin (planned bump to 50
-- around Memorial Day)" — editing it (admin_update_template_capacity,
-- below) cascades to every not-yet-happened class_sessions row for that
-- class_key, not just future generations, so a capacity bump takes effect
-- immediately on the whole visible booking window.
-- ----------------------------------------------------------------------------
create table if not exists public.class_templates (
  class_key text primary key,
  class_name text not null,
  class_type text not null check (class_type in ('Kettlebell Strength', 'Kettlebell Cardio', 'Hybrid', 'Pilates')),
  start_time_local time not null,
  weekdays smallint[] not null,
  default_capacity integer,
  is_guest_class boolean not null default false,
  price_cents integer,
  stripe_price_id text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.class_templates enable row level security;

drop policy if exists "anyone signed in reads class templates" on public.class_templates;
create policy "anyone signed in reads class templates"
  on public.class_templates for select
  to authenticated
  using (true);

-- No write policy for `authenticated` at all — only admin_update_template_capacity()
-- below (security definer, self-checks admin) ever writes here.

insert into public.class_templates (class_key, class_name, class_type, start_time_local, weekdays, default_capacity, is_guest_class, price_cents, stripe_price_id)
values
  ('mwf-530a', 'Dawn Patrol', 'Kettlebell Strength', time '05:30', array[1,3,5]::smallint[], 30, false, null, null),
  ('mwf-930a', 'Yawn Patrol', 'Kettlebell Strength', time '09:30', array[1,3,5]::smallint[], 30, false, null, null),
  ('tth-930a', 'Yawn Patrol', 'Kettlebell Cardio', time '09:30', array[2,4]::smallint[], 30, false, null, null),
  ('sat-815a', 'Savage Saturday', 'Hybrid', time '08:15', array[6]::smallint[], 30, false, null, null),
  ('pilates-wed-830a', 'Downbeach Pilates with Marina', 'Pilates', time '08:30', array[3]::smallint[], null, true, 2000, 'price_1UTjj9K8jMUFAOQwhnr7flRh')
on conflict (class_key) do nothing;

-- ----------------------------------------------------------------------------
-- CLASS_SESSIONS — real, bookable instances generated from class_templates.
-- `start_at` is a generated column computed from the session's own calendar
-- date + the template's Eastern wall-clock time, using Postgres's native
-- `AT TIME ZONE` conversion (correct across DST automatically, via the
-- system zoneinfo database) — simpler and more robust than replicating the
-- app's own JS-side fixed-point correction (etWallTimeToUTC in
-- challengeSchedule.ts) in SQL, since Postgres already has a real
-- timezone-aware timestamp type the JS Date object lacks.
-- `capacity` is a SNAPSHOT of the template's default_capacity at the moment
-- this row was generated (or last cascaded by admin_update_template_capacity)
-- — null means uncapped (Pilates).
-- ----------------------------------------------------------------------------
create table if not exists public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  class_key text not null references public.class_templates (class_key),
  session_date date not null,
  start_time_local time not null,
  start_at timestamptz generated always as (
    ((session_date::timestamp + start_time_local) at time zone 'America/New_York')
  ) stored,
  class_name text not null,
  class_type text not null,
  location_name text not null default 'Dr. John W. Holland Boathouse',
  capacity integer,
  is_guest_class boolean not null default false,
  price_cents integer,
  stripe_price_id text,
  created_at timestamptz not null default now(),
  unique (class_key, session_date)
);

create index if not exists class_sessions_session_date_idx on public.class_sessions (session_date);

alter table public.class_sessions enable row level security;

drop policy if exists "anyone signed in reads class sessions" on public.class_sessions;
create policy "anyone signed in reads class sessions"
  on public.class_sessions for select
  to authenticated
  using (true);

-- No write policy for `authenticated` — only ensure_class_sessions() and
-- admin_update_template_capacity() (both security definer) ever write here.

-- ----------------------------------------------------------------------------
-- CLASS_BOOKINGS — the real booking record. `payment_method` is how THIS
-- SPECIFIC booking was paid for, recorded at booking time — refunding on
-- cancel reads this column, never "does the member currently hold an
-- active pack" (the local ClassSignUpContext-era app's own cancel handler
-- did the latter, which could wrongly refund a pack credit for a booking
-- that was never paid with one — class_bookings.payment_method is the
-- single source of truth that makes this correct by construction).
-- The partial unique index on `payment_method = 'first_class_free'` is a
-- hard database-level guarantee of "at most one free first class per
-- account, ever" — no separate profiles flag needed, and no race window:
-- a second concurrent attempt to insert a first_class_free row for the
-- same user simply fails the constraint. A cancelled first-class-free
-- booking still counts as having used the offer (the row isn't deleted,
-- only its status flips) — a deliberate choice against a
-- book-free-then-cancel-then-book-free-again loop.
-- ----------------------------------------------------------------------------
create table if not exists public.class_bookings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'booked' check (status in ('booked', 'cancelled')),
  payment_method text not null check (payment_method in ('unlimited', 'pack_credit', 'drop_in_paid', 'first_class_free', 'pilates_paid')),
  stripe_checkout_session_id text,
  booked_at timestamptz not null default now(),
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists class_bookings_one_active_per_session_idx
  on public.class_bookings (session_id, user_id)
  where status = 'booked';

create unique index if not exists class_bookings_one_first_class_free_ever_idx
  on public.class_bookings (user_id)
  where payment_method = 'first_class_free';

create index if not exists class_bookings_session_id_idx on public.class_bookings (session_id) where status = 'booked';

alter table public.class_bookings enable row level security;

drop policy if exists "a member reads their own bookings, admin reads all" on public.class_bookings;
create policy "a member reads their own bookings, admin reads all"
  on public.class_bookings for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()));

-- No write policy for `authenticated` — every write goes through
-- book_class()/cancel_class_booking() (security definer), same convention
-- as class_packs/in_person_purchases above.

-- ----------------------------------------------------------------------------
-- CLASS_WAITLIST — Monthly Unlimited members and pack holders only (per the
-- brief: drop-in/Pilates guests pay at booking time, so auto-charging a
-- card on promotion isn't acceptable and they never get offered this).
-- No stored `position` column — a waitlist's own `created_at` order IS its
-- position, read via row_number() at query time (admin_class_waitlist
-- below), so there's no renumbering to maintain when someone is promoted
-- or leaves.
-- ----------------------------------------------------------------------------
create table if not exists public.class_waitlist (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  payment_method text not null check (payment_method in ('unlimited', 'pack_credit')),
  status text not null default 'waiting' check (status in ('waiting', 'promoted', 'left')),
  created_at timestamptz not null default now()
);

create unique index if not exists class_waitlist_one_active_per_session_idx
  on public.class_waitlist (session_id, user_id)
  where status = 'waiting';

alter table public.class_waitlist enable row level security;

drop policy if exists "a member reads their own waitlist entries, admin reads all" on public.class_waitlist;
create policy "a member reads their own waitlist entries, admin reads all"
  on public.class_waitlist for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- CLASS_BOOKING_SETTINGS — one row, admin-only (not even member-readable —
-- the UI shows a flat "6 hour cancellation window" policy line as static
-- copy regardless of this flag; this is purely the server-side enforcement
-- switch). Defaults to the forgiving direction the brief asks for: the
-- cutoff is never actually enforced yet (cancel_class_booking always
-- succeeds and refunds) — flipping `enforce_cutoff` to true later turns on
-- real enforcement with no further migration needed.
-- ----------------------------------------------------------------------------
create table if not exists public.class_booking_settings (
  id integer primary key default 1,
  enforce_cutoff boolean not null default false,
  cutoff_hours integer not null default 6,
  constraint class_booking_settings_singleton check (id = 1)
);

insert into public.class_booking_settings (id) values (1) on conflict (id) do nothing;

alter table public.class_booking_settings enable row level security;

drop policy if exists "admin reads and writes booking settings" on public.class_booking_settings;
create policy "admin reads and writes booking settings"
  on public.class_booking_settings for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- IN_PERSON_PURCHASES widening — Pilates is a third one-time-payment plan
-- alongside ten_pack/drop_in. `class_session_id`/`booking_error` let a
-- webhook-side booking failure (class somehow full by the time payment
-- confirmed, or any other write error) stay VISIBLE in admin rather than
-- silently lost — "A paid checkout with no booking (webhook failure) must
-- be visible in admin rather than silently lost," per the brief.
-- ----------------------------------------------------------------------------
alter table public.in_person_purchases drop constraint if exists in_person_purchases_plan_check;
alter table public.in_person_purchases add constraint in_person_purchases_plan_check
  check (plan in ('ten_pack', 'drop_in', 'pilates_guest'));

alter table public.in_person_purchases add column if not exists class_session_id uuid references public.class_sessions (id);
alter table public.in_person_purchases add column if not exists booking_error text;

-- ----------------------------------------------------------------------------
-- ensure_class_sessions() — idempotently generates every missing session
-- from class_templates out through `end_date` (default: today + 21 days,
-- matching Community's own rolling booking date strip — see
-- BOOKING_DAYS_AHEAD in CommunityScreen.tsx). Callable by any signed-in
-- member (self-healing: a screen that mounts the schedule calls this
-- before reading availability, so coverage never depends on the cron job
-- below having run yet) as well as by the daily cron job itself, which
-- keeps the rolling 21-day horizon topped up automatically — same
-- belt-and-suspenders pattern as every other generated/scheduled content
-- in this app (see the COW CHAMP award job above).
-- ----------------------------------------------------------------------------
create or replace function public.ensure_class_sessions(end_date date default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  effective_end date := coalesce(end_date, current_date + 21);
begin
  insert into public.class_sessions (class_key, session_date, start_time_local, class_name, class_type, capacity, is_guest_class, price_cents, stripe_price_id)
  select
    t.class_key,
    d::date,
    t.start_time_local,
    t.class_name,
    t.class_type,
    t.default_capacity,
    t.is_guest_class,
    t.price_cents,
    t.stripe_price_id
  from public.class_templates t
  cross join generate_series(current_date, effective_end, interval '1 day') as d
  where t.active
    and extract(dow from d) = any(t.weekdays)
  on conflict (class_key, session_date) do nothing;
end;
$$;

grant execute on function public.ensure_class_sessions(date) to authenticated;

-- ----------------------------------------------------------------------------
-- class_sessions_with_availability() — the schedule UI's one read call.
-- Members can't see other members' class_bookings rows (RLS above), so the
-- aggregate counts have to come from a security-definer function rather
-- than a plain view — no names or per-member detail are ever exposed here,
-- only counts.
-- ----------------------------------------------------------------------------
create or replace function public.class_sessions_with_availability(through_date date default null)
returns table (
  id uuid,
  class_key text,
  session_date date,
  start_at timestamptz,
  class_name text,
  class_type text,
  location_name text,
  capacity integer,
  is_guest_class boolean,
  price_cents integer,
  stripe_price_id text,
  booked_count integer,
  waiting_count integer
)
language sql
security definer
set search_path = public
stable
as $$
  select
    cs.id,
    cs.class_key,
    cs.session_date,
    cs.start_at,
    cs.class_name,
    cs.class_type,
    cs.location_name,
    cs.capacity,
    cs.is_guest_class,
    cs.price_cents,
    cs.stripe_price_id,
    coalesce(b.cnt, 0)::integer as booked_count,
    coalesce(w.cnt, 0)::integer as waiting_count
  from public.class_sessions cs
  left join (
    select session_id, count(*) as cnt from public.class_bookings where status = 'booked' group by session_id
  ) b on b.session_id = cs.id
  left join (
    select session_id, count(*) as cnt from public.class_waitlist where status = 'waiting' group by session_id
  ) w on w.session_id = cs.id
  where cs.session_date >= current_date
    and cs.session_date <= coalesce(through_date, current_date + 21)
  order by cs.session_date, cs.start_at;
$$;

grant execute on function public.class_sessions_with_availability(date) to authenticated;

-- Internal-only helper, deliberately NOT granted to authenticated/anon —
-- spends a credit for an ARBITRARY target user (the promoted waitlist
-- member, not the caller), which use_class_pack_credit() above can't do
-- (it's hard-scoped to auth.uid()). Only callable from another
-- security-definer function owned by the same privileged role in this
-- schema (cancel_class_booking, below) — a plain client can never reach
-- this directly, so it can never drain an arbitrary member's pack.
create or replace function public._promote_waitlist_spend_pack_credit(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target_pack_id uuid;
begin
  select cp.id into target_pack_id
  from public.class_packs cp
  where cp.user_id = target_user_id
    and cp.credits_remaining > 0
    and cp.expires_at > now()
  order by cp.expires_at asc
  limit 1;

  if target_pack_id is null then
    return false;
  end if;

  update public.class_packs cp
  set credits_remaining = cp.credits_remaining - 1
  where cp.id = target_pack_id;

  return true;
end;
$$;

-- ----------------------------------------------------------------------------
-- book_class() — the one atomic entry point for creating a booking, used
-- both by a signed-in member directly (unlimited / pack_credit /
-- first_class_free — synchronous, no payment involved) and by the
-- stripe-webhook Edge Function under the service-role key (drop_in_paid /
-- pilates_paid — payment already confirmed by Stripe before this is ever
-- called). The two paid payment methods are hard-gated to
-- auth.role() = 'service_role' so an ordinary client can never claim a
-- booking is paid for without a real webhook-confirmed purchase behind it
-- — "never by trusting the browser returning from Stripe," per the brief.
--
-- `select ... for update` on the target session row is what makes "a full
-- class can never oversell even with two people booking the same last
-- spot" true: two concurrent callers targeting the same session both try
-- to acquire the same row lock, the second one waits for the first's
-- transaction to commit (or roll back), and only then re-reads the
-- now-current booked_count — so the second caller always sees the first
-- caller's booking already counted before deciding whether there's still
-- room.
-- ----------------------------------------------------------------------------
create or replace function public.book_class(
  p_session_id uuid,
  p_payment_method text,
  p_user_id uuid default null,
  p_stripe_checkout_session_id text default null
)
returns public.class_bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  effective_user_id uuid;
  session_row public.class_sessions;
  booked_count integer;
  existing_booking_id uuid;
  result_row public.class_bookings;
begin
  if p_payment_method in ('drop_in_paid', 'pilates_paid') then
    if auth.role() <> 'service_role' then
      raise exception 'FORBIDDEN: % may only be booked by a confirmed server-side payment.', p_payment_method;
    end if;
    if p_user_id is null then
      raise exception 'MISSING_USER: a service-role booking must specify p_user_id.';
    end if;
    effective_user_id := p_user_id;
  else
    effective_user_id := auth.uid();
    if effective_user_id is null then
      raise exception 'NOT_AUTHENTICATED';
    end if;
  end if;

  -- Row lock first — every concurrent booker of this exact session
  -- serializes here before anyone reads booked_count.
  select * into session_row from public.class_sessions where id = p_session_id for update;
  if session_row.id is null then
    raise exception 'SESSION_NOT_FOUND';
  end if;

  select id into existing_booking_id
  from public.class_bookings
  where session_id = p_session_id and user_id = effective_user_id and status = 'booked';
  if existing_booking_id is not null then
    raise exception 'ALREADY_BOOKED';
  end if;

  select count(*) into booked_count from public.class_bookings where session_id = p_session_id and status = 'booked';
  if session_row.capacity is not null and booked_count >= session_row.capacity then
    raise exception 'CLASS_FULL';
  end if;

  if p_payment_method = 'unlimited' then
    if not (
      public.is_admin(effective_user_id)
      or exists (
        select 1 from public.subscriptions
        where user_id = effective_user_id and plan = 'in_person_monthly' and status = 'active'
      )
    ) then
      raise exception 'NOT_ELIGIBLE: no active Monthly Unlimited subscription.';
    end if;
  elsif p_payment_method = 'pack_credit' then
    -- Spends a credit for THIS caller via the existing, auth.uid()-scoped
    -- RPC from migration_019 — raises on its own if there's no eligible
    -- pack, which this function lets propagate (no booking row is created).
    perform public.use_class_pack_credit();
  elsif p_payment_method = 'first_class_free' then
    if session_row.is_guest_class then
      raise exception 'NOT_ELIGIBLE: first class free does not apply to Pilates.';
    end if;
    if exists (select 1 from public.class_bookings where user_id = effective_user_id and payment_method = 'first_class_free') then
      raise exception 'ALREADY_USED: first class free has already been redeemed on this account.';
    end if;
  end if;
  -- drop_in_paid / pilates_paid: no further eligibility check needed here
  -- — Stripe has already been paid, and the service-role gate above is the
  -- real guard; the partial unique index on class_bookings_one_first_class_free_ever_idx
  -- is the final backstop against a race on the first_class_free branch
  -- regardless of the exists() check above.

  insert into public.class_bookings (session_id, user_id, payment_method, stripe_checkout_session_id)
  values (p_session_id, effective_user_id, p_payment_method, p_stripe_checkout_session_id)
  returning * into result_row;

  return result_row;
end;
$$;

grant execute on function public.book_class(uuid, text, uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- cancel_class_booking() — member-scoped (auth.uid() = the booking's own
-- owner only). Refunds based on the BOOKING'S OWN recorded payment_method,
-- never the account's current pack state (see the class_bookings table
-- comment above for why this matters). Returns enough for the calling
-- edge function to know whether a REAL Stripe refund is still needed
-- (drop_in_paid/pilates_paid) — this SQL function can't call the Stripe
-- API itself, so money actually moves in the cancel-class-booking Edge
-- Function, which calls this RPC first (under the member's own JWT) and
-- then issues the Stripe refund if `needs_stripe_refund` comes back true.
-- The cancellation-cutoff check is in here, behind `class_booking_settings`
-- — enforce_cutoff defaults false, so it never actually blocks anything
-- yet; flipping that one flag turns on real enforcement with no further
-- deploy.
-- ----------------------------------------------------------------------------
create or replace function public.cancel_class_booking(p_booking_id uuid)
returns table (payment_method text, needs_stripe_refund boolean, stripe_checkout_session_id text)
language plpgsql
security definer
set search_path = public
as $$
declare
  booking_row public.class_bookings;
  session_row public.class_sessions;
  settings_row public.class_booking_settings;
  next_waiter public.class_waitlist;
  promoted_booking public.class_bookings;
  pack_spent boolean;
begin
  select * into booking_row from public.class_bookings where id = p_booking_id and user_id = auth.uid() and status = 'booked';
  if booking_row.id is null then
    raise exception 'NOT_FOUND';
  end if;

  select * into session_row from public.class_sessions where id = booking_row.session_id for update;

  select * into settings_row from public.class_booking_settings where id = 1;
  if settings_row.enforce_cutoff and session_row.start_at is not null
     and now() > (session_row.start_at - (settings_row.cutoff_hours || ' hours')::interval) then
    raise exception 'CUTOFF_PASSED';
  end if;

  update public.class_bookings set status = 'cancelled', cancelled_at = now() where id = p_booking_id;

  if booking_row.payment_method = 'pack_credit' then
    perform public.refund_class_pack_credit();
  end if;

  -- A spot just freed on a capped session — promote the longest-waiting
  -- eligible waitlist entry, if any. Pilates (uncapped) never has a
  -- waitlist to promote from in the first place.
  if session_row.capacity is not null then
    select * into next_waiter
    from public.class_waitlist
    where session_id = booking_row.session_id and status = 'waiting'
    order by created_at asc
    limit 1
    for update;

    if next_waiter.id is not null then
      if next_waiter.payment_method = 'pack_credit' then
        pack_spent := public._promote_waitlist_spend_pack_credit(next_waiter.user_id);
      else
        pack_spent := true; -- unlimited: nothing to spend
      end if;

      -- Only actually promote if the credit spend succeeded (or wasn't
      -- needed) — a waitlisted member whose pack lapsed between joining
      -- and now simply stays on the waitlist for the NEXT cancellation,
      -- rather than ever being booked without having paid for it.
      if pack_spent then
        insert into public.class_bookings (session_id, user_id, payment_method)
        values (next_waiter.session_id, next_waiter.user_id, next_waiter.payment_method)
        returning * into promoted_booking;
        update public.class_waitlist set status = 'promoted' where id = next_waiter.id;
      end if;
    end if;
  end if;

  return query select
    booking_row.payment_method,
    booking_row.payment_method in ('drop_in_paid', 'pilates_paid'),
    booking_row.stripe_checkout_session_id;
end;
$$;

grant execute on function public.cancel_class_booking(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- join_waitlist() / leave_waitlist() — Monthly Unlimited and active pack
-- holders only, and only for a session that's genuinely full right now
-- (otherwise the member should just book directly). A pack credit is
-- deliberately NOT spent at join time — only at promotion (see
-- cancel_class_booking above), matching "spending their pack credit at
-- that moment if that is their payment method" in the brief.
-- ----------------------------------------------------------------------------
create or replace function public.join_waitlist(p_session_id uuid, p_payment_method text)
returns public.class_waitlist
language plpgsql
security definer
set search_path = public
as $$
declare
  effective_user_id uuid := auth.uid();
  session_row public.class_sessions;
  booked_count integer;
  result_row public.class_waitlist;
begin
  if effective_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_payment_method not in ('unlimited', 'pack_credit') then
    raise exception 'INVALID_PAYMENT_METHOD: only unlimited or pack_credit members can join a waitlist.';
  end if;

  select * into session_row from public.class_sessions where id = p_session_id;
  if session_row.id is null then
    raise exception 'SESSION_NOT_FOUND';
  end if;
  if session_row.is_guest_class or session_row.capacity is null then
    raise exception 'NOT_ELIGIBLE: this class has no waitlist.';
  end if;

  if p_payment_method = 'unlimited' then
    if not (
      public.is_admin(effective_user_id)
      or exists (select 1 from public.subscriptions where user_id = effective_user_id and plan = 'in_person_monthly' and status = 'active')
    ) then
      raise exception 'NOT_ELIGIBLE: no active Monthly Unlimited subscription.';
    end if;
  else
    if not exists (
      select 1 from public.class_packs
      where user_id = effective_user_id and credits_remaining > 0 and expires_at > now()
    ) then
      raise exception 'NOT_ELIGIBLE: no class pack credits available.';
    end if;
  end if;

  select count(*) into booked_count from public.class_bookings where session_id = p_session_id and status = 'booked';
  if session_row.capacity is not null and booked_count < session_row.capacity then
    raise exception 'NOT_FULL: this class still has room — book it directly.';
  end if;

  if exists (select 1 from public.class_bookings where session_id = p_session_id and user_id = effective_user_id and status = 'booked') then
    raise exception 'ALREADY_BOOKED';
  end if;

  insert into public.class_waitlist (session_id, user_id, payment_method)
  values (p_session_id, effective_user_id, p_payment_method)
  returning * into result_row;

  return result_row;
end;
$$;

grant execute on function public.join_waitlist(uuid, text) to authenticated;

create or replace function public.leave_waitlist(p_waitlist_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.class_waitlist where id = p_waitlist_id and user_id = auth.uid() and status = 'waiting';
end;
$$;

grant execute on function public.leave_waitlist(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- admin_class_roster() / admin_class_waitlist() — Doc's real, multi-device
-- roster: who's booked, how (payment_method), and whether it's their
-- first class, read from the database every admin device shares, not
-- whichever phone happened to make the booking. Same "zero rows for a
-- non-admin caller, never an error" convention as admin_list_members()
-- (migration_008).
-- ----------------------------------------------------------------------------
create or replace function public.admin_class_roster(p_session_id uuid)
returns table (
  booking_id uuid,
  user_id uuid,
  display_name text,
  payment_method text,
  booked_at timestamptz,
  is_first_class boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    return;
  end if;

  return query
    select
      cb.id,
      cb.user_id,
      coalesce(p.display_name, 'Member'),
      cb.payment_method,
      cb.booked_at,
      cb.payment_method = 'first_class_free'
    from public.class_bookings cb
    join public.profiles p on p.id = cb.user_id
    where cb.session_id = p_session_id and cb.status = 'booked'
    order by cb.booked_at asc;
end;
$$;

grant execute on function public.admin_class_roster(uuid) to authenticated;

create or replace function public.admin_class_waitlist(p_session_id uuid)
returns table (
  waitlist_id uuid,
  user_id uuid,
  display_name text,
  payment_method text,
  joined_at timestamptz,
  waitlist_position integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    return;
  end if;

  return query
    select
      w.id,
      w.user_id,
      coalesce(p.display_name, 'Member'),
      w.payment_method,
      w.created_at,
      row_number() over (order by w.created_at asc)::integer
    from public.class_waitlist w
    join public.profiles p on p.id = w.user_id
    where w.session_id = p_session_id and w.status = 'waiting'
    order by w.created_at asc;
end;
$$;

grant execute on function public.admin_class_waitlist(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- admin_update_template_capacity() — the one admin control for "Doc's
-- classes default to a cap of 30, editable per class by admin (planned
-- bump to 50 around Memorial Day)." Updates the template's own
-- default_capacity (so every FUTURE generation picks it up) AND cascades
-- immediately to every not-yet-started class_sessions row already
-- generated for that class_key, so a capacity bump is visible across the
-- whole rolling booking window right away, not just for sessions generated
-- after the edit. p_capacity = null means uncapped.
-- ----------------------------------------------------------------------------
create or replace function public.admin_update_template_capacity(p_class_key text, p_capacity integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'FORBIDDEN';
  end if;

  update public.class_templates set default_capacity = p_capacity where class_key = p_class_key;
  update public.class_sessions
  set capacity = p_capacity
  where class_key = p_class_key
    and session_date >= current_date
    and not is_guest_class;
end;
$$;

grant execute on function public.admin_update_template_capacity(text, integer) to authenticated;

-- ----------------------------------------------------------------------------
-- admin_pilates_month_summary() — the Content Library-style simple month
-- view for Pilates: bookings count and gross revenue (for the 70/30
-- instructor split), straight off in_person_purchases.amount_cents, which
-- the webhook already captures verbatim from Stripe's own amount_total —
-- one real number, not a derived estimate.
-- ----------------------------------------------------------------------------
create or replace function public.admin_pilates_month_summary(p_year integer, p_month integer)
returns table (bookings_count integer, gross_revenue_cents bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  range_start timestamptz;
  range_end timestamptz;
begin
  if not public.is_admin(auth.uid()) then
    return;
  end if;

  range_start := make_date(p_year, p_month, 1)::timestamptz;
  range_end := (make_date(p_year, p_month, 1) + interval '1 month')::timestamptz;

  return query
    select
      count(*)::integer,
      coalesce(sum(amount_cents), 0)::bigint
    from public.in_person_purchases
    where plan = 'pilates_guest' and created_at >= range_start and created_at < range_end;
end;
$$;

grant execute on function public.admin_pilates_month_summary(integer, integer) to authenticated;

-- ----------------------------------------------------------------------------
-- Keep the rolling 21-day session horizon topped up automatically even if
-- no member's device happens to call ensure_class_sessions() for a
-- while — same belt-and-suspenders reasoning as the COW CHAMP job above
-- (a client-triggered call is the fast path; this cron job is the backstop
-- that means coverage is never more than a day stale).
-- ----------------------------------------------------------------------------
do $$
declare
  existing_job_id bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    select jobid into existing_job_id from cron.job where jobname = 'ensure-class-sessions-daily';
    if existing_job_id is not null then
      perform cron.unschedule(existing_job_id);
    end if;
    perform cron.schedule(
      'ensure-class-sessions-daily',
      '0 6 * * *',
      $cron$select public.ensure_class_sessions();$cron$
    );
  end if;
end;
$$;
