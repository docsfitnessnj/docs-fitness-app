import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { loadJSON, saveJSON } from '../lib/storage';

const STORAGE_KEY = 'docsfitness.challengeEntries.v1';

// Single source of truth for the current Challenge of the Week — used by
// both the Weekly Challenge tab and the desktop sidebar's preview module.
export const CHALLENGE_TITLE = 'SWING CHALLENGE';

export type ChallengeTag = 'Boathouse Crew' | 'Virtual';

export type LeaderboardEntry = {
  rank: number;
  name: string;
  kettlebell: string;
  rounds: string;
  time: string;
  tag: ChallengeTag;
};

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

// Demo rows plus this week's real submissions, in posting order — shared by
// the Weekly Challenge tab (full board) and the sidebar's top-3 preview.
export function useChallengeLeaderboard(): LeaderboardEntry[] {
  const { entries } = useChallenge();
  const posted: LeaderboardEntry[] = entries
    .filter((e) => e.challengeTitle === CHALLENGE_TITLE)
    .map((e, i) => ({
      rank: DEMO_ENTRIES.length + i + 1,
      name: e.author,
      kettlebell: e.kettlebell,
      rounds: e.rounds,
      time: e.time,
      tag: e.tag,
    }));
  return [...DEMO_ENTRIES, ...posted];
}
