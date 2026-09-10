// Thin localStorage wrapper. No-ops safely when localStorage isn't available
// (native, or a locked-down browser context) instead of throwing.
export function loadJSON<T>(key: string, fallback: T): T {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw) as T;
    }
  } catch {
    // ignore malformed storage
  }
  return fallback;
}

export function saveJSON(key: string, value: unknown): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    // ignore quota/availability errors
  }
}

// For any array of user-editable, id-keyed records that ships with static
// seed content (e.g. ContentLibraryContext's imported workouts): a plain
// `loadJSON(key, SEED)` only ever falls back to SEED when the key doesn't
// exist yet, so on any device that already has *something* stored there
// (even a single manually-added test entry from before the seed existed),
// the seed is permanently shadowed — new seed content ships in the
// codebase but never appears for that user, forever, since the stored
// value is never empty again. `seedVersion` fixes this: it's stored
// alongside the data, and whenever it's behind the seed's current version,
// any seed entries missing by `id` are merged in (appended, not
// overwritten) and the version is bumped. Existing stored entries —
// whether shipped-seed rows the user has since edited, or rows the user
// added themselves — are never touched, so genuine edits are never lost;
// only entries genuinely missing get added. Bump `seedVersion` at the call
// site whenever the seed gains content that should reach existing users.
export function loadSeededArray<T extends { id: string }>(key: string, seed: T[], seedVersion: number): T[] {
  const versionKey = `${key}.seedVersion`;
  try {
    if (typeof localStorage === 'undefined') return seed;
    const raw = localStorage.getItem(key);
    if (raw === null) {
      saveJSON(key, seed);
      saveJSON(versionKey, seedVersion);
      return seed;
    }

    const stored = JSON.parse(raw) as T[];
    // No version key at all (data predates this versioning mechanism
    // entirely, e.g. the pre-fix "Down Beach Native" case) counts as
    // version 0 — always older than any real seed version, so it merges.
    const storedVersion = loadJSON<number>(versionKey, 0);
    if (storedVersion >= seedVersion) return stored;

    const existingIds = new Set(stored.map((item) => item.id));
    const merged = [...stored, ...seed.filter((item) => !existingIds.has(item.id))];
    saveJSON(key, merged);
    saveJSON(versionKey, seedVersion);
    return merged;
  } catch {
    return seed;
  }
}

// Companion to loadSeededArray for an explicit "reset to seed" action
// (discard every local edit/addition and reload the seed exactly as
// shipped) — writes both the data and its version key so a later load
// doesn't immediately think it's behind and re-merge.
export function resetToSeedArray<T>(key: string, seed: T[], seedVersion: number): T[] {
  saveJSON(key, seed);
  saveJSON(`${key}.seedVersion`, seedVersion);
  return seed;
}

// Every context that persists to localStorage (membership, profile, badges,
// workout logs, deck progress, the tour-completed flag, and more) keys its
// storage as "docsfitness.*" (or the one legacy "docsFitness.*" — the tour
// flag predates the lowercase convention). Sign out needs to clear all of
// them without maintaining a growing list of keys here that's guaranteed to
// go stale the next time a context adds its own persistence — removing
// every key under that shared prefix instead means anything that follows
// the convention is covered automatically. Plain localStorage.clear()
// would be wrong here: GitHub Pages project sites share one origin per
// account, so that could wipe unrelated data from a different project
// hosted at the same *.github.io domain.
export function clearAppStorage(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.toLowerCase().startsWith('docsfitness.')) keys.push(key);
    }
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {
    // ignore availability errors
  }
}
