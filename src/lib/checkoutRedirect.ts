import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useBadges } from '../context/BadgeContext';
import { useClassBookingData } from '../context/ClassBookingContext';
import { useClassPack } from '../context/ClassPackContext';
import { useFoundingFifty } from '../context/FoundingFiftyContext';
import { useMembership } from '../context/MembershipContext';
import { useDisplayName } from '../context/ProfileContext';
import { useSubscription } from '../context/SubscriptionContext';
import { clearCheckoutRedirectPending, markCheckoutConfirming } from './checkoutRedirectGate';
import { supabase } from './supabaseClient';

const POLL_INTERVAL_MS = 1500;
const MAX_POLL_ATTEMPTS = 8;

type OneTimePurchase = { plan: 'ten_pack' | 'drop_in' | 'pilates_guest' } | null;

// After Stripe Checkout (or the billing portal) redirects back to this app
// (?checkout=success|cancel|return in the URL), reopen the Memberships
// screen so the member isn't just dropped on whatever tab they happened to
// be on — "Cancel returns them to the memberships screen unchanged" per the
// round's brief, and success/return do the same. On success specifically,
// poll for a few seconds until the webhook has actually landed, then fire
// the purchase celebration exactly once — never optimistically before
// that's confirmed, since the webhook and the browser redirect race each
// other independently. Two different real things can be the thing that
// confirms: the `subscriptions` row (online plans, and in-person Monthly
// Unlimited — both real Stripe subscriptions), or an `in_person_purchases`
// row keyed by this checkout's own Session id (10 Class Pack or Drop In —
// one-time payments, not subscriptions).
export function useCheckoutRedirect(onOpenMemberships: () => void) {
  const membership = useMembership();
  const subscription = useSubscription();
  const classPack = useClassPack();
  const classBooking = useClassBookingData();
  const founding50 = useFoundingFifty();
  const badges = useBadges();
  const displayName = useDisplayName();
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [oneTimePurchase, setOneTimePurchase] = useState<OneTimePurchase>(null);
  // The Checkout Session id from the URL — not state, since it's read once
  // at mount and never needs to trigger a re-render on its own.
  const sessionIdRef = useRef<string | null>(null);

  // Reads the URL exactly once, right after mount.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    if (!checkout) return;

    sessionIdRef.current = params.get('session_id');
    // Strip the query string immediately so a later refresh doesn't replay
    // this (especially re-firing the celebration).
    window.history.replaceState({}, '', window.location.pathname + window.location.hash);
    onOpenMemberships();
    if (checkout === 'success') {
      // Already set to 'confirming' (module import saw this exact URL
      // before any component rendered — see checkoutRedirectGate.ts) —
      // marking again here is just belt-and-suspenders. Drives the
      // branded "CONFIRMING YOUR MEMBERSHIP" loading takeover in
      // AuthGatedProviders until the purchase celebration is dismissed via
      // GET STARTED, or until the poll below gives up.
      markCheckoutConfirming();
      setAwaitingConfirmation(true);
    } else {
      // Cancelled, or returning from the billing portal — no purchase
      // happened and no celebration is coming, so nothing should keep the
      // tour blocked. A cancelled Drop In/Pilates checkout never had a
      // local pending-booking record to clean up as of migration_023 — the
      // booking itself is only ever created server-side, by the webhook,
      // after Stripe actually confirms payment.
      clearCheckoutRedirectPending();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ticks a refetch while awaiting — re-checks the subscription row (for
  // online plans and in-person Monthly Unlimited) AND, if this checkout's
  // session id is known, whether its one-time purchase has been confirmed
  // (10 Class Pack or Drop In) — for up to ~12 seconds. Exactly one of the
  // two will ever actually resolve, depending on what was purchased.
  useEffect(() => {
    if (!awaitingConfirmation) return;
    let attempts = 0;
    let cancelled = false;
    const interval = setInterval(() => {
      attempts += 1;
      if (attempts > MAX_POLL_ATTEMPTS) {
        clearInterval(interval);
        // The checkout genuinely succeeded from Stripe's side even if our
        // own database sync hasn't caught up yet — leave the member on the
        // Memberships screen with no celebration rather than a scary error;
        // their real status shows correctly the next time this data loads.
        // No celebration is coming this session, so the tour is no longer
        // blocked on it.
        clearCheckoutRedirectPending();
        setAwaitingConfirmation(false);
        return;
      }
      subscription.refetch();
      const sessionId = sessionIdRef.current;
      if (sessionId) {
        supabase
          .from('in_person_purchases')
          .select('plan')
          .eq('id', sessionId)
          .maybeSingle()
          .then(({ data }) => {
            if (cancelled) return;
            if (data?.plan === 'ten_pack' || data?.plan === 'drop_in' || data?.plan === 'pilates_guest') {
              setOneTimePurchase({ plan: data.plan });
            }
          });
      }
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingConfirmation]);

  // Reacts the moment the real SUBSCRIPTION state confirms — online
  // monthly/annual/founding, or in-person Monthly Unlimited. Deliberately
  // does NOT clear the checkout-redirect-pending flag here — the purchase
  // celebration (confetti + welcome modal) is about to render via
  // justPurchased below, and the tour must stay blocked through that whole
  // span. PurchaseCelebrationOverlay clears the flag itself, right before
  // its own explicit tour.start() call once GET STARTED is tapped.
  useEffect(() => {
    if (!awaitingConfirmation || subscription.loading) return;
    const confirmed = subscription.status === 'trialing' || subscription.status === 'active';
    if (!confirmed) return;
    membership.notifyCheckoutSuccess();
    if (subscription.plan === 'founding') {
      badges.grantFoundingFifty(displayName);
      founding50.refetch();
    }
    setAwaitingConfirmation(false);
  }, [awaitingConfirmation, subscription.loading, subscription.status, subscription.plan, membership, badges, founding50, displayName]);

  // Reacts the moment a ONE-TIME in-person purchase confirms. 10 Class Pack
  // just needs the real credits re-fetched (the webhook already granted
  // them); Drop In and Downbeach Pilates both need the real booking
  // re-fetched too — as of migration_023, the webhook itself already
  // created that booking (payment_method 'drop_in_paid'/'pilates_paid')
  // the instant Stripe confirmed payment, "never by trusting the browser
  // returning from Stripe" — this just pulls the now-real state down.
  useEffect(() => {
    if (!awaitingConfirmation || !oneTimePurchase) return;
    if (oneTimePurchase.plan === 'ten_pack') {
      classPack.refetch();
    } else {
      classBooking.refetch();
    }
    membership.notifyCheckoutSuccess();
    setAwaitingConfirmation(false);
    setOneTimePurchase(null);
  }, [awaitingConfirmation, oneTimePurchase, classPack, classBooking, membership]);
}
