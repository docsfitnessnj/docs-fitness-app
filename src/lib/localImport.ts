import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { DECK_CARDS } from '../data/deckCards';
import { DECK_SHUFFLE_ORDER_RESCUE_KEY } from '../context/DeckProgressContext';
import { loadJSON, saveJSON } from './storage';
import { supabase } from './supabaseClient';

const IMPORT_DONE_KEY = 'docsfitness.localImportDone.v1';

// The old local-only version's storage keys — read directly (not through
// each context) since this needs to run once, early, before those contexts
// necessarily have a real backend row to merge into.
const LEGACY_WORKOUT_LOGS_KEY = 'docsfitness.workoutLogs.v1';
const LEGACY_WORKOUT_COMPLETED_KEY = 'docsfitness.workoutCompleted.v1';
const LEGACY_DECK_COMPLETED_KEY = 'docsfitness.deckProgress.v1';
const LEGACY_DECK_COMPLETED_AT_KEY = 'docsfitness.deckProgressCompletedAt.v1';

type LegacyWorkoutLog = { rounds: string; time: string; kettlebell: string; notes: string; media: { uri: string; type: 'image' | 'video' } | null };
type LegacyCompletedMeta = { workoutTitle: string; dateLabel: string; timestamp: number; completedAt: number };

async function importLocalDataForUser(userId: string): Promise<void> {
  const logs = loadJSON<Record<string, LegacyWorkoutLog>>(LEGACY_WORKOUT_LOGS_KEY, {});
  const completed = loadJSON<Record<string, LegacyCompletedMeta>>(LEGACY_WORKOUT_COMPLETED_KEY, {});
  const deckCompleted = loadJSON<Record<string, boolean>>(LEGACY_DECK_COMPLETED_KEY, {});
  const deckCompletedAt = loadJSON<Record<string, number>>(LEGACY_DECK_COMPLETED_AT_KEY, {});

  const wodRows = Object.entries(completed).map(([dayKey, meta]) => {
    const log = logs[dayKey];
    return {
      user_id: userId,
      day_key: dayKey,
      workout_title: meta.workoutTitle,
      date_label: meta.dateLabel,
      workout_timestamp: meta.timestamp,
      rounds: log?.rounds ?? '',
      time_taken: log?.time ?? '',
      kettlebell_kg: log?.kettlebell?.trim() || null,
      notes: log?.notes ?? '',
      media_url: log?.media?.uri ?? null,
      media_type: log?.media?.type ?? null,
      completed_at: new Date(meta.completedAt).toISOString(),
    };
  });

  const deckRows = Object.keys(deckCompleted)
    .filter((cardId) => deckCompleted[cardId])
    .map((cardId) => ({
      user_id: userId,
      card_id: cardId,
      completed_at: new Date(deckCompletedAt[cardId] ?? Date.now()).toISOString(),
    }));

  // No local posts to import — the previous local-only version never
  // persisted Community posts at all (pure in-memory demo seed, reset on
  // every reload), so there's nothing there to bring forward.

  if (wodRows.length > 0) {
    const { error } = await supabase.from('wod_completions').upsert(wodRows, { onConflict: 'user_id,day_key' });
    if (error) throw error;
  }
  if (deckRows.length > 0) {
    const { error } = await supabase.from('deck_completions').upsert(deckRows, { onConflict: 'user_id,card_id' });
    if (error) throw error;
  }

  // Deck browse-grid order (migration_020) — this one wasn't an old
  // pre-backend key, it's the CURRENT key DeckProgressContext wrote to
  // every time a member reshuffled, right up until this round. Rescue
  // whatever this device has, but only as this account's FIRST order: if
  // another device already synced one for this account (e.g. a beta tester
  // who signs in on their phone before this rescue runs on their laptop),
  // that one wins — `ignoreDuplicates` makes this insert a no-op rather
  // than clobbering a real, possibly-already-reshuffled account order with
  // a stale local one.
  const knownIds = new Set(DECK_CARDS.map((c) => c.id));
  const localOrder = loadJSON<string[]>(DECK_SHUFFLE_ORDER_RESCUE_KEY, []);
  const validLocalOrder = localOrder.length === DECK_CARDS.length && localOrder.every((id) => knownIds.has(id));
  if (validLocalOrder) {
    const { error } = await supabase
      .from('deck_browse_order')
      .upsert({ user_id: userId, card_order: localOrder }, { onConflict: 'user_id', ignoreDuplicates: true });
    if (error) throw error;
  }
}

// Runs once per device, the first time a session is available after this
// backend round ships — brings this device's pre-backend local data (WOD
// completions + logs, Deck completions) AND this round's own newly-migrated
// local-only data (the Deck browse grid order) into the now-signed-in
// account, then marks the device done so it's never attempted again.
// Device-scoped (not account-scoped) on purpose, matching "on first sign
// in" literally — this is about not losing whatever was sitting on this
// browser before accounts existed, not about per-account replay.
export function useLocalImportOnFirstSignIn() {
  const { user, authReady } = useAuth();

  useEffect(() => {
    if (!authReady || !user) return;
    if (loadJSON(IMPORT_DONE_KEY, false)) return;

    let cancelled = false;
    importLocalDataForUser(user.id)
      .then(() => {
        if (!cancelled) saveJSON(IMPORT_DONE_KEY, true);
      })
      .catch(() => {
        // Leave the flag unset on failure (offline, backend not set up
        // yet) so this retries on a future sign-in rather than silently
        // losing the device's only copy of this data.
      });

    return () => {
      cancelled = true;
    };
  }, [authReady, user]);
}
