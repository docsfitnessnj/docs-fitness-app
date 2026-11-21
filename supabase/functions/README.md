# Supabase Edge Functions

Real, trusted Stripe billing work for every membership tier — online AND,
from Stripe round two, the three IN PERSON plans (Monthly Unlimited, 10
Class Pack, Drop In). This app is a static site with no server of its own,
so anything that must be trusted (reading `STRIPE_SECRET_KEY`, verifying a
webhook signature, deciding who really gets access) runs here instead of
in the browser.

- `create-checkout` — a signed-in member calls this to start a real Stripe
  Checkout session for one of 6 plans: Monthly or Annual (Online), Monthly
  Unlimited (IN PERSON) — all 3 real subscriptions — or 10 Class Pack / Drop
  In / Downbeach Pilates (IN PERSON, migration_023), three one-time
  payments. Re-checks Founding 50 eligibility itself server-side; the
  client never gets to say "give me the founding price," and never gets to
  send a raw Stripe price id either — only a plan name, which this
  function maps to the real price itself. Drop In / Downbeach Pilates also
  require a `classSessionId`, carried through in the Checkout Session's own
  metadata so the webhook can book the exact right class.
- `stripe-webhook` — Stripe calls this directly (not the app). Verifies the
  request's signature, then writes the real truth about a member's
  subscription (`subscriptions` table) or one-time in-person purchase
  (`class_packs` for 10 Class Pack, `in_person_purchases` for Drop In/
  Downbeach Pilates/10 Class Pack) to the database — the only place any of
  that ever happens. For Drop In and Downbeach Pilates specifically
  (migration_023), also calls `book_class` itself (service-role, the same
  function the member-facing client calls for unlimited/pack_credit/
  first_class_free bookings) to create the real booking the instant
  payment confirms — never trusting the browser's own return trip — and
  writes `in_person_purchases.booking_error` if that ever fails, so a paid
  checkout with no booking is visible in admin rather than silently lost.
  Also keeps `profiles.in_person_plan` in sync for Monthly Unlimited and 10
  Class Pack, the column Member Manager's roster and
  `has_group_chat_access()` key off. Listens for the same event types as
  round one (`checkout.session.completed`, `customer.subscription.created/
  updated/deleted`, `invoice.payment_failed`) — no Stripe dashboard webhook
  configuration change has ever been needed since round one, as long as the
  endpoint stays subscribed to those 4 event types.
- `customer-portal` — a signed-in member with an existing subscription (online
  or in-person Monthly Unlimited) calls this to open Stripe's hosted billing
  portal (update card, cancel).
