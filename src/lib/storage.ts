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
