// The three online Stripe Prices — sandbox test-mode ids, safe to embed
// (these identify a price, not a secret). Kept in sync by hand with
// src/data/stripePrices.ts on the client side: Edge Functions run on Deno,
// a completely separate runtime from the Expo/Metro bundle, so there is no
// way for the two to share one literal source file. If Doc ever moves this
// app to Stripe live mode, both copies need updating together.
//
// Round 65: repriced sandbox ids (Founding 50 $17/mo, Monthly $27/mo,
// Annual $243/yr) replace the old $37/$57/$513 ones outright -- the old
// prices are archived in Stripe, so nothing may keep pointing at them.
export const PRICE_IDS = {
  monthly: 'price_1Uedm0K8jMUFAOQwzlS0OApi',
  founding: 'price_1UedmiK8jMUFAOQwly37MNdO',
  annual: 'price_1UedkLK8jMUFAOQwpLT3l6k1',
  // IN PERSON (Stripe round two) — sandbox/test-mode price ids.
  in_person_monthly: 'price_1US34vK8jMUFAOQw6KKUdNmh',
  ten_pack: 'price_1US36lK8jMUFAOQw6ehhrYgJ',
  drop_in: 'price_1US37zK8jMUFAOQwr6G5YPZE',
  // DOWNBEACH PILATES WITH MARINA — a separate guest class, not included in
  // any Doc's Fitness membership (see migration_023). Everyone pays this,
  // including Monthly Unlimited.
  pilates_guest: 'price_1UTjj9K8jMUFAOQwhnr7flRh',
} as const;

export type PlanKey = keyof typeof PRICE_IDS;

export function planForPriceId(priceId: string | null | undefined): PlanKey | null {
  if (!priceId) return null;
  for (const [plan, id] of Object.entries(PRICE_IDS)) {
    if (id === priceId) return plan as PlanKey;
  }
  return null;
}
