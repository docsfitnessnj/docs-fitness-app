import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { useClassBookingData } from './ClassBookingContext';
import { useCommunity } from './CommunityContext';
import { useDeckProgress } from './DeckProgressContext';
import { useMembership } from './MembershipContext';
import { useDisplayName, useProfile } from './ProfileContext';
import { useScheduledContent } from './ScheduledContentContext';
import { useWorkoutLog } from './WorkoutLogContext';
import { BadgeId, sortBadgeIds } from '../data/badges';
import { getCurrentWeek, getWeekStart, isThisWeek } from '../data/content';
import { loadJSON, saveJSON } from '../lib/storage';
import { isBackendUnavailableError, supabase } from '../lib/supabaseClient';

export const HUNDRED_DOWN_TARGET = 100;
const REGULAR_TARGET = 3;
const UPSTAIRS_TARGET = 3;
// LEGACY's milestone ladder (Round 45) — the badge is earned at the first
// one and the displayed number levels up at each one after.
export const LEGACY_MILESTONES = [50, 100, 250, 500, 750, 1000];

// THE FOUNDING 50 badge grant itself is out of scope here (it's not in the
// Tier 1 badge list) — it stays exactly as it was, persisted locally per
// device, even though FoundingFiftyContext's own capacity/roster (who's
// actually claimed one of the 50 spots) is now real, shared database data.
const FOUNDING_FIFTY_STORAGE_KEY = 'docsfitness.foundingFiftyGrants.v1';
const RECAP_STORAGE_KEY = 'docsfitness.badgeRecap.v1';

type FoundingFiftyGrants = Record<string, { granted: boolean; grantedAt: number }>;

// LEGACY is deliberately NOT in this list — unlike every badge here, its
// period_key holds a milestone number rather than '' or the current week,
// so getBadgesForAuthor() below gives it its own dedicated branch instead
// of the generic '' -or-current-week check every one of these uses.
const COMPUTED_BADGE_IDS: BadgeId[] = ['on_fire', 'cow_killer', 'the_regular', 'day_one_doug', 'hundred_down', 'upstairs'];

// ON FIRE's own real weekly target. getCurrentWeek()'s raw WeekDay.wod is
// never schedule-aware (it's always the legacy 5-day Mon-Fri array) — a
// real Round 46 scheduled week covering the current calendar week drops
// Wednesday entirely (it's COW day now, see weekendContent.ts's own
// useIsCowDay), so without this ON FIRE would keep asking for all 5
// forever, including a day that no longer has a WOD to mark complete at
// all. Mirrors weekendContent.ts's own coveringScheduledWeek check, which
// this file can't import directly (it's shaped as a hook there) — the
// same plain comparison is inlined here instead.
function onFireWeekdayKeys(scheduledCurrentWeek: { weekStartDate: number } | null): string[] {
  const week = getCurrentWeek();
  const coversThisWeek = !!scheduledCurrentWeek && scheduledCurrentWeek.weekStartDate === getWeekStart().getTime();
  return week
    .filter((d) => !d.isRestDay && d.wod && !(coversThisWeek && d.wod.key === 'wed'))
    .map((d) => d.wod!.key);
}

// A stable id for "this Monday-anchored week" — weekly badges (ON FIRE, COW
// KILLER, THE REGULAR) are granted with this as their period_key, so they
// naturally "reset Mondays" without deleting anything: the app only ever
// checks for a grant matching *this* period_key, and last week's grant rows
// just stop matching once Monday rolls over. Permanent badges use '' (see
// supabase/setup.sql's default).
function currentWeekPeriodKey(): string {
  return String(getWeekStart().getTime());
}

// The highest LEGACY_MILESTONES rung a lifetime count has reached, or 0 if
// it hasn't reached the first one (50) yet — e.g. 180 -> 100, 37 -> 0.
function legacyMilestoneFor(lifetimeCount: number): number {
  let best = 0;
  for (const m of LEGACY_MILESTONES) {
    if (lifetimeCount >= m) best = m;
  }
  return best;
}

