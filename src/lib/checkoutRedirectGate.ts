import { useSyncExternalStore } from 'react';

// The one external precondition for two separate things: the spotlight
// tour (it must never start while a checkout redirect is pending, in
// progress, or its return is still being confirmed) and the branded
// "taking you to checkout" / "confirming your membership" loading screen
// that replaces the member app entirely for that same span. This is
// deliberately a plain module-level variable, not React state alone — the
// whole reason it exists is to close a race no amount of state plumbing
// can, because React effects run children-before-parents within a single
// commit: CommunityScreen's own "start the tour on mount" effect can fire
// before a parent's effect has had any chance to read the URL and set
// state in response. A module-level value has no such ordering problem —
// the very first read of this module (long before any component renders)
// can already reflect a `?checkout=success` redirect Stripe just sent
// back. React components read it reactively via useCheckoutGatePhase
// (useSyncExternalStore), which re-renders the instant it changes — never
// a stale closure, never a missed frame.
//
// Phases:
//  - 'redirecting': about to navigate to Stripe, or already on the way
//    there. Set right before a checkout is requested (stripeCheckout.ts)
//    or right before signUp() on the fast "START FREE" door path
//    (App.tsx), since that path can mount CommunityScreen/MainApp before
//    startOnlineCheckout is even called.
//  - 'confirming': back from a successful checkout, polling for the
//    webhook to land. Set synchronously at import time if the page loaded
//    with `?checkout=success` in the URL, and again (belt-and-suspenders)
//    once checkoutRedirect.ts's own effect confirms it.
//  - null: not blocked. Set the moment it's provably safe — a checkout
//    that never happened (signup failed, checkout failed to start), a
//    cancelled checkout or portal return (no purchase, no celebration
//    coming), a success that timed out without a confirmed subscription
//    (no celebration coming), or — the one true "purchase completed"
//    path — the instant the purchase celebration is dismissed via GET
//    STARTED, right before the tour's own explicit start call.
export type CheckoutGatePhase = 'redirecting' | 'confirming' | null;

const hasSuccessParamOnLoad =
  typeof window !== 'undefined' && typeof window.location !== 'undefined'
    ? new URLSearchParams(window.location.search).get('checkout') === 'success'
    : false;

let phase: CheckoutGatePhase = hasSuccessParamOnLoad ? 'confirming' : null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function getCheckoutGatePhase(): CheckoutGatePhase {
  return phase;
}

export function isCheckoutRedirectPending(): boolean {
  return phase !== null;
}

export function markCheckoutRedirecting(): void {
  phase = 'redirecting';
  notify();
}

export function markCheckoutConfirming(): void {
  phase = 'confirming';
  notify();
}

export function clearCheckoutRedirectPending(): void {
  phase = null;
  notify();
}

export function subscribeCheckoutGatePhase(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// React's own tool for exactly this: a value that lives outside React and
// can change between renders for reasons React didn't cause — subscribing
// this way (rather than useState+useEffect) means a change is never missed
// even if it happens between this component's render and its effects
// running.
export function useCheckoutGatePhase(): CheckoutGatePhase {
  return useSyncExternalStore(subscribeCheckoutGatePhase, getCheckoutGatePhase);
}

// Round 25: "cold feet is a normal exit, not an error" — a real-device bug
// found that tapping the X on Stripe's own checkout page could leave this
// app stuck on the "TAKING YOU TO CHECKOUT" loading screen forever,
// requiring a full app close. Root cause: Stripe's cancel_url takes the
// member back to this same origin, which SHOULD be a normal page load (and
// checkoutRedirect.ts's own effect, reading `?checkout=cancel`, already
// clears this gate on that path) — but a real device can instead restore
// the page from the browser's own back/forward cache (bfcache) rather than
// reloading it, which replays the in-memory JS heap exactly as it was
// mid-redirect (`phase` still 'redirecting') without ever re-running that
// effect or re-evaluating `hasSuccessParamOnLoad` at the top of this file.
//
// This is the first of two independent backstops (the second is
// CheckoutRedirectLoadingScreen's own ~10s BACK TO THE APP button) —
// deliberately redundant, since neither alone is guaranteed to catch every
// browser's exact behavior here. Both `visibilitychange` (the member
// switches back to this tab/app) and `pageshow` (fires specifically, with
// `persisted: true`, on a bfcache restore — the more precise signal for
// the exact failure mode found on device) are listened for; either one
// firing while still 'redirecting' (never 'confirming' — that phase
// represents a real completed checkout already polling for the webhook,
// with its own existing timeout) clears the gate. Registered once here, at
// module load, same as every other piece of this file — never inside a
// component, so it can never be skipped by whatever did or didn't mount.
if (typeof document !== 'undefined') {
  const clearIfStuckRedirecting = () => {
    if (phase === 'redirecting') {
      clearCheckoutRedirectPending();
    }
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') clearIfStuckRedirecting();
  });
  window.addEventListener('pageshow', clearIfStuckRedirecting);
}