- `refund-booking` (migration_023) — called by the client right after
  cancelling a booking whose own payment method was `drop_in_paid` or
  `pilates_paid` (`cancel_class_booking`'s own `needs_stripe_refund` flag).
  Takes only a `bookingId` — every other fact (whose booking it is, what
  was actually paid, whether it's really cancelled) is re-derived
  server-side from the booking's own row, never trusted from the client,
  so this can only ever refund a booking that's genuinely the caller's
  own, genuinely cancelled, and genuinely paid.
- `stripe-webhook` also sends Doc's own Payment Alert (Round 56) — a
  plain, scannable email to his own inbox the instant a real payment
  lands, from the same `checkout.session.completed` handler, after every
  real payment/booking side effect above has already completed. Wrapped
  in its own try/catch at the call site so a Resend failure can never
  surface as a failed webhook. This is an owner-only alert — it never
  touches `email_settings`/EMAIL TEST MODE, since it only ever reaches
  Doc's own inbox regardless.
- `notify-new-signup` (migration_033, Round 56; widened Round 64) — called
  by `handle_new_user()`'s own Postgres trigger over `pg_net`, once per new
  account, with the signup's email/display name/`signup_path` (which of
  the About page's two fast-path doors, if any, was tapped) and whether
  the newsletter checkbox was checked. Sends Doc's New Member Alert (a
  direct `sendEmail()` call, untouched by EMAIL TEST MODE — it only ever
  reaches Doc's own inbox), adds the new member to the Resend Audience "The
  Weekly Kettlebell" if the checkbox was checked, and — Round 64 — sends
  the new member their own WELCOME TO DOC'S FITNESS email (online or
  in-person, picked by `signup_path` via `_shared/welcomeEmail.ts`'s
  `pickWelcomeVersion()`), routed through `_shared/memberEmailDispatch.ts`'s
  `dispatchToMembers()` with that one member as the recipient — the same
  EMAIL TEST MODE enforcement point the Sunday Drop uses. All three jobs
  are independent and best-effort; a failure in any one (including the new
  welcome-email send) is logged, never thrown back at the trigger. No
  Supabase JWT exists inside a Postgres trigger, so `verify_jwt` is `false`
  here; `DB_WEBHOOK_SECRET` (below) is the real gate instead.
- `send-weekly-release-email` (migration_033, Round 56) — called by
  `release_scheduled_weeks_if_due()`'s own `pg_net` call, exactly once per
  released week (the same `released_at is null` guard that already makes
  the release post exactly-once covers this too). Renders the Sunday Drop
  email (shared, byte-for-byte, with `admin-send-test-email` below via
  `_shared/weeklyReleaseEmail.ts`) and sends it through
  `_shared/memberEmailDispatch.ts`'s `dispatchToMembers()` — the one real
  enforcement point for EMAIL TEST MODE (`email_settings.mode`). Same
  `DB_WEBHOOK_SECRET` gate as `notify-new-signup`.
- `admin-send-test-email` (Round 56) — a **permanent** admin-only feature
  (the EMAIL admin screen's SEND TEST EMAIL button, reachable any number
  of times), not a one-time launch-day step. Renders the real Sunday Drop
  email for the next scheduled week (or the most recently released one)
  through the exact same shared renderer `send-weekly-release-email` uses,
  and sends it only to Doc's own inbox — deliberately never imports
  `dispatchToMembers`, so it's unaffected by EMAIL TEST MODE in either
  direction. `verify_jwt` is `true`; a real signed-in admin session is
  required, checked the same way every other admin-only Edge Function in
  this app does.
- `admin-send-test-welcome-emails` (Round 64) — a **permanent** admin-only
  feature (the EMAIL admin screen's SEND TEST WELCOME EMAILS button,
  beside SEND TEST EMAIL), reachable any number of times. Sends BOTH
  welcome-email versions — ONLINE and IN PERSON — straight to Doc's own
  inbox through the exact same `_shared/welcomeEmail.ts` renderer
  `notify-new-signup` uses, each tagged in its subject (`[WELCOME TEST:
  ONLINE]`/`[WELCOME TEST: IN PERSON]`) so they're easy to tell apart.
  Same asymmetry as `admin-send-test-email`: deliberately never imports
  `dispatchToMembers`, so it's unaffected by EMAIL TEST MODE. `verify_jwt`
  is `true`, same admin check as every other admin-only function here.

## Deploying

`.github/workflows/deploy-supabase-functions.yml` deploys every function in
this folder automatically on every push to `main` that touches
`supabase/functions/**`, using the Supabase CLI and a **`SUPABASE_ACCESS_TOKEN`
repository secret Doc adds himself** (GitHub repo Settings -> Secrets and
variables -> Actions -> New repository secret). Functions will not deploy —
and Stripe checkout/webhook/portal will not work — until that secret exists.

Get the token from the Supabase dashboard: account avatar (top right) ->
Access Tokens -> Generate new token.

## Secrets these functions read at runtime

Set in the Supabase dashboard for this project (Project Settings -> Edge
Functions -> Secrets), never in this repo:

- `STRIPE_SECRET_KEY` — from the Stripe dashboard, Developers -> API keys
  (sandbox/test mode). Starts with `sk_test_`.
- `STRIPE_WEBHOOK_SECRET` — created when you add the webhook endpoint in the
  Stripe dashboard (Developers -> Webhooks -> Add endpoint), pointing at
  `https://qooezwnskaqvmquydijg.supabase.co/functions/v1/stripe-webhook`.
  Stripe shows you the signing secret (`whsec_...`) right after you create
  the endpoint.
- `RESEND_API_KEY` (Round 56) — a full-access API key from the Resend
  dashboard, for the `docsfitnessnj.com` domain (already verified there).
  Read by `_shared/resend.ts` exactly like `STRIPE_SECRET_KEY` above —
  never hardcoded, never logged.
- `RESEND_AUDIENCE_ID` (Round 56, optional) — the Resend Audience id for
  "The Weekly Kettlebell," if you've already created it by hand (e.g.
  while importing the existing subscriber list via CSV). If unset,
  `notify-new-signup` looks it up by name on first use and creates it if
  it doesn't exist yet — setting this just skips that lookup.
- `DB_WEBHOOK_SECRET` (Round 56) — a shared secret ONLY you generate, used
  so `migration_033.sql`'s own Postgres triggers (`handle_new_user()`,
  `release_scheduled_weeks_if_due()`) can call `notify-new-signup` and
  `send-weekly-release-email` over `pg_net` and prove it's really them —
  neither function has a Supabase JWT to check instead, since a Postgres
  trigger has no session of its own. **Two places, the same value:**
  1. In the Supabase SQL editor, run:
     `select vault.create_secret('<a long random string you generate>', 'db_webhook_secret');`
  2. Set `DB_WEBHOOK_SECRET` to that exact same string as an Edge Function
     secret here.
  Both steps are required — the migration's own trigger reads the Vault
  secret to attach it to the outbound call; the receiving function reads
  the Edge Function secret to check it. Mismatched or missing either side
  means the New Member Alert and the Sunday Drop email silently never
  fire (caught, logged, and swallowed — never a failed signup or a failed
  week release).

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are
injected automatically by the Supabase platform into every deployed
function — nothing to set by hand for those three.

## Local testing

```
supabase login
supabase link --project-ref qooezwnskaqvmquydijg
supabase secrets set STRIPE_SECRET_KEY=sk_test_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
supabase functions deploy
```

To watch webhook events land during manual testing, use the Stripe CLI:
`stripe listen --forward-to https://qooezwnskaqvmquydijg.supabase.co/functions/v1/stripe-webhook`.
