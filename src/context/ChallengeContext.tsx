import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { ContentCowScoringType, useContentLibrary } from './ContentLibraryContext';
import { getChallengeCycle } from '../lib/challengeSchedule';
import { isBackendUnavailableError, supabase } from '../lib/supabaseClient';

// The label next to a member's name on the leaderboard — computed live from
// their own profile's "how do you train" answer, never stored on the entry
// itself, so it always reflects where they train *now* (see
// tagFromHowTrain below).
export type ChallengeTag = 'Boathouse Crew' | 'Online';

export type LeaderboardEntry = {
  rank: number;
  name: string;
  kettlebell: string;
  rounds: string;
  // Only meaningful for scoringType 'rounds_reps' — the partial round's
  // rep count on top of `rounds`. Omitted otherwise.
  reps?: string;
  time: string;
  tag: ChallengeTag;
};

// What the Weekly Challenge tab (and the sidebar's preview module) actually
// render — whichever Content Library Challenge entry is currently
// PUBLISHED and already past its release date (a scheduled-but-future
// entry never jumps the gun), or `sourceId: null` if Doc hasn't published
// one for the current cycle yet. There is no invented placeholder
// challenge here — a null sourceId means the screen shows a plain
// "Coming this week" line, never made-up content.
export type CurrentChallenge = {
  title: string;
  format: string;
  formatDescription: string;
  movements: string[];
  videoUrl: string;
  // Every real Challenge has exactly one of the two real scoring types —
  // see ContentCowScoringType. Only null for a legacy/unset Content
  // Library entry saved before scoring type was required.
  scoringType: ContentCowScoringType | null;
  // null when no real challenge is live for the current cycle.
  sourceId: string | null;
  // Saturday 12:00pm ET this cycle's scores lock, and the Sunday 6:00pm ET
  // after that when the next challenge can go live — see
  // lib/challengeSchedule.ts. Always present, even with no real challenge,
  // so the tab can always show correct timing copy.
  closeAt: number;
  nextRevealAt: number;
  isClosed: boolean;
};

const EMPTY_CHALLENGE: Omit<CurrentChallenge, 'closeAt' | 'nextRevealAt' | 'isClosed'> = {
  title: '',
  format: '',
  formatDescription: '',
  movements: [],
  videoUrl: '',
  scoringType: null,
  sourceId: null,
};

export type ChallengeEntry = {
  id: string;
  author: string;
  challengeTitle: string;
  kettlebell: string;
  rounds: string;
  reps?: string;
  time: string;
  tag: ChallengeTag;
  createdAt: number;
};

type ChallengeContextValue = {
  loading: boolean;
  error: string | null;
  entries: ChallengeEntry[];
  addEntry: (entry: Omit<ChallengeEntry, 'id' | 'createdAt' | 'author' | 'tag'>) => void;
};

const ChallengeContext = createContext<ChallengeContextValue | undefined>(undefined);

type ProfileRef = { display_name: string; how_train: string | null } | { display_name: string; how_train: string | null }[] | null;

function profileOf(ref: ProfileRef) {
  return Array.isArray(ref) ? ref[0] : ref;
}

// TRAIN AT THE BOATHOUSE -> "Boathouse Crew", TRAIN ONLINE -> "Online" — an
// account that hasn't answered yet (e.g. it came in through a door that
// skips the question) defaults to Online, the more common case.
function tagFromHowTrain(howTrain: string | null | undefined): ChallengeTag {
  return howTrain === 'boathouse' ? 'Boathouse Crew' : 'Online';
}

type ChallengeEntryRow = {
  id: string;
  challenge_title: string;
  kettlebell_kg: number;
  rounds: string;
  reps: string | null;
  time_taken: string;
  created_at: string;
  profiles: ProfileRef;
};

function rowToEntry(row: ChallengeEntryRow): ChallengeEntry {
  const profile = profileOf(row.profiles);
  return {
    id: row.id,
    author: profile?.display_name?.trim() || 'Member',
    challengeTitle: row.challenge_title,
    kettlebell: String(row.kettlebell_kg),
    rounds: row.rounds,
    reps: row.reps ?? undefined,
    time: row.time_taken,
    tag: tagFromHowTrain(profile?.how_train),
    createdAt: new Date(row.created_at).getTime(),
  };
}

const ENTRY_SELECT = 'id, challenge_title, kettlebell_kg, rounds, reps, time_taken, created_at, profiles(display_name, how_train)';

