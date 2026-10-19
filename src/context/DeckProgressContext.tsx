import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { DECK_CARDS } from '../data/deckCards';
import { loadJSON, saveJSON } from '../lib/storage';
import { describeChatFailure, isBackendUnavailableError, supabase } from '../lib/supabaseClient';

const UPSELL_STORAGE_KEY = 'docsfitness.deckUpsell.v1';
// No longer this context's own source of truth — the browse grid order now
// lives in `deck_browse_order` (migration_020), keyed to the account like
// completedAt below, not this device. The key is still exported so
// localImport.ts can do a one-time rescue of whatever was sitting here from
// before this round into the database on first sign-in.
export const DECK_SHUFFLE_ORDER_RESCUE_KEY = 'docsfitness.deckShuffleOrder.v1';
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

function isValidOrder(order: string[]): boolean {
  const knownIds = new Set(DECK_CARDS.map((c) => c.id));
  return order.length === DECK_CARDS.length && order.every((id) => knownIds.has(id));
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
  // Browse-mode card order/positions. Completed cards are frozen in place;
  // only the not-yet-complete slots move on reshuffle. Keyed to the
  // account (deck_browse_order, migration_020) — the same grid layout shows
  // up on every device a member signs into, not just whichever one last
  // reshuffled it.
  browseOrder: string[];
  reshuffleBrowseOrder: () => void;
  // When each completed card was first marked complete — drives My Workouts.
  completedAt: Record<string, number>;
  // "Complete your first card, then at most once a month" upsell for the physical deck.
  shouldOfferUpsell: boolean;
  recordUpsellShown: () => void;
  // A completion (or browse-order) write that didn't actually land in the
  // database — surfaced so the screen can show a quiet, honest note instead
  // of leaving a card marked complete that silently reverts the next time
  // the member signs in. Rolled back automatically on failure.
  writeError: string | null;
  clearWriteError: () => void;
};

const DeckProgressContext = createContext<DeckProgressContextValue | undefined>(undefined);

export function DeckProgressProvider({ children }: { children: React.ReactNode }) {
  const { user, authReady } = useAuth();
  const [completedAt, setCompletedAt] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [lastUpsellShownAt, setLastUpsellShownAt] = useState<number | null>(() =>
    loadJSON<number | null>(UPSELL_STORAGE_KEY, null)
  );
  // Always has something to render immediately (no empty-grid flash while
  // the account's real order loads) — replaced by the account's own order
  // the moment the fetch below resolves, and persisted to the database from
  // then on rather than back to localStorage.
  const [browseOrder, setBrowseOrder] = useState<string[]>(() => shuffledCardIds());

  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      setCompletedAt({});
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      supabase.from('deck_completions').select('card_id, completed_at').eq('user_id', user.id),
      supabase.from('deck_browse_order').select('card_order').eq('user_id', user.id).maybeSingle(),
    ]).then(([completionsRes, orderRes]) => {
      if (cancelled) return;
      if (completionsRes.error) {
        setError(isBackendUnavailableError(completionsRes.error) ? "Can't load your Deck progress right now." : completionsRes.error.message);
        setLoading(false);
        return;
      }
      const map: Record<string, number> = {};
      for (const row of completionsRes.data ?? []) map[row.card_id] = new Date(row.completed_at).getTime();
      setCompletedAt(map);

      const storedOrder = (orderRes.data as { card_order: string[] } | null)?.card_order ?? null;
      if (storedOrder && isValidOrder(storedOrder)) {
        setBrowseOrder(storedOrder);
      } else {
        // First time this account has ever had a browse order (or
        // localImport hasn't run yet) — this device's freshly-generated
        // order becomes the account's order from now on.
        const fresh = shuffledCardIds();
        setBrowseOrder(fresh);
        supabase
          .from('deck_browse_order')
          .upsert({ user_id: user.id, card_order: fresh }, { onConflict: 'user_id' });
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [authReady, user]);

  useEffect(() => {
    saveJSON(UPSELL_STORAGE_KEY, lastUpsellShownAt);
  }, [lastUpsellShownAt]);

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
      // Optimistic, but no longer fire-and-forget (the root cause this
      // round fixed): both branches await the write and roll the local
      // state back to exactly what it was if the write fails, instead of
      // leaving a card marked complete that was never actually saved.
      toggleComplete: (id) => {
        if (!user) return;
        if (completed[id]) {
          const removedAt = completedAt[id];
          setCompletedAt((prev) => {
            const { [id]: _removed, ...rest } = prev;
            return rest;
          });
          supabase
            .from('deck_completions')
            .delete()
            .eq('user_id', user.id)
            .eq('card_id', id)
            .then(({ error: deleteError }) => {
              if (deleteError) {
                setCompletedAt((prev) => ({ ...prev, [id]: removedAt }));
                setWriteError(describeChatFailure(deleteError, "Couldn't undo that card. Check your connection and try again."));
              }
            });
        } else {
          const now = Date.now();
          setCompletedAt((prev) => ({ ...prev, [id]: now }));
          supabase
            .from('deck_completions')
            .upsert({ user_id: user.id, card_id: id, completed_at: new Date(now).toISOString() }, { onConflict: 'user_id,card_id' })
            .then(({ error: upsertError }) => {
              if (upsertError) {
                setCompletedAt((prev) => {
                  const { [id]: _removed, ...rest } = prev;
                  return rest;
                });
                setWriteError(describeChatFailure(upsertError, "Couldn't save that card. Check your connection and try again."));
              }
            });
        }
      },
      completedCount,
      totalCount: DECK_CARDS.length,
      browseOrder,
      reshuffleBrowseOrder: () => {
        if (!user) return;
        const previousOrder = browseOrder;
        const nextOrder = reshuffleUncompletedPositions(previousOrder, completed);
        setBrowseOrder(nextOrder);
        supabase
          .from('deck_browse_order')
          .upsert({ user_id: user.id, card_order: nextOrder }, { onConflict: 'user_id' })
          .then(({ error: upsertError }) => {
            if (upsertError) {
              setBrowseOrder(previousOrder);
              setWriteError(describeChatFailure(upsertError, "Couldn't save the deck's new order. Check your connection and try again."));
            }
          });
      },
      completedAt,
      pickRandomUncompleted: () => {
        const pool = DECK_CARDS.filter((c) => !completed[c.id]);
        if (pool.length === 0) return null;
        return pool[Math.floor(Math.random() * pool.length)].id;
      },
      shouldOfferUpsell,
      recordUpsellShown: () => setLastUpsellShownAt(Date.now()),
      writeError,
      clearWriteError: () => setWriteError(null),
    };
  }, [completedAt, lastUpsellShownAt, browseOrder, loading, error, writeError, user]);

  return <DeckProgressContext.Provider value={value}>{children}</DeckProgressContext.Provider>;
}

export function useDeckProgress() {
  const ctx = useContext(DeckProgressContext);
  if (!ctx) {
    throw new Error('useDeckProgress must be used within a DeckProgressProvider');
  }
  return ctx;
}
