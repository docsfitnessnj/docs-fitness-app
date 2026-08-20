import { BadgeId } from './badges';

// Mock member directory — stands in for a real member list until the
// backend round. Used by: badges shown next to other authors' names in the
// feed (their badge state has to come from somewhere), and by the admin
// Member Manager's search. "demoBadges" are flavor/illustrative only — the
// current signed-in member's own badges are always computed live, never
// read from here.
export type RosterMember = {
  name: string;
  planLabel: string;
  demoBadges: BadgeId[];
};

export const MEMBER_ROSTER: RosterMember[] = [
  { name: 'Doc', planLabel: 'Admin', demoBadges: ['joker', 'day_one_doug', 'hundred_down'] },
  { name: 'K. Alvarez', planLabel: 'Monthly Unlimited', demoBadges: ['cow_killer', 'day_one_doug'] },
  { name: 'D. Castillo', planLabel: 'Online Member', demoBadges: ['on_fire', 'day_one_doug'] },
  { name: 'S. Boyle', planLabel: '10 Class Pack', demoBadges: ['the_regular', 'day_one_doug'] },
  { name: 'J. Marino', planLabel: 'Monthly Unlimited', demoBadges: ['cow_killer', 'on_fire', 'day_one_doug'] },
  { name: 'T. Ruiz', planLabel: 'Online Member', demoBadges: ['day_one_doug'] },
];

export function findRosterMember(name: string): RosterMember | undefined {
  return MEMBER_ROSTER.find((m) => m.name === name);
}
