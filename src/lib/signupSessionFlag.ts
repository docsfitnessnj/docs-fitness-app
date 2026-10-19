const KEY = 'docsfitness.signedUpThisSession.v1';

// Set the instant a brand-new account is created (AuthContext.signUp, the
// one place this ever happens), keyed to that account's own id. Read by
// the upgrade nudge's own rule: never show during the session in which the
// account was created — a person's first minutes in the app are for the
// welcome, not an upsell.
//
// sessionStorage (not localStorage) is the right scope: it's cleared the
// instant the browser tab/window truly closes, which is exactly what "the
// session in which the account was created" means here — a reload of the
// same tab stays the same session, a brand new tab does not. Keying it to
// the account id (rather than just a bare boolean) is what keeps this
// correct if the same tab later signs out and into a DIFFERENT, pre-
// existing account without closing — that account's id won't match, so it
// reads as not-this-session for it, with no separate sign-out cleanup
// needed.
export function markSignedUpThisSession(userId: string): void {
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(KEY, userId);
  } catch {
    // ignore availability errors
  }
}

export function signedUpThisSession(userId: string | null): boolean {
  if (!userId) return false;
  try {
    return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(KEY) === userId;
  } catch {
    return false;
  }
}
