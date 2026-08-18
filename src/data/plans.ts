import { InPersonPlan } from '../context/MembershipContext';

// Single source of truth for plan pricing/copy — pricing has changed three
// rounds running, and duplicating it across the onboarding screens and the
// Memberships screen kept drifting out of sync.

export type OnlinePlanKey = 'monthly' | 'annual';

export type OnlinePlan = {
  key: OnlinePlanKey;
  name: string;
  price: string;
  cadence: string;
  banner?: { title: string; subtitle: string };
};

export const ONLINE_PLAN_BULLETS = [
  'All 5 weekly WODs',
  'The full Deck of WODs (54 workouts)',
  'Weekly Challenge + live leaderboard',
  'Full community access',
  'Message Doc directly',
];

export const ONLINE_PLANS: OnlinePlan[] = [
  { key: 'monthly', name: 'MONTHLY', price: '$39', cadence: '/ month' },
  {
    key: 'annual',
    name: 'ANNUAL',
    price: '$351',
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
  bestValue?: boolean;
};

export const IN_PERSON_PLANS: InPersonPlanCard[] = [
  {
    key: 'monthly_unlimited',
    name: 'MONTHLY UNLIMITED',
    price: '$130',
    cadence: '/ month',
    bullets: ["Unlimited Doc's Fitness classes + full app included"],
    bestValue: true,
  },
  {
    key: 'ten_pack',
    name: '10 CLASS PACK',
    price: '$250',
    cadence: '',
    bullets: ['Ten classes, expires 1 year from purchase', 'App community + booking access', 'Workouts locked'],
  },
  {
    key: 'drop_in',
    name: 'DROP IN',
    price: '$30',
    cadence: '/ class',
    bullets: ['Booking access only'],
  },
];
