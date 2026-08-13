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
