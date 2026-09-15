import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { DECK_CARDS } from '../data/deckCards';
import { loadJSON, saveJSON } from '../lib/storage';
import { isBackendUnavailableError, supabase } from '../lib/supabaseClient';

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
  loading: boolean;
  error: string | null;
  isComplete: (id: string) => boolean;
  toggleComplete: (id: string) => void;
  completedCount: number;
  totalCount: number;
  pickRandomUncompleted: () => string | null;
  // Browse-mode card order/positions, persisted. Completed cards are frozen
  // in place; only the not-yet-complete slots move on reshuffle. This is
  // purely local device UI state, not tracked progress, so it stays in
  // localStorage rather than the database.
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
  const { user, authReady } = useAuth();
  const [completedAt, setCompletedAt] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
    if (!authReady) return;
    if (!user) {
      setCompletedAt({});
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase
      .from('deck_completions')
      .select('card_id, completed_at')
      .eq('user_id', user.id)
      .then(({ data, error: fetchError }) => {
        if (cancelled) return;
        if (fetchError) {
          setError(isBackendUnavailableError(fetchError) ? "Can't load your Deck progress right now." : fetchError.message);
          setLoading(false);
          return;
        }
        const map: Record<string, number> = {};
        for (const row of data ?? []) map[row.card_id] = new Date(row.completed_at).getTime();
        setCompletedAt(map);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authReady, user]);

  useEffect(() => {
    saveJSON(UPSELL_STORAGE_KEY, lastUpsellShownAt);
  }, [lastUpsellShownAt]);

  useEffect(() => {
    saveJSON(SHUFFLE_STORAGE_KEY, browseOrder);
  }, [browseOrder]);

  const value = useMemo<DeckProgressContextValue>(() => {
    const completed: Record<string, boolean> = {};
    for (const id of Object.keys(completedAt)) completed[id] = true;
    const completedCount = DECK_CARDS.filter((c) => completed[c.id]).length;
    const shouldOfferUpsell =
      completedCount >= 1 &&
      (lastUpsellShownAt === null || Date.now() - lastUpsellShownAt >= UPSELL_MIN_INTERVAL_MS);

    return {
      loading,
      error,
      isComplete: (id) => !!completed[id],
      toggleComplete: (id) => {
        if (!user) return;
        if (completed[id]) {
          setCompletedAt((prev) => {
            const { [id]: _removed, ...rest } = prev;
            return rest;
          });
          supabase.from('deck_completions').delete().eq('user_id', user.id).eq('card_id', id);
        } else {
          const now = Date.now();
          setCompletedAt((prev) => ({ ...prev, [id]: now }));
          supabase
            .from('deck_completions')
            .upsert({ user_id: user.id, card_id: id, completed_at: new Date(now).toISOString() }, { onConflict: 'user_id,card_id' });
        }
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
  }, [completedAt, lastUpsellShownAt, browseOrder, loading, error, user]);

  return <DeckProgressContext.Provider value={value}>{children}</DeckProgressContext.Provider>;
}

export function useDeckProgress() {
  const ctx = useContext(DeckProgressContext);
  if (!ctx) {
    throw new Error('useDeckProgress must be used within a DeckProgressProvider');
  }
  return ctx;
}
