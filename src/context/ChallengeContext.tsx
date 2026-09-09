import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ContentCowScoringType, useContentLibrary } from './ContentLibraryContext';
import { loadJSON, saveJSON } from '../lib/storage';

const STORAGE_KEY = 'docsfitness.challengeEntries.v1';

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

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `challenge-${idCounter}`;
}

type ChallengeContextValue = {
  entries: ChallengeEntry[];
  addEntry: (
    entry: Omit<ChallengeEntry, 'id' | 'createdAt'>
  ) => void;
};

const ChallengeContext = createContext<ChallengeContextValue | undefined>(undefined);

// Weekly Challenge (COWs) submissions — persisted so a member's own entries
// show up in My Workouts and survive an app restart, same as WODs and deck
// cards.
export function ChallengeProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<ChallengeEntry[]>(() => loadJSON(STORAGE_KEY, []));

  useEffect(() => {
    saveJSON(STORAGE_KEY, entries);
  }, [entries]);

  const value = useMemo<ChallengeContextValue>(
    () => ({
      entries,
      addEntry: (entry) => {
        setEntries((prev) => [...prev, { ...entry, id: nextId(), createdAt: Date.now() }]);
      },
    }),
    [entries]
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
