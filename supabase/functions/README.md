# Supabase Edge Functions

Real, trusted Stripe billing work for the ONLINE membership tiers. This app
is a static site with no server of its own, so anything that must be
trusted (reading `STRIPE_SECRET_KEY`, verifying a webhook signature,
deciding who really gets access) runs here instead of in the browser.

- `create-checkout` — a signed-in member calls this to start a real Stripe
  Checkout session for Monthly or Annual (Online). Re-checks Founding 50
  eligibility itself server-side; the client never gets to say "give me the
  founding price."
- `stripe-webhook` — Stripe calls this directly (not the app). Verifies the
  request's signature, then writes the real truth about a member's
  subscription to the database — the only place that ever happens.
- `customer-portal` — a signed-in member with an existing subscription calls
  this to open Stripe's hosted billing portal (update card, cancel).

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
