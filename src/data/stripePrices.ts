// Stripe sandbox (test mode) ids — a publishable key and Price ids are
// meant to be public/embeddable, unlike a secret key. The actual trusted
// decision of which price a Checkout session uses (including the Founding
// 50 eligibility check) happens server-side in the create-checkout Edge
// Function — this file is display/reference only on the client.
export const STRIPE_PUBLISHABLE_KEY =
  'pk_test_51UIsNSK8jMUFAOQw4CFbnInMtwK2uyfTXXE9M5hSJCukkiOK81MZ4I2eo7KvfobD3AVR1kDUfgBkqJMwlo0buSX300PYjDC0cO';

export const STRIPE_PRICE_IDS = {
  monthly: 'price_1UIsagK8jMUFAOQw3ZS1IXVO',
  founding: 'price_1UIseoK8jMUFAOQwWbIfi2pU',
  annual: 'price_1UIsfbK8jMUFAOQwQ2t9RMs8',
  // IN PERSON (Stripe round two) — kept in hand-sync with the server copy
  // (supabase/functions/_shared/prices.ts), same convention as the online
  // ids above.
  in_person_monthly: 'price_1US34vK8jMUFAOQw6KKUdNmh',
  ten_pack: 'price_1US36lK8jMUFAOQw6ehhrYgJ',
  drop_in: 'price_1US37zK8jMUFAOQwr6G5YPZE',
} as const;
