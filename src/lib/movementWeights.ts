// Round 44: per-movement weight entries, and the prefill that makes them
// worth filling in at all -- "whatever the member entered for that movement
// the LAST time they logged any workout containing it."
//
// Key scheme (confirmed with the owner before building): a movement line is
// run through the app's existing Movement Vault matcher (movementMatcher.ts's
// findMovementInText -- the same code that already powers "tap a movement
// name" everywhere else in this app). A real match keys the entry by the
// Vault's own stable id (`movement:<id>`), so "Swings" and "Kettlebell
// Swings" correctly prefill from each other and roll up together for a
// future recap. No match falls back to the movement's own normalized text
// (`raw:<trimmed, lowercased text>`) -- e.g. a card's flavor line, or a
// movement Doc hasn't added to the Vault yet.
import { findMovementInText } from './movementMatcher';
import { MOVEMENTS } from '../data/movements';

export type MovementWeights = Record<string, string>;

export function movementWeightKey(movementLine: string): string {
  const movement = findMovementInText(movementLine);
  if (movement) return `movement:${movement.id}`;
  return `raw:${movementLine.trim().toLowerCase()}`;
}

// Turns a movementWeightKey back into a human-readable label for History
// rendering — the Vault's own real display name for a `movement:<id>` key,
// or the plain normalized text for a `raw:<text>` key.
export function movementWeightLabel(key: string): string {
  if (key.startsWith('movement:')) {
    const id = key.slice('movement:'.length);
    const movement = MOVEMENTS.find((m) => m.id === id);
    if (movement) return movement.name;
  }
  if (key.startsWith('raw:')) return key.slice('raw:'.length);
  return key;
}

// One past logged entry's own weights, newest first is NOT required here --
// findLastWeight itself sorts by completedAt descending before scanning, so
// callers can pass entries in any order.
export type WeightHistoryEntry = {
  completedAt: number;
  movementWeights: MovementWeights;
};

// "The last time they logged any workout containing it" -- scans every
// history entry (already loaded into context state; no extra fetch),
// newest first, and returns the first non-empty weight recorded under this
// exact key. Returns undefined (never throws) when nothing qualifies --
// an empty prefill is simply not shown, never a blocking error.
export function findLastWeight(key: string, history: WeightHistoryEntry[]): string | undefined {
  const sorted = [...history].sort((a, b) => b.completedAt - a.completedAt);
  for (const entry of sorted) {
    const value = entry.movementWeights?.[key];
    if (value && value.trim()) return value;
  }
  return undefined;
}
