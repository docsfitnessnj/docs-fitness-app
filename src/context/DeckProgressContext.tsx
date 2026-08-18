import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { DECK_CARDS } from '../data/deckCards';
import { loadJSON, saveJSON } from '../lib/storage';

const STORAGE_KEY = 'docsfitness.deckProgress.v1';
const UPSELL_STORAGE_KEY = 'docsfitness.deckUpsell.v1';
const SHUFFLE_STORAGE_KEY = 'docsfitness.deckShuffleOrder.v1';
const UPSELL_MIN_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

function shuffledCardIds(): string[] {
  const ids = DECK_CARDS.map((c) => c.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}

type DeckProgressContextValue = {
  isComplete: (id: string) => boolean;
  toggleComplete: (id: string) => void;
  completedCount: number;
  totalCount: number;
  pickRandomUncompleted: () => string | null;
  // Browse-mode card order, shuffled once per user and persisted so face-down
  // cards don't telegraph their identity via suit/rank order.
  browseOrder: string[];
  // "Complete your first card, then at most once a month" upsell for the physical deck.
  shouldOfferUpsell: boolean;
  recordUpsellShown: () => void;
};

const DeckProgressContext = createContext<DeckProgressContextValue | undefined>(undefined);

export function DeckProgressProvider({ children }: { children: React.ReactNode }) {
  const [completed, setCompleted] = useState<Record<string, boolean>>(() => loadJSON(STORAGE_KEY, {}));
  const [lastUpsellShownAt, setLastUpsellShownAt] = useState<number | null>(() =>
    loadJSON<number | null>(UPSELL_STORAGE_KEY, null)
  );
  const [browseOrder] = useState<string[]>(() => {
    const stored = loadJSON<string[]>(SHUFFLE_STORAGE_KEY, []);
    const knownIds = new Set(DECK_CARDS.map((c) => c.id));
    const valid = stored.length === DECK_CARDS.length && stored.every((id) => knownIds.has(id));
    if (valid) return stored;
    const fresh = shuffledCardIds();
    saveJSON(SHUFFLE_STORAGE_KEY, fresh);
    return fresh;
  });

  useEffect(() => {
    saveJSON(STORAGE_KEY, completed);
  }, [completed]);

  useEffect(() => {
    saveJSON(UPSELL_STORAGE_KEY, lastUpsellShownAt);
  }, [lastUpsellShownAt]);

  const value = useMemo<DeckProgressContextValue>(() => {
    const completedCount = DECK_CARDS.filter((c) => completed[c.id]).length;
    const shouldOfferUpsell =
      completedCount >= 1 &&
      (lastUpsellShownAt === null || Date.now() - lastUpsellShownAt >= UPSELL_MIN_INTERVAL_MS);

    return {
      isComplete: (id) => !!completed[id],
      toggleComplete: (id) => {
        setCompleted((prev) => ({ ...prev, [id]: !prev[id] }));
      },
      completedCount,
      totalCount: DECK_CARDS.length,
      browseOrder,
      pickRandomUncompleted: () => {
        const pool = DECK_CARDS.filter((c) => !completed[c.id]);
        if (pool.length === 0) return null;
        return pool[Math.floor(Math.random() * pool.length)].id;
      },
      shouldOfferUpsell,
      recordUpsellShown: () => setLastUpsellShownAt(Date.now()),
    };
  }, [completed, lastUpsellShownAt, browseOrder]);

  return <DeckProgressContext.Provider value={value}>{children}</DeckProgressContext.Provider>;
}

export function useDeckProgress() {
  const ctx = useContext(DeckProgressContext);
  if (!ctx) {
    throw new Error('useDeckProgress must be used within a DeckProgressProvider');
  }
  return ctx;
}