// Weekly Challenge (COWs) submissions — every member's entries, read from
// the shared `challenge_entries` table, so the leaderboard is the same for
// everyone (not just whatever this device happened to post).
export function ChallengeProvider({ children }: { children: React.ReactNode }) {
  const { user, authReady } = useAuth();
  const [entries, setEntries] = useState<ChallengeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authReady || !user) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from('challenge_entries')
      .select(ENTRY_SELECT)
      .order('created_at', { ascending: true })
      .then(({ data, error: fetchError }) => {
        if (cancelled) return;
        if (fetchError) {
          setError(isBackendUnavailableError(fetchError) ? "Can't load the leaderboard right now." : fetchError.message);
          setLoading(false);
          return;
        }
        setEntries(((data as unknown as ChallengeEntryRow[]) ?? []).map(rowToEntry));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authReady, user]);

  const value = useMemo<ChallengeContextValue>(
    () => ({
      loading,
      error,
      entries,
      addEntry: (entry) => {
        if (!user) return;
        supabase
          .from('challenge_entries')
          .insert({
            user_id: user.id,
            challenge_title: entry.challengeTitle,
            kettlebell_kg: Number(entry.kettlebell) || 0,
            rounds: entry.rounds,
            reps: entry.reps ?? null,
            time_taken: entry.time,
          })
          .select(ENTRY_SELECT)
          .single()
          .then(({ data }) => {
            if (data) setEntries((prev) => [...prev, rowToEntry(data as unknown as ChallengeEntryRow)]);
          });
      },
    }),
    [entries, loading, error, user]
  );

  return <ChallengeContext.Provider value={value}>{children}</ChallengeContext.Provider>;
}

export function useChallenge() {
  const ctx = useContext(ChallengeContext);
  if (!ctx) {
    throw new Error('useChallenge must be used within a ChallengeProvider');
  }
  return ctx;
}

// The Content Library entry actually driving the Weekly Challenge tab right
// now. The challenge closes to new scores Saturday 12:00pm ET and the next
// one can only go live Sunday 6:00pm ET (see lib/challengeSchedule.ts) —
// while the current cycle is CLOSED (that Saturday-to-Sunday window), this
// stays pinned to whatever was published as of the close instant, so
// nothing Doc publishes mid-freeze for the *next* cycle can jump the gun
// early. Once a new cycle opens, it's simply the most recently published
// COW whose release date has already passed, same as before. Calls
// useContentLibrary() directly rather than living inside
// ContentLibraryProvider, since that provider sits *below* ChallengeProvider
// in App.tsx's tree — this only works called from a component under both,
// which every real caller (DocsCowsScreen, IdentitySidebar) already is.
export function useCurrentChallenge(): CurrentChallenge {
  const { workouts } = useContentLibrary();
  const now = new Date();
  const cycle = getChallengeCycle(now);
  const asOf = cycle.isClosed ? cycle.closeAt.getTime() : now.getTime();

  const live = workouts
    .filter((w) => w.type === 'cow' && w.status === 'published' && w.releaseAt <= asOf)
    .sort((a, b) => b.releaseAt - a.releaseAt)[0];

  const cycleFields = {
    closeAt: cycle.closeAt.getTime(),
    nextRevealAt: cycle.nextCycleStart.getTime(),
    isClosed: cycle.isClosed,
  };

  if (!live) return { ...EMPTY_CHALLENGE, ...cycleFields };

  return {
    title: live.name,
    format: live.format,
    formatDescription: live.formatDescription,
    movements: live.movements,
    videoUrl: live.videoUrl,
    scoringType: live.scoringType ?? null,
    sourceId: live.id,
    ...cycleFields,
  };
}

// "9:42" -> 582. Anything unparseable (including the '—' placeholder) sorts
// to the very end regardless of ascending/descending, since it's not a real
// score.
function parseTimeToSeconds(time: string): number {
  const trimmed = time.trim();
  const colonMatch = trimmed.match(/^(\d+):(\d{1,2})$/);
  if (colonMatch) return Number(colonMatch[1]) * 60 + Number(colonMatch[2]);
  const asNumber = Number(trimmed);
  return trimmed !== '' && !Number.isNaN(asNumber) ? asNumber : Number.POSITIVE_INFINITY;
}

// Rounds and reps combined into one sortable number — 12 rounds + 8 reps
// beats 12 rounds + 3 reps beats 11 rounds + anything. Unparseable rounds
// (including the '—' placeholder) sort to the very end.
function parseRoundsReps(rounds: string, reps: string | undefined): number {
  const r = Number(rounds.trim());
  if (Number.isNaN(r)) return Number.NEGATIVE_INFINITY;
  const p = Number((reps ?? '0').trim());
  return r * 1000 + (Number.isNaN(p) ? 0 : p);
}

// This week's real submissions for the current Challenge, sorted the one
// correct way for its scoring type — fastest time first, or most
// rounds+reps first — and ranked accordingly. A Challenge only ever shows
// one of the two displays, never both.
export function useChallengeLeaderboard(): LeaderboardEntry[] {
  const { entries } = useChallenge();
  const current = useCurrentChallenge();
  // 'rounds' is a legacy scoring type from before Challenges were narrowed
  // to exactly two choices (see ContentWorkoutForm) — still handled here as
  // "more work wins," same as 'rounds_reps', so an already-saved Content
  // Library entry with the old value keeps sorting correctly.
  const isTimeScoring = current.scoringType === 'time' || current.scoringType === null;

  const posted = entries.filter((e) => e.challengeTitle === current.title);
  const sorted = [...posted].sort((a, b) =>
    isTimeScoring ? parseTimeToSeconds(a.time) - parseTimeToSeconds(b.time) : parseRoundsReps(b.rounds, b.reps) - parseRoundsReps(a.rounds, a.reps)
  );

  return sorted.map((e, i) => ({
    rank: i + 1,
    name: e.author,
    kettlebell: e.kettlebell,
    rounds: e.rounds,
    reps: e.reps,
    time: e.time,
    tag: e.tag,
  }));
}
