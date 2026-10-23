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
