import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { DECK_CARDS } from '../data/deckCards';
import { loadJSON, saveJSON } from '../lib/storage';

const STORAGE_KEY = 'docsfitness.deckProgress.v1';

type DeckProgressContextValue = {
  isComplete: (id: string) => boolean;
  toggleComplete: (id: string) => void;
  completedCount: number;
  totalCount: number;
  pickRandomUncompleted: () => string | null;
};

const DeckProgressContext = createContext<DeckProgressContextValue | undefined>(undefined);

export function DeckProgressProvider({ children }: { children: React.ReactNode }) {
  const [completed, setCompleted] = useState<Record<string, boolean>>(() => loadJSON(STORAGE_KEY, {}));

  useEffect(() => {
    saveJSON(STORAGE_KEY, completed);
  }, [completed]);

  const value = useMemo<DeckProgressContextValue>(() => {
    const completedCount = DECK_CARDS.filter((c) => completed[c.id]).length;

    return {
      isComplete: (id) => !!completed[id],
      toggleComplete: (id) => {
        setCompleted((prev) => ({ ...prev, [id]: !prev[id] }));
      },
      completedCount,
      totalCount: DECK_CARDS.length,
      pickRandomUncompleted: () => {
        const pool = DECK_CARDS.filter((c) => !completed[c.id]);
        if (pool.length === 0) return null;
        return pool[Math.floor(Math.random() * pool.length)].id;
      },
    };
  }, [completed]);

  return <DeckProgressContext.Provider value={value}>{children}</DeckProgressContext.Provider>;
}

export function useDeckProgress() {
  const ctx = useContext(DeckProgressContext);
  if (!ctx) {
    throw new Error('useDeckProgress must be used within a DeckProgressProvider');
  }
  return ctx;
}
