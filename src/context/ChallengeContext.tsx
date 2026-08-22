import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { loadJSON, saveJSON } from '../lib/storage';

const STORAGE_KEY = 'docsfitness.challengeEntries.v1';

export type ChallengeTag = 'Boathouse Crew' | 'Virtual';

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
