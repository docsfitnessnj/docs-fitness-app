// The spotlight tour's ONE external precondition: it must never start while
// a checkout redirect is pending, in progress, or its return is still being
// confirmed (the confetti/welcome-modal celebration is queued, playing, or
// on screen). This is deliberately a plain module-level variable, not React
// state — the whole reason it exists is to close a race no amount of state
// plumbing can, because React effects run children-before-parents within a
// single commit: CommunityScreen's own "start the tour on mount" effect can
// fire before a parent's effect has had any chance to read the URL and set
// state in response. A module-level flag has no such ordering problem — the
// very first read of this module (long before any component renders) can
// already reflect a `?checkout=success` redirect Stripe just sent back.
//
// Lifecycle:
//  - Set the moment a checkout is about to be requested (stripeCheckout.ts)
//    or right before signUp() on the fast "START FREE" door path (App.tsx),
//    since that path can mount CommunityScreen before startOnlineCheckout is
//    even called.
//  - Also set synchronously at import time if the page loaded with
//    `?checkout=success` in the URL — the real redirect-back case.
//  - Cleared the moment it's provably safe: a checkout that never happened
//    (signup failed, checkout failed to start), a cancelled checkout (no
//    purchase, no celebration coming), a success that timed out without a
//    confirmed subscription (no celebration coming), or — the one true
//    "purchase completed" path — the instant the purchase celebration is
//    dismissed via GET STARTED, right before the tour's own explicit start
//    call.
const hasSuccessParamOnLoad =
  typeof window !== 'undefined' && typeof window.location !== 'undefined'
    ? new URLSearchParams(window.location.search).get('checkout') === 'success'
    : false;

let pending = hasSuccessParamOnLoad;

export function isCheckoutRedirectPending(): boolean {
  return pending;
}

export function markCheckoutRedirectPending(): void {
  pending = true;
}

export function clearCheckoutRedirectPending(): void {
  pending = false;
}
