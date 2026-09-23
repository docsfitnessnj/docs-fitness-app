// The three online Stripe Prices — sandbox test-mode ids, safe to embed
// (these identify a price, not a secret). Kept in sync by hand with
// src/data/stripePrices.ts on the client side: Edge Functions run on Deno,
// a completely separate runtime from the Expo/Metro bundle, so there is no
// way for the two to share one literal source file. If Doc ever moves this
// app to Stripe live mode, both copies need updating together.
export const PRICE_IDS = {
  monthly: 'price_1UIsagK8jMUFAOQw3ZS1IXVO',
  founding: 'price_1UIseoK8jMUFAOQwWbIfi2pU',
  annual: 'price_1UIsfbK8jMUFAOQwQ2t9RMs8',
} as const;

export type PlanKey = keyof typeof PRICE_IDS;

export function planForPriceId(priceId: string | null | undefined): PlanKey | null {
  if (!priceId) return null;
  for (const [plan, id] of Object.entries(PRICE_IDS)) {
    if (id === priceId) return plan as PlanKey;
  }
  return null;
}
