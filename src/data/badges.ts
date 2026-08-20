// Single source of truth for the 6 Trophy Case badges — names, copy, and
// which bucket (permanent vs. weekly) each belongs to, so the feed, the
// profile badge case, and the Trophy Case screen never drift apart.

export type BadgeId = 'joker' | 'on_fire' | 'cow_killer' | 'the_regular' | 'day_one_doug' | 'hundred_down';

export type BadgeKind = 'permanent' | 'weekly';

export type BadgeDef = {
  id: BadgeId;
  name: string;
  description: string;
  kind: BadgeKind;
  // Display order everywhere badges are listed together: THE JOKER first,
  // then weeklies, then permanent milestones.
  order: number;
};

export const BADGE_DEFS: BadgeDef[] = [
  {
    id: 'joker',
    name: 'THE JOKER',
    description:
      'You own the real thing. Physical Deck of WODs verified by Doc himself. The only badge money can buy.',
    kind: 'permanent',
    order: 0,
  },
  {
    id: 'on_fire',
    name: 'ON FIRE',
    description: 'All 5 WODs completed in one week. No days off, no excuses.',
    kind: 'weekly',
    order: 1,
  },
  {
    id: 'cow_killer',
    name: 'COW KILLER',
    description: "Posted your score on this week's Challenge of the Week. You showed up on the board.",
    kind: 'weekly',
    order: 2,
  },
  {
    id: 'the_regular',
    name: 'THE REGULAR',
    description: 'Posted 3 or more results to the community this week. The board runs on people like you.',
    kind: 'weekly',
    order: 3,
  },
  {
    id: 'day_one_doug',
    name: 'DAY ONE DOUG',
    description: 'Your first workout logged. Everybody has a Day One. Doug knows.',
    kind: 'permanent',
    order: 4,
  },
  {
    id: 'hundred_down',
    name: 'HUNDRED DOWN',
    description: '100 workouts logged. That is not a habit anymore. That is who you are.',
    kind: 'permanent',
    order: 5,
  },
];

export const BADGE_MAP: Record<BadgeId, BadgeDef> = BADGE_DEFS.reduce(
  (acc, b) => ({ ...acc, [b.id]: b }),
  {} as Record<BadgeId, BadgeDef>
);

// Sorts a set of held badge ids into the app-wide display order (Joker,
// then weeklies, then permanents) and caps how many are shown inline, with
// the remainder collapsed into a count.
export function sortBadgeIds(ids: BadgeId[]): BadgeId[] {
  return [...ids].sort((a, b) => BADGE_MAP[a].order - BADGE_MAP[b].order);
}

export const INLINE_BADGE_CAP = 4;
