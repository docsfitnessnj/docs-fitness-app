import { getEasternParts } from '../lib/challengeSchedule';
import { FOUNDING_FIFTY_PRICE } from '../context/FoundingFiftyContext';
import { InPersonPlan } from '../context/MembershipContext';

// The one Founding 50 banner copy, shared by every surface that shows it
// (Memberships screen's Monthly card, the About page's TRAIN ONLINE door)
// so they can never drift out of sync with each other. Final, word-for-word
// copy — never say "lifetime" or "forever" here.
export const FOUNDING_FIFTY_BANNER = {
  title: 'FOUNDING 50 RATE',
  subtitle: `$${FOUNDING_FIFTY_PRICE} a month, locked in for as long as your membership stays active.`,
};

// Business decision: the Founding 50 rate has no trial — it charges
// immediately and the rate is locked in for as long as the membership stays
// active. Every surface on the founding path uses this exact sentence in
// place of any "first two weeks are free" / "you won't be charged until"
// trial language. Final, word-for-word — never say "lifetime" or "forever".
export const FOUNDING_NO_TRIAL_SENTENCE = `$${FOUNDING_FIFTY_PRICE} today. Your rate is locked in for as long as your membership stays active.`;

// One value line under the founding banner, phrasing pulled straight from
// ONLINE_PLAN_BULLETS below rather than inventing new claims.
export const FOUNDING_VALUE_LINE =
  'All 5 kettlebell workouts a week, the full Deck of WODs, Weekly Challenge + live leaderboard, full community access, and message Doc directly.';

const WEEKDAY_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

// "X SPOTS LEFT" counts DOWN (not up) — the loudest supporting element on
// the founding door while the window is live. "ONLY" prefixes it once 10 or
// fewer spots remain, for real urgency without inventing a fake one.
export function foundingSpotsLeftLabel(spotsRemaining: number): string {
  return spotsRemaining <= 10 ? `ONLY ${spotsRemaining} SPOTS LEFT` : `${spotsRemaining} SPOTS LEFT`;
}

// "OFFER ENDS <DAY> 11:59 PM ET" — the day is always read live from the
// real launch-window end datetime (in Eastern time, matching how Doc sets
// the window from the admin screen), never hardcoded. Null while no window
// end is set.
export function foundingDeadlineLabel(endsAtMs: number | null): string | null {
  if (endsAtMs === null) return null;
  const weekday = getEasternParts(new Date(endsAtMs)).weekday;
  return `OFFER ENDS ${WEEKDAY_NAMES[weekday]} 11:59 PM ET`;
}

// Single source of truth for plan pricing/copy — pricing has changed several
// rounds running, and duplicating it across the onboarding screens and the
// Memberships screen kept drifting out of sync.

// The two tracks are shown either as separate onboarding screens or side by
// side on the Memberships screen — this copy is the one header each leads
// with (or, on Memberships, each section leads with) so the tracks are never
// confused for one another.
export const ONLINE_SECTION_HEADER = {
  title: 'ONLINE TRAINING',
  subtitle: 'Train anywhere. The full app.',
};

export const IN_PERSON_SECTION_HEADER = {
  title: "IN PERSON AT DOC'S FITNESS",
  subtitle: 'Classes at the Boathouse, Ventnor City NJ.',
};

export type OnlinePlanKey = 'monthly' | 'annual';

export type OnlinePlan = {
  key: OnlinePlanKey;
  name: string;
  price: string;
  cadence: string;
  banner?: { title: string; subtitle: string };
};

export const ONLINE_PLAN_BULLETS = [
  'All 5 kettlebell workouts a week',
  'The full Deck of WODs (54 workouts)',
  'Weekly Challenge + live leaderboard',
  'Full community access',
  'Message Doc directly',
];

// Names carry the "(ONLINE)" tag so the track reads even out of context —
// card, confirmation popup, receipt, anywhere the plan is named.
export const ONLINE_PLANS: OnlinePlan[] = [
  { key: 'monthly', name: 'MONTHLY (ONLINE)', price: '$57', cadence: '/ month' },
  {
    key: 'annual',
    name: 'ANNUAL (ONLINE)',
    price: '$513',
    cadence: '/ year',
    banner: { title: '3 MONTHS FREE', subtitle: 'Pay for 9 months. Get 12.' },
  },
];

export type InPersonPlanCard = {
  key: InPersonPlan;
  name: string;
  price: string;
  cadence: string;
  bullets: string[];
  // Full-width gold strip across the top of the card, and the trigger for
  // the gold card-border highlight — only Monthly Unlimited has one, so the
  // full-app-access tier is unmissable next to the booking-only tiers.
  topBanner?: string;
  // Exact bullet text to render bold + gold instead of the normal bullet
  // style — used to call out full app access on Monthly Unlimited.
  emphasizedBullet?: string;
  // A quiet note (not a checkmark bullet) making clear this tier does NOT
  // include app/workout access, so the contrast with Monthly Unlimited is
  // obvious at a glance.
  clarifyingNote?: string;
  // Small label above the bullet list ("WHAT YOU GET") — only the tiers
  // that need the positive-framing treatment (10 Class Pack, Drop In) set
  // this; Monthly Unlimited's bullets read fine without it.
  bulletsHeading?: string;
};

// The short, quiet clarifying line for the two in-person tiers that don't
// include full app access — makes the contrast with Monthly Unlimited
// (which does) obvious at a glance without repeating the whole bullet list.
const IN_PERSON_EXCLUSION_NOTE = 'Class booking + community access. Workouts not included.';

export const IN_PERSON_PLANS: InPersonPlanCard[] = [
  {
    key: 'monthly_unlimited',
    name: 'MONTHLY UNLIMITED (IN-PERSON)',
    price: '$120',
    cadence: '/ month',
    bullets: ["Unlimited Doc's Fitness classes", 'Book any class, any day', 'Full access to everything in this app'],
    topBanner: 'EVERYTHING INCLUDED',
    emphasizedBullet: 'Full access to everything in this app',
  },
  {
    key: 'ten_pack',
    name: '10 CLASS PACK (IN-PERSON)',
    price: '$200',
    cadence: ' · expires 1 year from purchase',
    bulletsHeading: 'WHAT YOU GET',
    bullets: ["Book Doc's Fitness for in person classes", 'Full community access', 'The Movement Vault'],
    clarifyingNote: IN_PERSON_EXCLUSION_NOTE,
  },
  {
    key: 'drop_in',
    name: 'DROP IN (IN-PERSON)',
    price: '$25',
    cadence: '/ class',
    bulletsHeading: 'WHAT YOU GET',
    bullets: ["Book Doc's Fitness for in person classes", 'Full community access', 'The Movement Vault'],
    clarifyingNote: IN_PERSON_EXCLUSION_NOTE,
  },
];
