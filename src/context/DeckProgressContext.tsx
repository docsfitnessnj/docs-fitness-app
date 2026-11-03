import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { WorkoutLog, EMPTY_WORKOUT_LOG } from './WorkoutLogContext';
import { DECK_CARDS } from '../data/deckCards';
import { MovementWeights } from '../lib/movementWeights';
import { checkPersonalBest } from '../lib/personalBest';
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

// Round 44 — draft log text (rounds/reps/time/kettlebell/notes/media/
// movement weights) for a card that hasn't been marked complete yet. Same
// local-only-until-complete convention as WorkoutLogContext's own
// DRAFT_LOGS_STORAGE_KEY, kept entirely separate (a different key, a
// different provider) since deck progress and WOD logs have always been
// two independent contexts in this app.
const DECK_DRAFT_LOGS_STORAGE_KEY = 'docsfitness.deckLogDrafts.v1';

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

// Round 44 — the deck card's own real results shape, widened from a bare
// completion flag (migration_028) to match wod_completions, so a deck card
// can carry a real Log Results form for the first time. See AGENTS.md's
// Round 44 writeup for why this table had no results columns at all before
// this round.
type DeckRow = {
  card_id: string;
  rounds: string;
  reps: string | null;
  time_taken: string;
  kettlebell_kg: string | null;
  notes: string;
  media_url: string | null;
  media_type: 'image' | 'video' | null;
  movement_weights: MovementWeights | null;
  is_pb: boolean;
  completed_at: string;
};

function rowToLog(row: DeckRow): WorkoutLog {
  return {
    rounds: row.rounds,
    reps: row.reps ?? '',
    time: row.time_taken,
    kettlebell: row.kettlebell_kg ?? '',
    notes: row.notes,
    media: row.media_url ? { uri: row.media_url, type: row.media_type ?? 'image' } : null,
    movementWeights: row.movement_weights ?? {},
  };
}

