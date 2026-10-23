// A shareable web link for Instagram promotion — `?book=pilates` opens the
// app directly toward DOWNBEACH PILATES WITH MARINA (migration_023). Read
// once at module import time (same convention as checkoutRedirectGate.ts
// — before any component has a chance to render, so there's no race
// between "did we see the URL yet" and the first paint), then persisted
// into sessionStorage so the intent survives a brand-new visitor's real
// path through this app: land on About -> sign up -> land on Community,
// all of which can take a few real seconds and a few real screens. Cleared
// the instant it's actually consumed (CommunityScreen auto-opening the
// booking prompt), so it never re-fires on a later, unrelated visit within
// the same tab.
const SESSION_KEY = 'docsfitness.pilatesBookingIntent.v1';

function readFromUrlOnce(): boolean {
  if (typeof window === 'undefined' || typeof window.location === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get('book') !== 'pilates') return false;
  // Strip the query string immediately, same as every other query-param
  // entry point in this app (checkoutRedirect.ts) — a later refresh
  // shouldn't replay this.
  window.history.replaceState({}, '', window.location.pathname + window.location.hash);
  return true;
}

const sawUrlOnLoad = readFromUrlOnce();

function readSessionFlag(): boolean {
  try {
    return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

function writeSessionFlag(value: boolean): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    if (value) sessionStorage.setItem(SESSION_KEY, '1');
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Private-browsing/storage-disabled — the in-memory flag below still
    // covers the common case (the visitor never leaves this tab).
  }
}

if (sawUrlOnLoad) writeSessionFlag(true);

export function hasPilatesBookingIntent(): boolean {
  return sawUrlOnLoad || readSessionFlag();
}

export function consumePilatesBookingIntent(): void {
  writeSessionFlag(false);
}
