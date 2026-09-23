import Stripe from 'https://esm.sh/stripe@17.7.0?target=deno';

// STRIPE_SECRET_KEY is a Supabase project secret Doc sets himself in the
// Supabase dashboard (Project Settings -> Edge Functions -> Secrets) — it is
// never written to this repo. See the pull request description for the
// exact steps.
export function getStripe(): Stripe {
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not set — add it as a Supabase Edge Function secret.');
  }
  return new Stripe(key, {
    apiVersion: '2024-06-20',
    httpClient: Stripe.createFetchHttpClient(),
  });
}
