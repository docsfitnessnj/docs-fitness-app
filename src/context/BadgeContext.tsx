import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { BadgeId, sortBadgeIds } from '../data/badges';
import { getCurrentWeek, getWeekStart, isThisWeek } from '../data/content';
import { findRosterMember } from '../data/roster';
import { loadJSON, saveJSON } from '../lib/storage';
import { useCommunity } from './CommunityContext';
import { useDeckProgress } from './DeckProgressContext';
import { useMembership } from './MembershipContext';
import { useDisplayName } from './ProfileContext';
import { useWorkoutLog } from './WorkoutLogContext';

const STORAGE_KEY = 'docsfitness.badges.v1';
export const HUNDRED_DOWN_TARGET = 100;
const REGULAR_TARGET = 3;

type PersistedState = {
  dayOneDougEarnedAt: number | null;
  hundredDownEarnedAt: number | null;
  cowKillerPostedAt: number | null;
  // Manual/one-time grants keyed by member name — THE JOKER (admin-toggled)
  // and THE FOUNDING 50 (granted once at signup, never revoked in the UI:
  // it's permanent even after the member later cancels).
  manualGrants: Record<
    string,
    { joker?: boolean; jokerGrantedAt?: number; foundingFifty?: boolean; foundingFiftyGrantedAt?: number }
  >;
  lastRecapMonthKey: string | null;
};

const DEFAULT_STATE: PersistedState = {
  dayOneDougEarnedAt: null,
  hundredDownEarnedAt: null,
  cowKillerPostedAt: null,
  manualGrants: {},
  lastRecapMonthKey: null,
};

function monthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}`;
}

type BadgeContextValue = {
  // The signed-in member's own state.
  myBadgeIds: BadgeId[];
  totalWorkoutsLogged: number;
  onFireProgress: { count: number; target: number; earned: boolean };
  regularProgress: { count: number; target: number; earned: boolean };
  cowKillerEarned: boolean;
  jokerEarned: boolean;
  // Live-computed from membership.fullContentAccess, not a one-time grant —
  // true exactly while the member currently has full access, false the
  // instant they drop to Dockside, true again the instant they rejoin.
  crewEarned: boolean;
  foundingFiftyEarned: boolean;
  dayOneDougEarned: boolean;
  hundredDownEarned: boolean;
  // When each of my permanent badges was earned — null until earned. The
  // Trophy Case shows this date once earned, progress toward it otherwise.
  dayOneDougEarnedAt: number | null;
  hundredDownEarnedAt: number | null;

  // Any author's badges (mine live-computed, others from roster demo data
  // + manual grants) — sorted Joker-first, weeklies, then permanents.
  getBadgesForAuthor: (name: string) => BadgeId[];
  hasManualJoker: (name: string) => boolean;
  getJokerGrantedAt: (name: string) => number | null;
  getFoundingFiftyGrantedAt: (name: string) => number | null;

  recordCowKillerScore: () => void;
  grantJoker: (name: string) => void;
  revokeJoker: (name: string) => void;
  // One-way — granted automatically the moment a member claims a Founding
  // 50 spot, and never revoked from here even if they later cancel.
  grantFoundingFifty: (name: string) => void;
  // Dev-only: force-generate this month's recap post right now, ignoring
  // the "only on the 1st, only once" gate — for testing/preview.
  previewMonthlyRecap: () => void;
};

const BadgeContext = createContext<BadgeContextValue | undefined>(undefined);

export function BadgeProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PersistedState>(() => loadJSON(STORAGE_KEY, DEFAULT_STATE));
  const displayName = useDisplayName();
  const { completedWorkouts } = useWorkoutLog();
  const { completedCount: deckCompletedCount } = useDeckProgress();
  const { posts, addTextPost } = useCommunity();
  const { fullContentAccess } = useMembership();

  useEffect(() => {
    saveJSON(STORAGE_KEY, state);
  }, [state]);

  const totalWorkoutsLogged = completedWorkouts.length + deckCompletedCount;

  // Stamp the first-crossed timestamps once, the first time each threshold
  // is observed — this is what lets the monthly recap say "earned this
  // month" without needing a full history of every completion ever.
  useEffect(() => {
    if (totalWorkoutsLogged >= 1 && state.dayOneDougEarnedAt === null) {
      setState((prev) => ({ ...prev, dayOneDougEarnedAt: Date.now() }));
    }
    if (totalWorkoutsLogged >= HUNDRED_DOWN_TARGET && state.hundredDownEarnedAt === null) {
      setState((prev) => ({ ...prev, hundredDownEarnedAt: Date.now() }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalWorkoutsLogged]);

  const value = useMemo<BadgeContextValue>(() => {
    const dayOneDougEarned = state.dayOneDougEarnedAt !== null;
    const hundredDownEarned = state.hundredDownEarnedAt !== null;
    const jokerEarned = !!state.manualGrants[displayName]?.joker;
    const foundingFiftyEarned = !!state.manualGrants[displayName]?.foundingFifty;
    const crewEarned = fullContentAccess;
    const cowKillerEarned = state.cowKillerPostedAt !== null && isThisWeek(state.cowKillerPostedAt);

    const week = getCurrentWeek();
    const weekdayKeys = week.filter((d) => !d.isRestDay && d.wod).map((d) => d.wod!.key);
    const onFireCount = weekdayKeys.filter((key) => completedWorkouts.some((w) => w.dayKey === key)).length;
    const onFireProgress = { count: onFireCount, target: weekdayKeys.length, earned: onFireCount >= weekdayKeys.length };

    const weekStart = getWeekStart().getTime();
    const regularCount = posts.filter(
      (p) => p.author === displayName && p.kind === 'wod' && p.createdAt >= weekStart
    ).length;
    const regularProgress = { count: regularCount, target: REGULAR_TARGET, earned: regularCount >= REGULAR_TARGET };

    const myBadgeIds: BadgeId[] = [
      ...(crewEarned ? (['crew'] as BadgeId[]) : []),
      ...(foundingFiftyEarned ? (['founding_50'] as BadgeId[]) : []),
      ...(jokerEarned ? (['joker'] as BadgeId[]) : []),
      ...(onFireProgress.earned ? (['on_fire'] as BadgeId[]) : []),
      ...(cowKillerEarned ? (['cow_killer'] as BadgeId[]) : []),
      ...(regularProgress.earned ? (['the_regular'] as BadgeId[]) : []),
      ...(dayOneDougEarned ? (['day_one_doug'] as BadgeId[]) : []),
      ...(hundredDownEarned ? (['hundred_down'] as BadgeId[]) : []),
    ];

    const getBadgesForAuthor = (name: string): BadgeId[] => {
      if (name === displayName) return sortBadgeIds(myBadgeIds);
      const member = findRosterMember(name);
      const demo = member?.demoBadges ?? [];
      const manualJoker = state.manualGrants[name]?.joker;
      const ids = new Set<BadgeId>(demo);
      if (manualJoker === true) ids.add('joker');
      if (manualJoker === false) ids.delete('joker');
      if (state.manualGrants[name]?.foundingFifty) ids.add('founding_50');
      return sortBadgeIds(Array.from(ids));
    };

    return {
      myBadgeIds: sortBadgeIds(myBadgeIds),
      totalWorkoutsLogged,
      onFireProgress,
      regularProgress,
      cowKillerEarned,
      jokerEarned,
      crewEarned,
      foundingFiftyEarned,
      dayOneDougEarned,
      hundredDownEarned,
      dayOneDougEarnedAt: state.dayOneDougEarnedAt,
      hundredDownEarnedAt: state.hundredDownEarnedAt,
      getBadgesForAuthor,
      hasManualJoker: (name) => !!state.manualGrants[name]?.joker,
      getJokerGrantedAt: (name) => state.manualGrants[name]?.jokerGrantedAt ?? null,
      getFoundingFiftyGrantedAt: (name) => state.manualGrants[name]?.foundingFiftyGrantedAt ?? null,
      recordCowKillerScore: () => setState((prev) => ({ ...prev, cowKillerPostedAt: Date.now() })),
      grantJoker: (name) =>
        setState((prev) => ({
          ...prev,
          manualGrants: { ...prev.manualGrants, [name]: { ...prev.manualGrants[name], joker: true, jokerGrantedAt: Date.now() } },
        })),
      revokeJoker: (name) =>
        setState((prev) => ({
          ...prev,
          manualGrants: { ...prev.manualGrants, [name]: { ...prev.manualGrants[name], joker: false } },
        })),
      grantFoundingFifty: (name) =>
        setState((prev) => ({
          ...prev,
          manualGrants: {
            ...prev.manualGrants,
            [name]: { ...prev.manualGrants[name], foundingFifty: true, foundingFiftyGrantedAt: Date.now() },
          },
        })),
      previewMonthlyRecap: () => {
        addTextPost('Doc', buildRecapTitle(), buildRecapBody({ getBadgesForAuthor, displayName }), 'Announcement');
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, displayName, completedWorkouts, deckCompletedCount, posts, totalWorkoutsLogged, fullContentAccess]);

  // Auto-generate the monthly recap on the 1st, once per month.
  useEffect(() => {
    const now = new Date();
    if (now.getDate() !== 1) return;
    const key = monthKey(now);
    if (state.lastRecapMonthKey === key) return;
    addTextPost('Doc', buildRecapTitle(now), buildRecapBody({ getBadgesForAuthor: value.getBadgesForAuthor, displayName }), 'Announcement');
    setState((prev) => ({ ...prev, lastRecapMonthKey: key }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastRecapMonthKey]);

  return <BadgeContext.Provider value={value}>{children}</BadgeContext.Provider>;
}

const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY',
  'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
];

function buildRecapTitle(d: Date = new Date()): string {
  return `THE TROPHY CASE — ${MONTH_NAMES[d.getMonth()]} RECAP`;
}

function buildRecapBody({
  getBadgesForAuthor,
  displayName,
}: {
  getBadgesForAuthor: (name: string) => BadgeId[];
  displayName: string;
}): string {
  const roster = ['Doc', 'K. Alvarez', 'D. Castillo', 'S. Boyle', 'J. Marino', 'T. Ruiz', displayName].filter(
    (name, i, arr) => arr.indexOf(name) === i
  );

  const holdersOf = (id: BadgeId) => roster.filter((name) => getBadgesForAuthor(name).includes(id));

  const lines: string[] = [];
  const onFire = holdersOf('on_fire');
  if (onFire.length) lines.push(`ON FIRE all 4 weeks: ${onFire.join(', ')}`);
  const cowKillers = holdersOf('cow_killer');
  if (cowKillers.length) lines.push(`COW KILLERs: ${cowKillers.join(', ')}`);
  const regulars = holdersOf('the_regular');
  if (regulars.length) lines.push(`THE REGULARs: ${regulars.join(', ')}`);
  const jokers = holdersOf('joker');
  if (jokers.length) lines.push(`New JOKERs: ${jokers.join(', ')}`);
  const dayOnes = holdersOf('day_one_doug');
  if (dayOnes.length) lines.push(`New DAY ONE DOUGs: ${dayOnes.join(', ')}`);
  const hundreds = holdersOf('hundred_down');
  if (hundreds.length) lines.push(`New HUNDRED DOWNs: ${hundreds.join(', ')}`);

  if (lines.length === 0) return 'No standouts to report yet this month — go earn one.';
  return lines.join('\n');
}

export function useBadges() {
  const ctx = useContext(BadgeContext);
  if (!ctx) {
    throw new Error('useBadges must be used within a BadgeProvider');
  }
  return ctx;
}
