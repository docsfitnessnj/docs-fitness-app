import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { DECK_CARDS } from '../data/deckCards';
import { loadJSON, saveJSON } from '../lib/storage';

const STORAGE_KEY = 'docsfitness.deckProgress.v1';
const COMPLETED_AT_STORAGE_KEY = 'docsfitness.deckProgressCompletedAt.v1';
const UPSELL_STORAGE_KEY = 'docsfitness.deckUpsell.v1';
const SHUFFLE_STORAGE_KEY = 'docsfitness.deckShuffleOrder.v1';
const UPSELL_MIN_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

function shuffle<T>(items: T[]): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function shuffledCardIds(): string[] {
  return shuffle(DECK_CARDS.map((c) => c.id));
}

// Reshuffles only the positions held by not-yet-complete cards — a completed
// card keeps the grid slot it was in the moment it got marked complete,
// forever, while the face-down cards around it keep moving.
function reshuffleUncompletedPositions(order: string[], completed: Record<string, boolean>): string[] {
  const shuffledIncomplete = shuffle(order.filter((id) => !completed[id]));
  let cursor = 0;
  return order.map((id) => (completed[id] ? id : shuffledIncomplete[cursor++]));
}

type DeckProgressContextValue = {
  isComplete: (id: string) => boolean;
  toggleComplete: (id: string) => void;
  completedCount: number;
  totalCount: number;
  pickRandomUncompleted: () => string | null;
  // Browse-mode card order/positions, persisted. Completed cards are frozen
  // in place; only the not-yet-complete slots move on reshuffle.
  browseOrder: string[];
  reshuffleBrowseOrder: () => void;
  // When each completed card was first marked complete — drives My Workouts.
  completedAt: Record<string, number>;
  // "Complete your first card, then at most once a month" upsell for the physical deck.
  shouldOfferUpsell: boolean;
  recordUpsellShown: () => void;
};

const DeckProgressContext = createContext<DeckProgressContextValue | undefined>(undefined);

export function DeckProgressProvider({ children }: { children: React.ReactNode }) {
  const [completed, setCompleted] = useState<Record<string, boolean>>(() => loadJSON(STORAGE_KEY, {}));
  const [completedAt, setCompletedAt] = useState<Record<string, number>>(() =>
    loadJSON(COMPLETED_AT_STORAGE_KEY, {})
  );
  const [lastUpsellShownAt, setLastUpsellShownAt] = useState<number | null>(() =>
    loadJSON<number | null>(UPSELL_STORAGE_KEY, null)
  );
  const [browseOrder, setBrowseOrder] = useState<string[]>(() => {
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
    saveJSON(COMPLETED_AT_STORAGE_KEY, completedAt);
  }, [completedAt]);

  useEffect(() => {
    saveJSON(UPSELL_STORAGE_KEY, lastUpsellShownAt);
  }, [lastUpsellShownAt]);

  useEffect(() => {
    saveJSON(SHUFFLE_STORAGE_KEY, browseOrder);
  }, [browseOrder]);

  const value = useMemo<DeckProgressContextValue>(() => {
    const completedCount = DECK_CARDS.filter((c) => completed[c.id]).length;
    const shouldOfferUpsell =
      completedCount >= 1 &&
      (lastUpsellShownAt === null || Date.now() - lastUpsellShownAt >= UPSELL_MIN_INTERVAL_MS);

    return {
      isComplete: (id) => !!completed[id],
      toggleComplete: (id) => {
        setCompleted((prev) => ({ ...prev, [id]: !prev[id] }));
        setCompletedAt((prev) => {
          if (completed[id]) {
            const { [id]: _removed, ...rest } = prev;
            return rest;
          }
          return { ...prev, [id]: Date.now() };
        });
      },
      completedCount,
      totalCount: DECK_CARDS.length,
      browseOrder,
      reshuffleBrowseOrder: () => setBrowseOrder((prev) => reshuffleUncompletedPositions(prev, completed)),
      completedAt,
      pickRandomUncompleted: () => {
        const pool = DECK_CARDS.filter((c) => !completed[c.id]);
        if (pool.length === 0) return null;
        return pool[Math.floor(Math.random() * pool.length)].id;
      },
      shouldOfferUpsell,
      recordUpsellShown: () => setLastUpsellShownAt(Date.now()),
    };
  }, [completed, completedAt, lastUpsellShownAt, browseOrder]);

  return <DeckProgressContext.Provider value={value}>{children}</DeckProgressContext.Provider>;
}

export function useDeckProgress() {
  const ctx = useContext(DeckProgressContext);
  if (!ctx) {
    throw new Error('useDeckProgress must be used within a DeckProgressProvider');
  }
  return ctx;
}
