import { BadgeId } from './badges';

// Mock member directory — stands in for a real member list until the
// backend round. Used by: badges shown next to other authors' names in the
// feed (their badge state has to come from somewhere), and by the admin
// Member Manager's grouped-by-plan roster. "demoBadges" are flavor/
// illustrative only — the current signed-in member's own badges are always
// computed live, never read from here.

export type PlanKey = 'monthly_unlimited' | 'ten_pack' | 'drop_in' | 'trial' | 'monthly_online' | 'annual_online';

export const PLAN_SECTIONS: { section: string; plans: { key: PlanKey; label: string }[] }[] = [
  {
    section: 'IN PERSON GROUP TRAINING',
    plans: [
      { key: 'monthly_unlimited', label: 'Monthly Unlimited' },
      { key: 'ten_pack', label: '10 Class Pack' },
      { key: 'drop_in', label: 'Drop In' },
    ],
  },
  {
    section: 'ONLINE',
    plans: [
      { key: 'trial', label: '2 Week Free Trial' },
      { key: 'monthly_online', label: 'Monthly' },
      { key: 'annual_online', label: 'Annual' },
    ],
  },
];

export function planKeyLabel(key: PlanKey): string {
  for (const s of PLAN_SECTIONS) {
    const match = s.plans.find((p) => p.key === key);
    if (match) return match.label;
  }
  return key;
}

export type RosterMember = {
  name: string;
  // Undefined = staff (Doc's own admin account) — excluded from the
  // plan-grouped Member Manager roster, since admin isn't a paid plan.
  planKey?: PlanKey;
  joinDate: string;
  // Only meaningful for planKey === 'ten_pack'.
  classesRemaining?: number;
  // Only meaningful for planKey === 'trial'.
  daysRemaining?: number;
  demoBadges: BadgeId[];
};

export const MEMBER_ROSTER: RosterMember[] = [
  { name: 'Doc', joinDate: 'JAN 1, 2023', demoBadges: ['joker', 'day_one_doug', 'hundred_down'] },
  {
    name: 'K. Alvarez',
    planKey: 'monthly_unlimited',
    joinDate: 'MAR 4, 2025',
    demoBadges: ['cow_killer', 'day_one_doug'],
  },
  {
    name: 'J. Marino',
    planKey: 'ten_pack',
    joinDate: 'JUN 18, 2025',
    classesRemaining: 6,
    demoBadges: ['cow_killer', 'on_fire', 'day_one_doug'],
  },
  { name: 'S. Boyle', planKey: 'drop_in', joinDate: 'JUL 2, 2025', demoBadges: ['the_regular', 'day_one_doug'] },
  {
    name: 'D. Castillo',
    planKey: 'monthly_online',
    joinDate: 'FEB 20, 2025',
    demoBadges: ['on_fire', 'day_one_doug'],
  },
  { name: 'T. Ruiz', planKey: 'annual_online', joinDate: 'APR 11, 2025', demoBadges: ['day_one_doug'] },
];

export function findRosterMember(name: string): RosterMember | undefined {
  return MEMBER_ROSTER.find((m) => m.name === name);
}
