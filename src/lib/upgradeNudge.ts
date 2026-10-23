import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useClassBookingData } from '../context/ClassBookingContext';
import { useMembership } from '../context/MembershipContext';
import { useProfile } from '../context/ProfileContext';
import { showAlert } from './alert';
import { useCheckoutGatePhase } from './checkoutRedirectGate';
import { canShowInterruption, claimInterruption, releaseInterruption } from './interruptionGate';
import { openMemberships } from './membershipsModal';
import { signedUpThisSession } from './signupSessionFlag';
import { loadJSON, saveJSON } from './storage';

const STORAGE_KEY = 'docsfitness.lastUpgradeNudgeAt.v1';
const MIN_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

// One gentle popup a week, max, for free-tier accounts — never on every
// open, and never stacked with (or shown instead of) the spotlight tour,
// the trial expiry warning, or anything else self-launching — see
// interruptionGate.ts, the one shared mechanism every such popup in this
// app goes through. On top of that, this popup has its own tighter rules:
//
// 1. Never while the tour is active or about to claim the slot itself —
//    enforced by the shared gate check below, not a special case here.
// 2. Never during the session the account was created in — a person's
//    first minutes in the app are for the welcome, not an upsell. It can
//    show from their next session onward (signupSessionFlag.ts).
// 3. Never to a member who arrived through the in-person path (first
//    class free armed or booked — i.e. `how_train` is 'boathouse') until
//    a real class booking of theirs actually exists — pitching plan copy
//    about WODs and the Deck to someone here to book a class is mistimed.
// 4. When blocked by any of the above (including the shared gate), it's
//    skipped silently for this mount/session, never retried the moment
//    whatever blocked it clears — see the `firedThisMount` guard below,
//    which is what actually enforces that: without it, this effect would
//    legitimately re-run (and could re-attempt) the moment `active`
//    recomputes true again later in the same session, e.g. right when the
//    tour finishes and frees the shared gate — exactly the "pops back up
//    the moment the tour ends" behavior this rule forbids. The member's
//    next natural session gets a real, fresh attempt instead.
export function useWeeklyUpgradeNudge() {
  const { user } = useAuth();
  const { tier, stateLoading, stateRefetching } = useMembership();
  const { howTrain, loading: profileLoading, refetching: profileRefetching } = useProfile();
  const checkoutGatePhase = useCheckoutGatePhase();
  const { hasEverBooked } = useClassBookingData();
  const firedThisMount = useRef(false);

  // Same "mid-checkout-redirect, or a background refetch, isn't a safe
  // moment" reasoning as the rest of this app's one-shot popups — a
  // brand-new online signup reads as 'online_free' for the brief window
  // before a real subscription confirms, exactly the window a checkout
  // redirect can be in progress.
  const memberStateSettled = !stateLoading && !stateRefetching && !profileLoading && !profileRefetching;
  const active = tier === 'online_free' && !checkoutGatePhase && memberStateSettled;

  useEffect(() => {
    if (!active || firedThisMount.current) return;
    // Consumed the instant this attempt is made, whether or not it
    // actually ends up showing anything — see rule 4 above.
    firedThisMount.current = true;

    if (signedUpThisSession(user?.id ?? null)) return;

    if (howTrain === 'boathouse' && !hasEverBooked) return;

    const lastShownAt = loadJSON<number | null>(STORAGE_KEY, null);
    if (lastShownAt !== null && Date.now() - lastShownAt < MIN_INTERVAL_MS) return;

    // The shared gate, checked synchronously right here — not cached, not
    // checked earlier and acted on later. See interruptionGate.ts.
    if (!canShowInterruption('upgradeNudge')) return;
    claimInterruption('upgradeNudge');

    saveJSON(STORAGE_KEY, Date.now());
    showAlert(
      'Unlock Everything',
      "You're on the free plan — 2 of 5 kettlebell workouts a week, no COWS, no Deck. Upgrade any time for full access.",
      [
        { text: 'Not now', style: 'cancel', onPress: () => releaseInterruption('upgradeNudge') },
        {
          text: 'See Plans',
          onPress: () => {
            releaseInterruption('upgradeNudge');
            openMemberships('unlock');
          },
        },
      ]
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