// Round 44 — "the same deck card, before this edit" for PB comparison.
// deck_completions carries exactly one row per (user, card_id) ever (the
// table's own unique constraint), so there is no multi-attempt history to
// accumulate the way a recurring WOD title naturally builds across
// different weeks — the only "prior" a singleton-per-card model can ever
// have is whatever was in that one row immediately before this edit.
function priorScoreForCard(existing: DeckRow | undefined) {
  if (!existing) return [];
  return [{ time: existing.time_taken, rounds: existing.rounds, reps: existing.reps ?? undefined, kettlebell: existing.kettlebell_kg ?? '' }];
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
  // Round 44 — the card's full logged results (rounds/reps/time/kettlebell/
  // notes/media/movement weights), draft or completed either way, same
  // shape WorkoutLogContext.getLog already returns for a WOD.
  getLog: (cardId: string) => WorkoutLog;
  updateLog: (cardId: string, field: 'rounds' | 'reps' | 'time' | 'kettlebell' | 'notes', value: string) => void;
  setLogMedia: (cardId: string, media: WorkoutLog['media']) => void;
  setMovementWeight: (cardId: string, movementKey: string, weight: string) => void;
  // Round 44 — see WorkoutLogContext's own seedMovementWeights.
  seedMovementWeights: (cardId: string, weights: MovementWeights) => void;
  // Round 44 — "the last time you logged ANY workout containing this
  // movement" (deck history only; LogResultsModal merges this with
  // WorkoutLogContext's own movementWeightHistory before reading from
  // either).
  movementWeightHistory: { completedAt: number; movementWeights: MovementWeights }[];
  // Round 44 — whichever card(s) are complete and earned the PB tag at
  // save time (see toggleComplete/syncCompletedRow below).
  pbCardIds: Record<string, boolean>;
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
  const [rows, setRows] = useState<DeckRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, WorkoutLog>>(() => loadJSON(DECK_DRAFT_LOGS_STORAGE_KEY, {}));
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
      setRows([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      supabase
        .from('deck_completions')
        .select('card_id, rounds, reps, time_taken, kettlebell_kg, notes, media_url, media_type, movement_weights, is_pb, completed_at')
        .eq('user_id', user.id),
      supabase.from('deck_browse_order').select('card_order').eq('user_id', user.id).maybeSingle(),
    ]).then(([completionsRes, orderRes]) => {
      if (cancelled) return;
      if (completionsRes.error) {
        setError(isBackendUnavailableError(completionsRes.error) ? "Can't load your Deck progress right now." : completionsRes.error.message);
        setLoading(false);
        return;
      }
      setRows((completionsRes.data as DeckRow[]) ?? []);

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

  useEffect(() => {
    saveJSON(DECK_DRAFT_LOGS_STORAGE_KEY, drafts);
  }, [drafts]);

  const rowsByCard = useMemo(() => {
    const map = new Map<string, DeckRow>();
    for (const row of rows) map.set(row.card_id, row);
    return map;
  }, [rows]);

  const value = useMemo<DeckProgressContextValue>(() => {
    const completed: Record<string, boolean> = {};
    for (const row of rows) completed[row.card_id] = true;
    const completedCount = DECK_CARDS.filter((c) => completed[c.id]).length;
    const shouldOfferUpsell =
      completedCount >= 1 &&
      (lastUpsellShownAt === null || Date.now() - lastUpsellShownAt >= UPSELL_MIN_INTERVAL_MS);
    const completedAt: Record<string, number> = {};
    for (const row of rows) completedAt[row.card_id] = new Date(row.completed_at).getTime();
    const pbCardIds: Record<string, boolean> = {};
    for (const row of rows) if (row.is_pb) pbCardIds[row.card_id] = true;

    // Round 44 — same shape as WorkoutLogContext's syncCompletedRow: saves
    // an already-complete card's edited log (optimistic, rolled back on a
    // failed write), recomputing is_pb against this exact card's own prior
    // state every time rather than only once at first completion.
    const syncCompletedRow = async (cardId: string, log: WorkoutLog) => {
      if (!user) return;
      const existing = rowsByCard.get(cardId);
      if (!existing) return; // not completed yet — nothing to sync, stays a local draft
      const history = priorScoreForCard(existing);
      const { isPb } = checkPersonalBest(
        { time: log.time, rounds: log.rounds, reps: log.reps, kettlebell: log.kettlebell },
        history
      );
      const patch = {
        rounds: log.rounds,
        reps: log.reps.trim() || null,
        time_taken: log.time,
        kettlebell_kg: log.kettlebell.trim() || null,
        notes: log.notes,
        media_url: log.media?.uri ?? null,
        media_type: log.media?.type ?? null,
        movement_weights: log.movementWeights,
        is_pb: isPb,
      };
      setRows((prev) => prev.map((r) => (r.card_id === cardId ? { ...r, ...patch } : r)));
      const { error: updateError } = await supabase
        .from('deck_completions')
        .update(patch)
        .eq('user_id', user.id)
        .eq('card_id', cardId);
      if (updateError) {
        setRows((prev) => prev.map((r) => (r.card_id === cardId ? existing : r)));
        setWriteError(describeChatFailure(updateError, "Couldn't save those results. Check your connection and try again."));
      }
    };

    return {
      loading,
      error,
      isComplete: (id) => !!completed[id],
      getLog: (cardId) => {
        const row = rowsByCard.get(cardId);
        if (row) return rowToLog(row);
        return drafts[cardId] ?? EMPTY_WORKOUT_LOG;
      },
      updateLog: (cardId, field, value) => {
        const current = rowsByCard.get(cardId) ? rowToLog(rowsByCard.get(cardId)!) : (drafts[cardId] ?? EMPTY_WORKOUT_LOG);
        const nextLog = { ...current, [field]: value };
        setDrafts((prev) => ({ ...prev, [cardId]: nextLog }));
        syncCompletedRow(cardId, nextLog);
      },
      setLogMedia: (cardId, media) => {
        const current = rowsByCard.get(cardId) ? rowToLog(rowsByCard.get(cardId)!) : (drafts[cardId] ?? EMPTY_WORKOUT_LOG);
        const nextLog = { ...current, media };
        setDrafts((prev) => ({ ...prev, [cardId]: nextLog }));
        syncCompletedRow(cardId, nextLog);
      },
      setMovementWeight: (cardId, movementKey, weight) => {
        const current = rowsByCard.get(cardId) ? rowToLog(rowsByCard.get(cardId)!) : (drafts[cardId] ?? EMPTY_WORKOUT_LOG);
        const nextWeights = { ...current.movementWeights };
        if (weight.trim()) nextWeights[movementKey] = weight;
        else delete nextWeights[movementKey];
        const nextLog = { ...current, movementWeights: nextWeights };
        setDrafts((prev) => ({ ...prev, [cardId]: nextLog }));
        syncCompletedRow(cardId, nextLog);
      },
      seedMovementWeights: (cardId, weights) => {
        if (Object.keys(weights).length === 0) return;
        const current = rowsByCard.get(cardId) ? rowToLog(rowsByCard.get(cardId)!) : (drafts[cardId] ?? EMPTY_WORKOUT_LOG);
        const nextLog = { ...current, movementWeights: { ...weights, ...current.movementWeights } };
        setDrafts((prev) => ({ ...prev, [cardId]: nextLog }));
      },
      movementWeightHistory: rows.map((r) => ({
        completedAt: new Date(r.completed_at).getTime(),
        movementWeights: r.movement_weights ?? {},
      })),
      pbCardIds,
      // Optimistic, but no longer fire-and-forget (the root cause this
      // round fixed): both branches await the write and roll the local
      // state back to exactly what it was if the write fails, instead of
      // leaving a card marked complete that was never actually saved.
      toggleComplete: (id) => {
        if (!user) return;
        if (completed[id]) {
          const removedRow = rowsByCard.get(id)!;
          setRows((prev) => prev.filter((r) => r.card_id !== id));
          supabase
            .from('deck_completions')
            .delete()
            .eq('user_id', user.id)
            .eq('card_id', id)
            .then(({ error: deleteError }) => {
              if (deleteError) {
                setRows((prev) => [...prev, removedRow]);
                setWriteError(describeChatFailure(deleteError, "Couldn't undo that card. Check your connection and try again."));
              }
            });
        } else {
          const now = Date.now();
          const log = drafts[id] ?? EMPTY_WORKOUT_LOG;
          // Round 44 — a card is a one-row-per-card singleton, so a brand
          // new completion has no prior history by definition and can
          // never be a PB on its own first save.
          const newRow: DeckRow = {
            card_id: id,
            rounds: log.rounds,
            reps: log.reps.trim() || null,
            time_taken: log.time,
            kettlebell_kg: log.kettlebell.trim() || null,
            notes: log.notes,
            media_url: log.media?.uri ?? null,
            media_type: log.media?.type ?? null,
            movement_weights: log.movementWeights,
            is_pb: false,
            completed_at: new Date(now).toISOString(),
          };
          setRows((prev) => [...prev, newRow]);
          supabase
            .from('deck_completions')
            .upsert(
              {
                user_id: user.id,
                card_id: id,
                rounds: newRow.rounds,
                reps: newRow.reps,
                time_taken: newRow.time_taken,
                kettlebell_kg: newRow.kettlebell_kg,
                notes: newRow.notes,
                media_url: newRow.media_url,
                media_type: newRow.media_type,
                movement_weights: newRow.movement_weights,
                is_pb: newRow.is_pb,
                completed_at: newRow.completed_at,
              },
              { onConflict: 'user_id,card_id' }
            )
            .then(({ error: upsertError }) => {
              if (upsertError) {
                setRows((prev) => prev.filter((r) => r.card_id !== id));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, rowsByCard, drafts, lastUpsellShownAt, browseOrder, loading, error, writeError, user]);

  return <DeckProgressContext.Provider value={value}>{children}</DeckProgressContext.Provider>;
}

export function useDeckProgress() {
  const ctx = useContext(DeckProgressContext);
  if (!ctx) {
    throw new Error('useDeckProgress must be used within a DeckProgressProvider');
  }
  return ctx;
}
