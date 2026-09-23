import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useBadges } from '../context/BadgeContext';
import { useFoundingFifty } from '../context/FoundingFiftyContext';
import { useMembership } from '../context/MembershipContext';
import { useDisplayName } from '../context/ProfileContext';
import { useSubscription } from '../context/SubscriptionContext';

const POLL_INTERVAL_MS = 1500;
const MAX_POLL_ATTEMPTS = 8;

// After Stripe Checkout (or the billing portal) redirects back to this app
// (?checkout=success|cancel|return in the URL), reopen the Memberships
// screen so the member isn't just dropped on whatever tab they happened to
// be on — "Cancel returns them to the memberships screen unchanged" per the
// round's brief, and success/return do the same. On success specifically,
// poll the real subscription row for a few seconds until the stripe-webhook
// has actually landed, then fire the purchase celebration exactly once —
// never optimistically before that's confirmed, since the webhook and the
// browser redirect race each other independently.
export function useCheckoutRedirect(onOpenMemberships: () => void) {
  const membership = useMembership();
  const subscription = useSubscription();
  const founding50 = useFoundingFifty();
  const badges = useBadges();
  const displayName = useDisplayName();
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  // Reads the URL exactly once, right after mount.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    if (!checkout) return;

    // Strip the query string immediately so a later refresh doesn't replay
    // this (especially re-firing the celebration).
    window.history.replaceState({}, '', window.location.pathname + window.location.hash);
    onOpenMemberships();
    if (checkout === 'success') {
      setAwaitingConfirmation(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ticks a refetch while awaiting — intentionally not watching
  // subscription's own fields here (that's the effect below); this one just
  // keeps asking the database again for up to ~12 seconds.
  useEffect(() => {
    if (!awaitingConfirmation) return;
    let attempts = 0;
    const interval = setInterval(() => {
      attempts += 1;
      if (attempts > MAX_POLL_ATTEMPTS) {
        clearInterval(interval);
        // The checkout genuinely succeeded from Stripe's side even if our
        // own database sync hasn't caught up yet — leave the member on the
        // Memberships screen with no celebration rather than a scary error;
        // their real status shows correctly the next time this data loads.
        setAwaitingConfirmation(false);
        return;
      }
      subscription.refetch();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingConfirmation]);

  // Reacts the moment the real subscription state actually confirms.
  useEffect(() => {
    if (!awaitingConfirmation || subscription.loading) return;
    const confirmed = subscription.status === 'trialing' || subscription.status === 'active';
    if (!confirmed) return;
    membership.notifyOnlineCheckoutSuccess();
    if (subscription.plan === 'founding') {
      badges.grantFoundingFifty(displayName);
      founding50.refetch();
    }
    setAwaitingConfirmation(false);
  }, [awaitingConfirmation, subscription.loading, subscription.status, subscription.plan, membership, badges, founding50, displayName]);
}