type ProfileRef = { display_name: string } | { display_name: string }[] | null;
function nameOf(ref: ProfileRef): string {
  const profile = Array.isArray(ref) ? ref[0] : ref;
  return profile?.display_name?.trim() || 'Member';
}

type GrantRow = {
  user_id: string;
  badge_id: BadgeId;
  period_key: string;
  granted_at: string;
  profiles: ProfileRef;
};

type BadgeContextValue = {
  loading: boolean;
  error: string | null;
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
  // COW CHAMP — permanent and stackable, granted by backend logic at the
  // Saturday 12pm ET challenge close (see supabase/migration_004.sql),
  // never by this client. `cowChampCount` is simply how many badge_grants
  // rows exist for
  // this badge (one per week won) — the Trophy Case and PostAuthorBadges
  // show it as "x2"/"x3" once it passes 1.
  cowChampEarned: boolean;
  cowChampCount: number;
  cowChampEarnedAt: number | null;

  // LEGACY (Round 45) — lifetime booked-not-cancelled classes (this
  // member's real in-app bookings + their admin-set legacy starting count).
  // legacyMilestone is 0 until the first rung (50) is reached; the badge is
  // "earned" the moment it's nonzero.
  legacyLifetimeCount: number;
  legacyMilestone: number;
  legacyEarned: boolean;
  // UPSTAIRS (Round 45) — 3+ booked-not-cancelled classes whose session
  // falls inside the current Mon-Sun week, the in-person twin of ON FIRE.
  upstairsProgress: { count: number; target: number; earned: boolean };

  // Any author's badges, read from the shared badge_grants table (joker,
  // cow_champ, the 5 computed badges) plus the local Founding 50 grant —
  // sorted Joker-first, weeklies, then permanents.
  getBadgesForAuthor: (name: string) => BadgeId[];
  getJokerGrantedAt: (name: string) => number | null;
  getFoundingFiftyGrantedAt: (name: string) => number | null;
  // How many times this author holds COW CHAMP — 0 if never, used to render
  // the "x2"/"x3" stack count next to the badge wherever it renders.
  getCowChampCount: (name: string) => number;
  // This author's current LEGACY milestone (0 if they've never earned it) —
  // the number the badge glyph itself displays. For the signed-in member
  // this is the live-computed value (always current); for anyone else it's
  // the highest milestone ever self-granted into badge_grants for them.
  getLegacyMilestone: (name: string) => number;

  recordCowKillerScore: () => void;
  // Admin-only — see supabase/setup.sql's badge_grants insert/delete
  // policies, which are the real enforcement; these take a real user id
  // (Member Manager looks members up by their real account, not a name).
  grantJoker: (userId: string) => Promise<{ error: string | null }>;
  revokeJoker: (userId: string) => Promise<{ error: string | null }>;
  // One-way — granted automatically the moment a member claims a Founding
  // 50 spot, and never revoked from here even if they later cancel.
  grantFoundingFifty: (name: string) => void;
  // Dev-only: force-generate this month's recap post right now, ignoring
  // the "only on the 1st, only once" gate — for testing/preview. Only
  // actually posts when the signed-in member is a real admin, since with
  // real accounts a recap can only honestly be attributed to whoever is
  // actually signed in.
  previewMonthlyRecap: () => void;
};

const BadgeContext = createContext<BadgeContextValue | undefined>(undefined);

