import { InPersonPlan } from '../context/MembershipContext';

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
