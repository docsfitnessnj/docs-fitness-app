import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { ContentCowScoringType, useContentLibrary } from './ContentLibraryContext';
import { isBackendUnavailableError, supabase } from '../lib/supabaseClient';

// The one built-in Challenge of the Week, shown until Doc has a PUBLISHED
// Challenge drafted in the admin Content Library — see useCurrentChallenge
// below, which is what the Weekly Challenge tab and the sidebar's preview
// module actually read from. Kept as the fallback rather than deleted so
// the tab still shows something real on a fresh install / before Doc has
// used the Content Library at all.
export const CHALLENGE_TITLE = 'SWING CHALLENGE';
const FALLBACK_DESCRIPTION = 'Rack up as many kettlebell swings as you can, for time. No shortcuts, no excuses.';
const FALLBACK_DAYS_LEFT = 4;

export type ChallengeTag = 'Boathouse Crew' | 'Virtual';

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
// render — either the built-in fallback above, or whichever Content
// Library Challenge entry is currently PUBLISHED and already past its
// release date, so a scheduled-but-not-yet-live entry never jumps the gun.
export type CurrentChallenge = {
  title: string;
  format: string;
  formatDescription: string;
  movements: string[];
  videoUrl: string;
  // null only for the built-in fallback — every real Content Library COW
  // entry always has one (enforced when it's saved).
  scoringType: ContentCowScoringType | null;
  daysLeft: number;
  // null for the fallback; the live entry's own id otherwise, so callers
  // can tell "no real challenge yet" apart from "a real one, coincidentally
  // named the same as the fallback."
  sourceId: string | null;
};

const FALLBACK_CHALLENGE: CurrentChallenge = {
  title: CHALLENGE_TITLE,
  format: '',
  formatDescription: FALLBACK_DESCRIPTION,
  movements: [],
  videoUrl: '',
  scoringType: null,
  daysLeft: FALLBACK_DAYS_LEFT,
  sourceId: null,
};

const CHALLENGE_RUN_LENGTH_DAYS = 7;

// Seed rows standing in for the rest of the gym until there's a real
// backend — the Weekly Challenge tab appends real submissions after these.
const DEMO_ENTRIES: LeaderboardEntry[] = [
  { rank: 1, name: 'J. Marino', kettlebell: '16', rounds: '12', time: '8:42', tag: 'Boathouse Crew' },
  { rank: 2, name: 'K. Alvarez', kettlebell: '12', rounds: '11', time: '9:05', tag: 'Boathouse Crew' },
  { rank: 3, name: 'T. Ruiz', kettlebell: '16', rounds: '10', time: '9:18', tag: 'Virtual' },
  { rank: 4, name: 'S. Boyle', kettlebell: '12', rounds: '10', time: '9:47', tag: 'Boathouse Crew' },
  { rank: 5, name: 'D. Castillo', kettlebell: '8', rounds: '9', time: '10:02', tag: 'Virtual' },
];

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
  addEntry: (entry: Omit<ChallengeEntry, 'id' | 'createdAt' | 'author'>) => void;
};

const ChallengeContext = createContext<ChallengeContextValue | undefined>(undefined);

type ChallengeEntryRow = {
  id: string;
  challenge_title: string;
  kettlebell_kg: number;
  rounds: string;
  reps: string | null;
  time_taken: string;
  tag: ChallengeTag;
  created_at: string;
  profiles: { display_name: string } | { display_name: string }[] | null;
};

function authorNameOf(row: ChallengeEntryRow): string {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  return profile?.display_name?.trim() || 'Member';
}

function rowToEntry(row: ChallengeEntryRow): ChallengeEntry {
  return {
    id: row.id,
    author: authorNameOf(row),
    challengeTitle: row.challenge_title,
    kettlebell: String(row.kettlebell_kg),
    rounds: row.rounds,
    reps: row.reps ?? undefined,
    time: row.time_taken,
    tag: row.tag,
    createdAt: new Date(row.created_at).getTime(),
  };
}

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
      .select('id, challenge_title, kettlebell_kg, rounds, reps, time_taken, tag, created_at, profiles(display_name)')
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
            tag: entry.tag,
          })
          .select('id, challenge_title, kettlebell_kg, rounds, reps, time_taken, tag, created_at, profiles(display_name)')
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
// now — the most recently published COW whose release date has already
// passed (a SCHEDULED-but-future entry never jumps ahead of its own release
// date), or the built-in fallback if Doc hasn't published one yet. Calls
// useContentLibrary() directly rather than living inside
// ContentLibraryProvider, since that provider sits *below* ChallengeProvider
// in App.tsx's tree — this only works called from a component under both,
// which every real caller (DocsCowsScreen, IdentitySidebar) already is.
export function useCurrentChallenge(): CurrentChallenge {
  const { workouts } = useContentLibrary();
  const now = Date.now();
  const live = workouts
    .filter((w) => w.type === 'cow' && w.status === 'published' && w.releaseAt <= now)
    .sort((a, b) => b.releaseAt - a.releaseAt)[0];

  if (!live) return FALLBACK_CHALLENGE;

  const daysSinceRelease = Math.floor((now - live.releaseAt) / (24 * 60 * 60 * 1000));
  return {
    title: live.name,
    format: live.format,
    formatDescription: live.formatDescription,
    movements: live.movements,
    videoUrl: live.videoUrl,
    scoringType: live.scoringType ?? null,
    daysLeft: Math.max(0, CHALLENGE_RUN_LENGTH_DAYS - daysSinceRelease),
    sourceId: live.id,
  };
}

// Demo rows plus this week's real submissions, in posting order — shared by
// the Weekly Challenge tab (full board) and the sidebar's top-3 preview.
export function useChallengeLeaderboard(): LeaderboardEntry[] {
  const { entries } = useChallenge();
  const current = useCurrentChallenge();
  const posted: LeaderboardEntry[] = entries
    .filter((e) => e.challengeTitle === current.title)
    .map((e, i) => ({
      rank: DEMO_ENTRIES.length + i + 1,
      name: e.author,
      kettlebell: e.kettlebell,
      rounds: e.rounds,
      reps: e.reps,
      time: e.time,
      tag: e.tag,
    }));
  return [...DEMO_ENTRIES, ...posted];
}