export function BadgeProvider({ children }: { children: React.ReactNode }) {
  const { user, authReady } = useAuth();
  const displayName = useDisplayName();
  const { isAdmin: realAdmin } = useProfile();
  const { completedWorkouts } = useWorkoutLog();
  const { completedCount: deckCompletedCount } = useDeckProgress();
  const { posts, addTextPost } = useCommunity();
  const { fullContentAccess } = useMembership();
  const { myBookings } = useClassBookingData();
  const { currentWeek: scheduledCurrentWeek } = useScheduledContent();

  const [grants, setGrants] = useState<GrantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // LEGACY (Round 45) — this account's own admin-set starting count
  // (profiles.legacy_starting_count), fetched directly rather than through
  // ProfileContext (which doesn't carry this admin-only field) since it's
  // plainly readable by any signed-in member — "profiles are readable by
  // any signed-in member" already covers it, same as every other profile
  // field this app reads about someone else.
  const [legacyStartingCount, setLegacyStartingCount] = useState(0);
  const [foundingFiftyGrants, setFoundingFiftyGrants] = useState<FoundingFiftyGrants>(() =>
    loadJSON(FOUNDING_FIFTY_STORAGE_KEY, {})
  );
  const [lastRecapMonthKey, setLastRecapMonthKey] = useState<string | null>(() => loadJSON(RECAP_STORAGE_KEY, null));

  const refetchGrants = () =>
    supabase
      .from('badge_grants')
      // badge_grants has two foreign keys into profiles (user_id and
      // granted_by) — "!user_id" tells PostgREST which one this embed
      // follows, since "profiles(display_name)" alone is ambiguous here.
      .select('user_id, badge_id, period_key, granted_at, profiles!user_id(display_name)')
      .then(({ data, error: fetchError }) => {
        if (fetchError) {
          setError(isBackendUnavailableError(fetchError) ? "Can't load badges right now." : fetchError.message);
          setLoading(false);
          return;
        }
        setGrants((data as unknown as GrantRow[]) ?? []);
        setLoading(false);
      });

  useEffect(() => {
    if (!authReady || !user) {
      if (authReady) setLoading(false);
      return;
    }
    setLoading(true);
    refetchGrants();
    supabase
      .from('profiles')
      .select('legacy_starting_count')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setLegacyStartingCount((data as { legacy_starting_count: number }).legacy_starting_count ?? 0);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, user]);

  useEffect(() => {
    saveJSON(FOUNDING_FIFTY_STORAGE_KEY, foundingFiftyGrants);
  }, [foundingFiftyGrants]);

  useEffect(() => {
    saveJSON(RECAP_STORAGE_KEY, lastRecapMonthKey);
  }, [lastRecapMonthKey]);

  const totalWorkoutsLogged = completedWorkouts.length + deckCompletedCount;
  const weekPeriodKey = currentWeekPeriodKey();

  const myGrantedIds = useMemo(
    () => new Set(grants.filter((g) => g.user_id === user?.id).map((g) => g.badge_id)),
    [grants, user]
  );

  // Stamp each permanent computed badge into badge_grants the first time its
  // threshold is crossed — RLS only lets a member insert these 5 for
  // themselves (see supabase/setup.sql), so this never needs to touch
  // anyone else's row.
  useEffect(() => {
    if (!user) return;
    const toGrant: { badge_id: BadgeId; period_key: string }[] = [];
    if (totalWorkoutsLogged >= 1 && !myGrantedIds.has('day_one_doug')) {
      toGrant.push({ badge_id: 'day_one_doug', period_key: '' });
    }
    if (totalWorkoutsLogged >= HUNDRED_DOWN_TARGET && !myGrantedIds.has('hundred_down')) {
      toGrant.push({ badge_id: 'hundred_down', period_key: '' });
    }

    const weekdayKeys = onFireWeekdayKeys(scheduledCurrentWeek);
    const onFireCount = weekdayKeys.filter((key) => completedWorkouts.some((w) => w.dayKey === key)).length;
    const onFireEarnedNow = weekdayKeys.length > 0 && onFireCount >= weekdayKeys.length;
    const hasOnFireThisWeek = grants.some(
      (g) => g.user_id === user.id && g.badge_id === 'on_fire' && g.period_key === weekPeriodKey
    );
    if (onFireEarnedNow && !hasOnFireThisWeek) {
      toGrant.push({ badge_id: 'on_fire', period_key: weekPeriodKey });
    }

    const weekStart = getWeekStart().getTime();
    const regularCount = posts.filter((p) => p.author === displayName && p.kind === 'wod' && p.createdAt >= weekStart).length;
    const hasRegularThisWeek = grants.some(
      (g) => g.user_id === user.id && g.badge_id === 'the_regular' && g.period_key === weekPeriodKey
    );
    if (regularCount >= REGULAR_TARGET && !hasRegularThisWeek) {
      toGrant.push({ badge_id: 'the_regular', period_key: weekPeriodKey });
    }

    // LEGACY — stamp the current milestone the moment it's newly reached.
    // period_key holds the milestone number itself (see the badge_grants
    // comment in supabase/setup.sql) so another member can see "LEGACY
    // 100" on this account's posts without reading their bookings/profile
    // directly; earlier milestone rows are never deleted.
    const legacyLifetimeCountNow = legacyStartingCount + myBookings.length;
    const legacyMilestoneNow = legacyMilestoneFor(legacyLifetimeCountNow);
    if (legacyMilestoneNow > 0) {
      const hasThisMilestone = grants.some(
        (g) => g.user_id === user.id && g.badge_id === 'legacy' && g.period_key === String(legacyMilestoneNow)
      );
      if (!hasThisMilestone) toGrant.push({ badge_id: 'legacy', period_key: String(legacyMilestoneNow) });
    }

    // UPSTAIRS — 3+ booked-not-cancelled classes whose session falls inside
    // the current Mon-Sun week, same weekly reset convention as ON FIRE.
    const upstairsCountNow = myBookings.filter((b) => isThisWeek(b.startAt)).length;
    const hasUpstairsThisWeek = grants.some(
      (g) => g.user_id === user.id && g.badge_id === 'upstairs' && g.period_key === weekPeriodKey
    );
    if (upstairsCountNow >= UPSTAIRS_TARGET && !hasUpstairsThisWeek) {
      toGrant.push({ badge_id: 'upstairs', period_key: weekPeriodKey });
    }

    if (toGrant.length === 0) return;
    supabase
      .from('badge_grants')
      .upsert(
        toGrant.map((g) => ({ user_id: user.id, ...g })),
        { onConflict: 'user_id,badge_id,period_key' }
      )
      .then(() => refetchGrants());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, totalWorkoutsLogged, completedWorkouts, posts, displayName, weekPeriodKey, grants, legacyStartingCount, myBookings, scheduledCurrentWeek]);

  const value = useMemo<BadgeContextValue>(() => {
    const dayOneDougGrant = grants.find((g) => g.user_id === user?.id && g.badge_id === 'day_one_doug');
    const hundredDownGrant = grants.find((g) => g.user_id === user?.id && g.badge_id === 'hundred_down');
    const dayOneDougEarned = !!dayOneDougGrant;
    const hundredDownEarned = !!hundredDownGrant;
    const jokerEarned = myGrantedIds.has('joker');
    const foundingFiftyEarned = !!foundingFiftyGrants[displayName]?.granted;
    const crewEarned = fullContentAccess;
    const cowKillerEarned = grants.some(
      (g) => g.user_id === user?.id && g.badge_id === 'cow_killer' && g.period_key === weekPeriodKey
    );
    const myCowChampGrants = grants
      .filter((g) => g.user_id === user?.id && g.badge_id === 'cow_champ')
      .sort((a, b) => new Date(a.granted_at).getTime() - new Date(b.granted_at).getTime());
    const cowChampEarned = myCowChampGrants.length > 0;
    const cowChampCount = myCowChampGrants.length;
    const cowChampEarnedAt = cowChampEarned ? new Date(myCowChampGrants[0].granted_at).getTime() : null;

    const weekdayKeys = onFireWeekdayKeys(scheduledCurrentWeek);
    const onFireCount = weekdayKeys.filter((key) => completedWorkouts.some((w) => w.dayKey === key)).length;
    const onFireProgress = { count: onFireCount, target: weekdayKeys.length, earned: onFireCount >= weekdayKeys.length };

    const weekStart = getWeekStart().getTime();
    const regularCount = posts.filter((p) => p.author === displayName && p.kind === 'wod' && p.createdAt >= weekStart).length;
    const regularProgress = { count: regularCount, target: REGULAR_TARGET, earned: regularCount >= REGULAR_TARGET };

    // LEGACY — live-computed from this account's own data, so it's always
    // current even if the stored badge_grants milestone row lags behind
    // (e.g. right after admin raises legacy_starting_count, before the
    // self-grant effect's next upsert lands).
    const legacyLifetimeCount = legacyStartingCount + myBookings.length;
    const legacyMilestone = legacyMilestoneFor(legacyLifetimeCount);
    const legacyEarned = legacyMilestone > 0;

    // UPSTAIRS — 3+ booked-not-cancelled classes whose session falls inside
    // the current Mon-Sun week.
    const upstairsCount = myBookings.filter((b) => isThisWeek(b.startAt)).length;
    const upstairsProgress = { count: upstairsCount, target: UPSTAIRS_TARGET, earned: upstairsCount >= UPSTAIRS_TARGET };

    const myBadgeIds: BadgeId[] = [
      ...(crewEarned ? (['crew'] as BadgeId[]) : []),
      ...(foundingFiftyEarned ? (['founding_50'] as BadgeId[]) : []),
      ...(jokerEarned ? (['joker'] as BadgeId[]) : []),
      ...(cowChampEarned ? (['cow_champ'] as BadgeId[]) : []),
      ...(onFireProgress.earned ? (['on_fire'] as BadgeId[]) : []),
      ...(cowKillerEarned ? (['cow_killer'] as BadgeId[]) : []),
      ...(regularProgress.earned ? (['the_regular'] as BadgeId[]) : []),
      ...(upstairsProgress.earned ? (['upstairs'] as BadgeId[]) : []),
      ...(dayOneDougEarned ? (['day_one_doug'] as BadgeId[]) : []),
      ...(hundredDownEarned ? (['hundred_down'] as BadgeId[]) : []),
      ...(legacyEarned ? (['legacy'] as BadgeId[]) : []),
    ];

    // This author's current LEGACY milestone — live for the signed-in
    // member (always correct, see above), else the max of their own
    // stacked 'legacy' badge_grants period_keys (the milestone-as-text
    // convention — see the badge_grants comment in supabase/setup.sql).
    const legacyMilestoneForAuthor = (name: string): number => {
      if (name === displayName) return legacyMilestone;
      let best = 0;
      for (const g of grants) {
        if (g.badge_id !== 'legacy' || nameOf(g.profiles) !== name) continue;
        const n = parseInt(g.period_key, 10);
        if (!isNaN(n) && n > best) best = n;
      }
      return best;
    };

    const getBadgesForAuthor = (name: string): BadgeId[] => {
      if (name === displayName) return sortBadgeIds(myBadgeIds);
      const ids = new Set<BadgeId>();
      for (const g of grants) {
        if (nameOf(g.profiles) !== name) continue;
        if (g.badge_id === 'joker') ids.add('joker');
        else if (g.badge_id === 'cow_champ') ids.add('cow_champ');
        else if (g.badge_id === 'legacy') ids.add('legacy');
        else if (COMPUTED_BADGE_IDS.includes(g.badge_id)) {
          if (g.period_key === '' || g.period_key === weekPeriodKey) ids.add(g.badge_id);
        }
      }
      if (foundingFiftyGrants[name]?.granted) ids.add('founding_50');
      return sortBadgeIds(Array.from(ids));
    };

    return {
      loading,
      error,
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
      dayOneDougEarnedAt: dayOneDougGrant ? new Date(dayOneDougGrant.granted_at).getTime() : null,
      hundredDownEarnedAt: hundredDownGrant ? new Date(hundredDownGrant.granted_at).getTime() : null,
      cowChampEarned,
      cowChampCount,
      cowChampEarnedAt,
      legacyLifetimeCount,
      legacyMilestone,
      legacyEarned,
      upstairsProgress,
      getBadgesForAuthor,
      getJokerGrantedAt: (name) => {
        const grant = grants.find((g) => nameOf(g.profiles) === name && g.badge_id === 'joker');
        return grant ? new Date(grant.granted_at).getTime() : null;
      },
      getFoundingFiftyGrantedAt: (name) => foundingFiftyGrants[name]?.grantedAt ?? null,
      getCowChampCount: (name) => {
        if (name === displayName) return cowChampCount;
        return grants.filter((g) => g.badge_id === 'cow_champ' && nameOf(g.profiles) === name).length;
      },
      getLegacyMilestone: legacyMilestoneForAuthor,
      recordCowKillerScore: () => {
        if (!user) return;
        supabase
          .from('badge_grants')
          .upsert({ user_id: user.id, badge_id: 'cow_killer', period_key: weekPeriodKey }, { onConflict: 'user_id,badge_id,period_key' })
          .then(() => refetchGrants());
      },
      grantJoker: async (userId) => {
        const { error } = await supabase
          .from('badge_grants')
          .upsert({ user_id: userId, badge_id: 'joker', period_key: '', granted_by: user?.id ?? null }, { onConflict: 'user_id,badge_id,period_key' });
        if (error) {
          return { error: isBackendUnavailableError(error) ? "Can't save this right now — the backend isn't reachable." : error.message };
        }
        await refetchGrants();
        return { error: null };
      },
      revokeJoker: async (userId) => {
        const { error } = await supabase.from('badge_grants').delete().eq('user_id', userId).eq('badge_id', 'joker');
        if (error) {
          return { error: isBackendUnavailableError(error) ? "Can't save this right now — the backend isn't reachable." : error.message };
        }
        await refetchGrants();
        return { error: null };
      },
      grantFoundingFifty: (name) =>
        setFoundingFiftyGrants((prev) => ({ ...prev, [name]: { granted: true, grantedAt: Date.now() } })),
      previewMonthlyRecap: () => {
        if (!realAdmin) return;
        addTextPost('Doc', buildRecapTitle(), buildRecapBody({ getBadgesForAuthor, displayName, grants }), 'Announcement');
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grants, myGrantedIds, foundingFiftyGrants, displayName, completedWorkouts, posts, totalWorkoutsLogged, fullContentAccess, loading, error, user, weekPeriodKey, realAdmin, legacyStartingCount, myBookings, scheduledCurrentWeek]);

  // Auto-generate the monthly recap on the 1st, once per month — only when
  // the signed-in member is a real admin, since a recap posted under "Doc"
  // needs to actually be Doc now that authorship is real.
  useEffect(() => {
    if (!realAdmin) return;
    const now = new Date();
    if (now.getDate() !== 1) return;
    const key = `${now.getFullYear()}-${now.getMonth() + 1}`;
    if (lastRecapMonthKey === key) return;
    addTextPost('Doc', buildRecapTitle(now), buildRecapBody({ getBadgesForAuthor: value.getBadgesForAuthor, displayName, grants }), 'Announcement');
    setLastRecapMonthKey(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastRecapMonthKey, realAdmin]);

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
  grants,
}: {
  getBadgesForAuthor: (name: string) => BadgeId[];
  displayName: string;
  grants: GrantRow[];
}): string {
  // Every real member who holds at least one badge, plus whoever's
  // signed in now (in case they don't hold one yet) — no more standing in
  // for the rest of the gym with a hardcoded cast of names.
  const roster = Array.from(new Set([...grants.map((g) => nameOf(g.profiles)), displayName]));

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
