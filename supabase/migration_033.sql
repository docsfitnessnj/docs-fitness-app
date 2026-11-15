-- Doc's Fitness — migration 033
-- ============================================================================
-- Round 56: email. Three real member/owner-facing sends, all through
-- Resend, plus a server-side master safety switch and a permanent admin
-- preview control.
--
-- Pieces, all additive and safe to re-run:
-- 1. email_settings -- the TEST/LIVE master switch (same singleton shape as
--    founding_fifty_settings, migration_022.sql), defaulting to 'test' so
--    this migration can never arm anything. Admin-only read/write -- no
--    ordinary member needs to see this; the two member-email-sending Edge
--    Functions read it with the service role, which bypasses RLS anyway.
-- 2. profiles gains `signup_path` (which door signup came through --
--    the most "reliably known" thing available at that moment, captured
--    via Supabase Auth's own signUp() options.data, landing in
--    auth.users.raw_user_meta_data atomically with account creation),
--    `newsletter_opt_in` (closes a real, pre-existing gap -- the Welcome
--    screen's pre-checked newsletter box has never persisted anywhere;
--    it was pure client-local state in MembershipContext), and
--    `weekly_email_opt_in` (new, defaults true -- the Sunday Drop email's
--    own opt-out, separate from the newsletter).
-- 3. handle_new_user() (migration_008.sql originally, setup.sql today) is
--    extended to persist both new opt-in columns from the signup metadata
--    above, and to fire the owner's New Member Alert (plus, if opted in,
--    the newsletter Audience add) via pg_net -- one HTTP call to
--    notify-new-signup, in the SAME trigger that already creates the
--    profile row, so there is no race and no second write.
-- 4. release_scheduled_weeks_if_due() (migration_030/031/032.sql) is
--    extended at the exact point its own comment already marked: right
--    after the release post is inserted, one pg_net call to
--    send-weekly-release-email with { week_id }. Idempotency is already
--    structural -- the loop only ever processes a week once
--    (`released_at is null`), so the email call inherits that exact
--    same exactly-once guarantee with no new flag needed.
-- 5. weekly_release_email_recipients() -- the one place "who gets the
--    Sunday Drop email" is decided, callable by the Edge Function via the
--    service role. Confirmed exclusion rule (owner's own words): every
--    signed-in member gets it, including online_free (that's who this
--    email exists to pull back in) and admin, EXCEPT a real, persistent
--    "booking-only" tier -- which, checked directly against the real
--    schema, is ONLY the active-class-pack-with-no-subscription case
--    (MembershipContext.tsx's own real `tier === 'ten_pack'` derivation).
--    A real Drop In / Downbeach Pilates one-time purchaser has no
--    persistent flag distinguishing them from a plain never-purchased
--    online_free account (profiles.in_person_plan is never set to
--    'drop_in' by the webhook, and pilates_guest sets no profile flag at
--    all) -- confirmed by the owner to receive the email the same as any
--    other online_free member, so no further history lookup is needed.
--    weekly_email_opt_in = false always wins, regardless of tier.
--
-- Both HTTP call sites (in handle_new_user() and
-- release_scheduled_weeks_if_due()) wrap the Vault secret read AND the
-- net.http_post() call itself in their own `begin ... exception when
-- others ...` block -- a missing/not-yet-configured pg_net or Vault setup
-- (true of this local test harness, and true of a brand-new Supabase
-- project before the owner's own one-time Vault step below) can only ever
-- skip the email side effect; it can never block or fail the REAL work
-- (the profile row, the release post, the challenges mirror). This is
-- also what makes the rest of this migration fully testable against a
-- local Postgres with neither pg_net nor Vault installed.
--
-- pg_net is a Supabase-managed extension (same `create extension if not
-- exists` footing as pg_cron, migration_030.sql, which this project
-- already proved works) -- the standard, documented way a Postgres
-- function makes an outbound HTTP call; it's what Supabase's own Database
-- Webhooks feature is built on. `create extension if not exists pg_net;`
-- below is a no-op if it's not available to self-enable in this exact
-- project (that case is handled the same defensive way as everything
-- else here -- the exception handlers at each call site).
--
-- ONE NEW MANUAL OWNER STEP, beyond RESEND_API_KEY (already set): a
-- shared secret so Postgres can prove to the Edge Functions that a given
-- call really came from this project's own trigger/cron, not a stranger
-- POSTing to a public URL (the same role Stripe's own signature header
-- plays for stripe-webhook, which also has no real session to check).
-- Generate any long random string (e.g. `openssl rand -hex 32`), then:
--   1. In the Supabase SQL Editor, run once:
--        select vault.create_secret('<that value>', 'db_webhook_secret');
--   2. In Project Settings -> Edge Functions -> Secrets, add
--        DB_WEBHOOK_SECRET = <the exact same value>
-- Until both are set, the two trigger-fired emails (new member alert,
-- weekly drop) simply never fire (caught by the exception handlers
-- above) -- everything else in the app is completely unaffected.
--
-- Safe to run once, and safe to re-run.
-- ============================================================================

create extension if not exists pg_net;

-- ----------------------------------------------------------------------------
-- 1. email_settings
-- ----------------------------------------------------------------------------
create table if not exists public.email_settings (
  id int primary key default 1,
  -- TEST (the default) reroutes every member-facing send through
  -- dispatchToMembers (see supabase/functions/_shared/memberEmailDispatch.ts)
  -- to exactly one copy, to the owner, with a [TEST] subject prefix and a
  -- banner stating the real recipient count and the first few real
  -- addresses -- no member ever receives anything while this is 'test'.
  -- LIVE sends to the real recipient list. The owner's own New Member
  -- Alert and Payment Alert never read this column at all -- they only
  -- ever go to the owner's inbox regardless, so there is nothing for a
  -- mode to reroute.
  mode text not null default 'test' check (mode in ('test', 'live')),
  constraint email_settings_singleton check (id = 1)
);

alter table public.email_settings enable row level security;

drop policy if exists "only admin can read email settings" on public.email_settings;
create policy "only admin can read email settings"
  on public.email_settings for select
  to authenticated
  using (public.is_admin(auth.uid()));

drop policy if exists "only admin can set email mode" on public.email_settings;
create policy "only admin can set email mode"
  on public.email_settings for update
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

insert into public.email_settings (id, mode) values (1, 'test') on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 2. profiles columns
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists signup_path text check (signup_path is null or signup_path in ('online_trial', 'book_class', 'undecided')),
  add column if not exists newsletter_opt_in boolean not null default false,
  add column if not exists weekly_email_opt_in boolean not null default true;

-- ----------------------------------------------------------------------------
-- 3. handle_new_user() -- persists the two new opt-in columns from signup
-- metadata, then dispatches the owner's New Member Alert (and, if opted
-- in, the newsletter Audience add) via notify-new-signup.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display_name text;
  v_signup_path text;
  v_newsletter boolean;
  v_secret text;
begin
  v_display_name := coalesce(nullif(split_part(new.email, '@', 1), ''), 'Member');
  v_signup_path := new.raw_user_meta_data->>'signup_path';
  v_newsletter := coalesce((new.raw_user_meta_data->>'newsletter_opt_in')::boolean, false);

  insert into public.profiles (id, display_name, created_at, signup_path, newsletter_opt_in)
  values (new.id, v_display_name, now(), v_signup_path, v_newsletter)
  on conflict (id) do nothing;

  begin
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'db_webhook_secret';
    if v_secret is not null then
      perform net.http_post(
        url := 'https://qooezwnskaqvmquydijg.supabase.co/functions/v1/notify-new-signup',
        body := jsonb_build_object(
          'email', new.email,
          'display_name', v_display_name,
          'signup_path', v_signup_path,
          'newsletter_opt_in', v_newsletter
        ),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret)
      );
    end if;
  exception when others then
    -- A missing pg_net/Vault setup (a fresh local test database, or
    -- before the owner's own one-time Vault step above) must never block
    -- real account creation -- the insert above has already succeeded by
    -- the time this runs.
    raise warning 'handle_new_user: could not dispatch notify-new-signup (%)', sqlerrm;
  end;

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. release_scheduled_weeks_if_due() -- unchanged except for one new
-- pg_net call, at the exact point migration_032's own comment marked.
-- ----------------------------------------------------------------------------
create or replace function public.release_scheduled_weeks_if_due()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  w record;
  admin_id uuid;
  cow record;
  mon_wod record;
  tue_wod record;
  thu_wod record;
  fri_wod record;
  closer_idx int;
  closer text;
  wed_date date;
  wed_line text;
  wod_lines text;
  post_body text;
  v_secret text;
begin
  select id into admin_id from public.profiles where is_admin = true order by created_at asc limit 1;
  if admin_id is null then
    return;
  end if;

  for w in
    select * from public.scheduled_weeks
    where release_at <= now() and released_at is null
    order by release_at asc
  loop
    select count(*) into closer_idx from public.scheduled_weeks where released_at is not null;
    closer := (array[
      'Start your week off strong.',
      'Never miss a Monday.',
      'The 2x Wednesday Protocol: get 2 workouts in by Wednesday. Any 2 count.',
      'See you Monday morning.',
      'The board runs on your wins. Post them.',
      'New week, clean slate. Badges reset Monday. Earn them again.'
    ])[(closer_idx % 6) + 1];

    update public.scheduled_weeks set released_at = now() where id = w.id;

    select * into cow from public.scheduled_cows where week_id = w.id;
    if cow.id is not null then
      insert into public.challenges (id, title, scoring_type, week_start, week_end)
      values (
        w.id::text,
        cow.name,
        cow.scoring_type,
        w.release_at,
        ((w.week_start_date + 5) + time '12:00') at time zone 'America/New_York'
      )
      on conflict (id) do update set
        title = excluded.title,
        scoring_type = excluded.scoring_type,
        week_start = excluded.week_start,
        week_end = excluded.week_end;
    end if;

    update public.community_posts set pinned = false where is_weekly_release = true and pinned = true;

    select * into mon_wod from public.scheduled_wods where week_id = w.id and day_of_week = 'mon';
    select * into tue_wod from public.scheduled_wods where week_id = w.id and day_of_week = 'tue';
    select * into thu_wod from public.scheduled_wods where week_id = w.id and day_of_week = 'thu';
    select * into fri_wod from public.scheduled_wods where week_id = w.id and day_of_week = 'fri';

    wed_date := w.week_start_date + 2;
    if cow.id is not null then
      wed_line := 'WEDNESDAY ' || public.scheduled_week_date_label(wed_date) || ': DOC''S COW · [[' || cow.name || ']] (THE CHALLENGE OF THE WEEK)|cow';
    else
      wed_line := 'WEDNESDAY ' || public.scheduled_week_date_label(wed_date) || ': DOC''S COW';
    end if;

    wod_lines := '';
    if mon_wod.id is not null then
      wod_lines := wod_lines || 'MONDAY ' || public.scheduled_week_date_label(w.week_start_date) || ': [[' || mon_wod.name || ']]|wod:' || to_char(w.week_start_date, 'YYYY-MM-DD') || E'\n';
    end if;
    if tue_wod.id is not null then
      wod_lines := wod_lines || 'TUESDAY ' || public.scheduled_week_date_label(w.week_start_date + 1) || ': [[' || tue_wod.name || ']]|wod:' || to_char(w.week_start_date + 1, 'YYYY-MM-DD') || E'\n';
    end if;
    wod_lines := wod_lines || wed_line || E'\n';
    if thu_wod.id is not null then
      wod_lines := wod_lines || 'THURSDAY ' || public.scheduled_week_date_label(w.week_start_date + 3) || ': [[' || thu_wod.name || ']]|wod:' || to_char(w.week_start_date + 3, 'YYYY-MM-DD') || E'\n';
    end if;
    if fri_wod.id is not null then
      wod_lines := wod_lines || 'FRIDAY ' || public.scheduled_week_date_label(w.week_start_date + 4) || ': [[' || fri_wod.name || ']]|wod:' || to_char(w.week_start_date + 4, 'YYYY-MM-DD') || E'\n';
    end if;

    post_body := 'THE NEW WEEK IS LIVE' || E'\n\n' || 'YOUR WORKOUTS' || E'\n\n' || rtrim(wod_lines, E'\n') || E'\n\n' || closer;

    insert into public.community_posts (author_id, title, body, kind, pinned, is_weekly_release)
    values (admin_id, '', post_body, 'text', true, true);

    -- Round 56: the Sunday Drop email, same loop iteration, same
    -- exactly-once guarantee the post insert above already has (this
    -- whole loop body only ever runs once per week, guarded by
    -- `released_at is null` above) -- no separate idempotency flag
    -- needed. Wrapped exactly like handle_new_user()'s own dispatch, for
    -- the same reason: a missing pg_net/Vault setup must never roll back
    -- or interrupt the real release (the post above has already
    -- committed as part of this same function call by the time this
    -- runs).
    begin
      select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'db_webhook_secret';
      if v_secret is not null then
        perform net.http_post(
          url := 'https://qooezwnskaqvmquydijg.supabase.co/functions/v1/send-weekly-release-email',
          body := jsonb_build_object('week_id', w.id),
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret)
        );
      end if;
    exception when others then
      raise warning 'release_scheduled_weeks_if_due: could not dispatch send-weekly-release-email for week % (%)', w.id, sqlerrm;
    end;
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. weekly_release_email_recipients() -- the one place "who gets the
-- Sunday Drop email" is decided. security definer, callable by the
-- service role only (an ordinary member never needs this directly).
-- ----------------------------------------------------------------------------
create or replace function public.weekly_release_email_recipients()
returns table(user_id uuid, email text, display_name text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select p.id, u.email, p.display_name
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.weekly_email_opt_in = true
    and not (
      -- The one real, persistent "booking-only" state: an active class
      -- pack (credits_remaining > 0 and not yet expired, the exact
      -- definition ClassPackContext.tsx's own pickActivePack() uses) with
      -- no active/trialing subscription standing in front of it --
      -- MembershipContext.tsx's own real `tier === 'ten_pack'`
      -- derivation. A subscriber who also holds a pack keeps their
      -- subscription-based full access and must still receive this
      -- email, which is exactly why both conditions are required here.
      exists (
        select 1 from public.class_packs cp
        where cp.user_id = p.id and cp.credits_remaining > 0 and cp.expires_at > now()
      )
      and not exists (
        select 1 from public.subscriptions s
        where s.user_id = p.id and s.status in ('trialing', 'active')
      )
    );
end;
$$;

grant execute on function public.weekly_release_email_recipients() to service_role;
