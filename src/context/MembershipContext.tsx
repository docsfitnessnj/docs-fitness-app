import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { useClassPack } from './ClassPackContext';
import { useSubscription } from './SubscriptionContext';
import { loadJSON, saveJSON } from '../lib/storage';
import { supabase } from '../lib/supabaseClient';

// Every state a person (or Doc) can be in. There is no anonymous/guest
// state — every account, whichever door it came through, has an email —
// so every one of these is either full access ("Crew") or not ("Dockside").
// - trial: 2-week free online trial, full access
// - online_paid: paying online member, full access
// - in_person_unlimited: Boathouse Monthly Unlimited — full app included
// - online_free: no active plan (trial lapsed, or came in through BOOK YOUR
//   CLASS and hasn't chosen one yet) — 2 of 5 kettlebell workouts a week, no COWS, no Deck
// - ten_pack: Boathouse 10 Class Pack — community + booking, workouts locked
// - drop_in: Boathouse Drop In — booking only, no community, workouts locked
// - admin: Doc's own account — full access + community moderation
//
// STACKING: `tier` names exactly one of the states above — whichever one
// wins (online/in-person-unlimited beats a lone pack, which beats no plan
// at all). It deliberately does NOT by itself tell you whether an account
// also holds a 10 Class Pack on top of that — a class pack (or a drop-in)
// is always an ADDITION, never a competing plan, so an online_paid member
// can hold an active pack at the same time `tier` reads 'online_paid', not
// 'ten_pack'. `tier` only ever reports 'ten_pack' for an account with no
// other plan standing in front of it. Anything that needs to know "does
// this account have a pack right now, regardless of what else they have"
// must read `hasActivePack` below, never compare `tier` to 'ten_pack'.
export type MembershipTier =
  | 'trial'
  | 'online_paid'
  | 'founding_50'
  | 'in_person_unlimited'
  | 'online_free'
  | 'ten_pack'
  | 'drop_in'
  | 'admin';

export type InPersonPlan = 'monthly_unlimited' | 'ten_pack' | 'drop_in';

const TRIAL_WARNING_THRESHOLD_DAYS = 3;
// Admin dev-preview only, from here on — real 10 Class Pack credits come
// from ClassPackContext (the real class_packs table). See setDevTier.
const TEN_PACK_SIZE = 10;
const RENEWAL_CYCLE_DAYS = 30;

// Human-readable plan label for the admin roster / booking notifications —
// keeps that copy in one place instead of re-deriving it at each call site.
export function planLabel(tier: MembershipTier): string {
  switch (tier) {
    case 'admin':
      return 'Admin';
    case 'trial':
      return 'Online Trial';
    case 'online_paid':
      return 'Online Member';
    case 'founding_50':
      return 'The Founding 50';
    case 'online_free':
      return 'Online (Free)';
    case 'in_person_unlimited':
      return 'Monthly Unlimited';
    case 'ten_pack':
      return '10 Class Pack';
    case 'drop_in':
      return 'Drop In';
    default:
      return tier;
  }
}

function deriveDisplayName(email: string | null): string {
  if (!email) return 'Member';
  const local = email.split('@')[0].replace(/[._-]+/g, ' ').trim();
  if (!local) return 'Member';
  return local
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

type WodAccessLevel = 'full' | 'partial' | 'none';

type MembershipContextValue = {
  tier: MembershipTier;
  signedUp: boolean;
  // True until both real-account reads this context depends on have
  // resolved at least once: the subscription row (online tier/status) and
  // the real admin flag fetched below. `tier` and `isAdmin` both already
  // fall back to safe-but-possibly-wrong defaults while this is true (see
  // the branches below) — callers that render anything plan-dependent
  // should wait for this to clear rather than trust those defaults. See
  // ResponsiveShell in App.tsx, which is where that's actually enforced.
  stateLoading: boolean;
  // True only while a background refetch (subscription or admin-flag,
  // AFTER each has already loaded once) is in flight — `tier`/`isAdmin`
  // keep reporting their last known good values throughout, never a
  // default. Purely informational; nothing should fail closed on this.
  // Anything that fires a one-time, non-retracting effect off member state
  // (the upgrade nudge, the tour gate) must treat this exactly like
  // stateLoading: don't evaluate while either is true.
  stateRefetching: boolean;
  // Non-null when the subscription fetch OR the admin-flag fetch failed —
  // set alongside stateLoading clearing, never silently swallowed. See
  // ResponsiveShell: this must be checked BEFORE stateLoading, since a
  // failed fetch also makes loading go false. Scoped to each read's FIRST
  // attempt only — a refetch that fails after an earlier success keeps the
  // last known good tier/isAdmin and does not populate this, so it can
  // never re-trigger the fail-closed retry screen mid-session.
  stateError: string | null;
  // Re-runs whichever of subscription/admin-flag actually failed. Also
  // triggers subscription's own refetch even if only the admin flag error'd
  // — harmless (idempotent read), and simpler than tracking which one(s).
  retryState: () => void;
  email: string | null;
  displayName: string;
  trialEndsAt: Date | null;
  daysLeftInTrial: number | null;
  trialWarningDismissed: boolean;
  // True the moment this account has ever been on a trial or a paid online
  // plan — what lets the status banner tell "never trained here, first
  // class is free" apart from "was on trial, it lapsed." Distinct from
  // tier === 'trial', which is only true *during* an active trial.
  hasEverTrialed: boolean;

  isAdmin: boolean;
  // Full access to Doc's WODs, COWS, The Deck, and Community.
  fullContentAccess: boolean;
  wodAccessLevel: WodAccessLevel;
  cowsAccess: boolean;
  deckAccess: boolean;
  // Doc's Daily Story — paid feature: trial, online paid, Monthly Unlimited
  // (and admin). Free-tier still sees the story ring, just locked.
  storiesAccess: boolean;
  communityAccess: 'full' | 'none';
  // Class booking is available to every tier — kept as an explicit flag
  // (rather than assumed) so call sites read intent, not "true" literals.
  bookingAccess: boolean;
  // True whenever this account has a real, unexpired 10 Class Pack with
  // credit left — independent of `tier`. A class pack is an ADDITION on
  // top of whatever plan (or no plan) the account already has, never a
  // replacement for it, so this can be true at the same time as `tier`
  // is 'online_paid', 'founding_50', 'trial', or 'in_person_unlimited' —
  // `tier` only ever reports 'ten_pack' itself for an account with NO
  // other plan standing in front of it. Anything that shows or spends
  // pack credits must check this, never `tier === 'ten_pack'` alone, or
  // it silently stops working the moment the same account also buys (or
  // already has) an online plan.
  hasActivePack: boolean;
  // Meaningful whenever hasActivePack is true (not just tier === 'ten_pack'
  // — see above). Null when there's no active pack.
  tenPackClassesRemaining: number | null;
  // The active pack's own expiry date — same "meaningful whenever
  // hasActivePack" rule as tenPackClassesRemaining above.
  tenPackExpiresAt: Date | null;
  // Whether this account has already redeemed its one free first class —
  // once true, every booking (for this tier) goes through the normal gates.
  firstClassUsed: boolean;
  // Opted in to The Weekly Kettlebell newsletter, captured at signup and
  // editable later in Settings. Keyed to `email` so a future backend round
  // can sync it straight to Doc's email platform.
  newsletterOptIn: boolean;
  // True right after a real paid purchase (online plan, Monthly Unlimited,
  // 10 Class Pack) — never set by the free trial or Drop In — so the app
  // shell can show the purchase celebration exactly once, then clear it.
  justPurchased: boolean;
  // Only meaningful for the recurring-billing tiers — null for
  // one-off/non-recurring tiers. Online tiers show Stripe's real renewal
  // date; in_person_unlimited (still simulated) shows the simulated one.
  planRenewsAt: Date | null;
  // Online tiers: Stripe's real cancel-at-period-end flag. In-person: set by
  // requestCancellation, shown in Settings — access continues through
  // planRenewsAt/trialEndsAt either way.
  cancellationRequested: boolean;

  // The About page's BOOK YOUR CLASS door, and in-person onboarding's own
  // DROP IN choice — real account signup landing on the free tier: booking
  // access, first-class-free, full (non-anonymous) community. TRAIN
  // ONLINE's door, and in-person onboarding's Monthly Unlimited / 10 Class
  // Pack choices, all go through real Stripe Checkout instead (see
  // startOnlineCheckout / startInPersonCheckout) — there's no simulated
  // trial or in-person plan-switch door anymore for a real member.
  enterFreeTier: () => void;
  // Called once a real Stripe Checkout redirect-back has been confirmed —
  // the subscription row shows trialing/active (online, or in-person
  // Monthly Unlimited), or a one-time purchase (10 Class Pack, Drop In) is
  // confirmed via in_person_purchases. Fires the purchase celebration and
  // clears any leftover in-person cancellation flag.
  notifyCheckoutSuccess: () => void;
  setDevTier: (tier: MembershipTier) => void;
  // Dev-preview-only: forces the "first time visitor" Dockside variant —
  // online_free with no trial history — regardless of what was previewed
  // before. See hasEverTrialed above.
  previewFirstTimeVisitor: () => void;
  dismissTrialWarning: () => void;
  useTenPackClass: () => void;
  refundTenPackClass: () => void;
  useFirstClass: () => void;
  setNewsletterOptIn: (optIn: boolean) => void;
  clearJustPurchased: () => void;
  // In-person only now (see SettingsScreen) — online cancellation goes
  // through the real Stripe customer portal instead.
  requestCancellation: () => void;
  keepMembership: () => void;
  signOut: () => void;
};

const MembershipContext = createContext<MembershipContextValue | undefined>(undefined);

const SIMULATED_STORAGE_KEY = 'docsfitness.simulatedMembership.v1';

// Doc's own admin/dev-preview tier (setDevTier, below `isAdminPreview`) is
// still exactly the simulated system this app has always used — she can
// preview any of the 6 member-facing tiers, in-person included, without
// that touching real billing. For every other (non-admin) account, as of
// Stripe round two, Monthly Unlimited and 10 Class Pack are both real —
// see the subscriptions/class_packs tables and SubscriptionContext/
// ClassPackContext — and Drop In is a real one-time payment started from
// the booking flow itself, never a persistent tier at all. This state is
// still persisted per *device*, not per account, since it only ever
// matters for Doc's own dev-preview now.
type SimulatedMembershipState = {
  tier: MembershipTier;
  trialEndsAtMs: number | null;
  trialWarningDismissed: boolean;
  tenPackClassesRemaining: number | null;
  firstClassUsed: boolean;
  newsletterOptIn: boolean;
  justPurchased: boolean;
  planStartedAt: number | null;
  cancellationRequested: boolean;
  hasEverTrialed: boolean;
};

const DEFAULT_SIMULATED_STATE: SimulatedMembershipState = {
  tier: 'trial',
  trialEndsAtMs: null,
  trialWarningDismissed: false,
  tenPackClassesRemaining: null,
  firstClassUsed: false,
  newsletterOptIn: true,
  justPurchased: false,
  planStartedAt: null,
  cancellationRequested: false,
  hasEverTrialed: false,
};

export function MembershipProvider({ children }: { children: React.ReactNode }) {
  const { session, user, signOut: authSignOut } = useAuth();
  const signedUp = !!session;
  const email = session?.user?.email ?? null;
  const subscription = useSubscription();
  const classPack = useClassPack();

  // A small, deliberately separate read of just the real admin flag — kept
  // local to this context rather than depending on ProfileContext, since
  // ProfileContext's own useDisplayName() already depends on
  // MembershipContext (a provider can't depend on a context nested inside
  // it). Only used to decide whether to trust the dev-preview simulated
  // tier for the online branch below; every actual access decision is
  // still enforced server-side by Row Level Security regardless of what
  // this flag shows.
  const [realAdmin, setRealAdmin] = useState(false);
  const [realAdminLoading, setRealAdminLoading] = useState(true);
  // True only while a background refetch of the admin flag (AFTER it has
  // already loaded once) is in flight — see SubscriptionContext's identical
  // `refetching` for the same reasoning.
  const [realAdminRefetching, setRealAdminRefetching] = useState(false);
  // Non-null only when the INITIAL fetch failed — previously this discarded
  // `error` entirely (`.then(({ data }) => ...)`), so a real failure against
  // production Supabase read as "loaded, not admin" instead of "failed to
  // load," silently defaulting to false rather than surfacing anything. A
  // refetch that errors after a successful earlier load keeps `realAdmin`
  // at its last known value and does not populate this — see below.
  const [realAdminError, setRealAdminError] = useState<string | null>(null);
  const [realAdminRetryTick, setRealAdminRetryTick] = useState(0);
  // Same first-load-vs-refetch distinction as SubscriptionContext's
  // `hasLoadedOnce` — this effect re-runs on every `user` object identity
  // change, which includes Supabase's own periodic TOKEN_REFRESHED auth
  // event (fired on tab refocus and similar), not just a real sign-in. Before
  // this round, EVERY one of those re-runs unconditionally set
  // realAdminLoading(true) again, exactly the bug this round's escalation
  // diagnosed in SubscriptionContext.
  const realAdminHasLoadedOnce = useRef(false);
  // The id of whichever account this fetch last loaded (or attempted to
  // load) for — null while signed out. See SubscriptionContext's identical
  // `lastUserId` for why this (not `user` object identity alone) is what
  // decides a genuine identity change, distinct from the same account's
  // token simply refreshing.
  const lastAdminFlagUserId = useRef<string | null>(null);
  useEffect(() => {
    const currentUserId = user?.id ?? null;
    if (currentUserId !== lastAdminFlagUserId.current) {
      // Sign-out, sign-in, or switching accounts outright — see
      // SubscriptionContext's identical block for the full reasoning.
      // `realAdminLoading` goes to `true` here, not `false`, even on
      // sign-out — otherwise the render right after the NEXT sign-in,
      // before THIS effect has re-run, would read "signed in, settled,
      // not admin" as if that were the real, loaded answer.
      lastAdminFlagUserId.current = currentUserId;
      realAdminHasLoadedOnce.current = false;
      setRealAdmin(false);
      setRealAdminError(null);
      setRealAdminRefetching(false);
      setRealAdminLoading(true);
    }
    if (!user) return;
    let cancelled = false;
    const isRefetch = realAdminHasLoadedOnce.current;
    if (isRefetch) {
      setRealAdminRefetching(true);
      console.log('[memberState:adminFlag] refetch start', { userId: user.id, heldIsAdmin: realAdmin });
    } else {
      setRealAdminLoading(true);
      console.log('[memberState:adminFlag] fetch start', { userId: user.id });
    }
    supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data, error: fetchError }) => {
        if (cancelled) return;
        if (fetchError) {
          if (isRefetch) {
            console.error('[memberState:adminFlag] refetch error — keeping last known good state', fetchError, {
              heldIsAdmin: realAdmin,
            });
            setRealAdminRefetching(false);
            return;
          }
          console.error('[memberState:adminFlag] fetch error', fetchError);
          setRealAdminError(fetchError.message);
          setRealAdminLoading(false);
          return;
        }
        if (isRefetch) {
          console.log('[memberState:adminFlag] refetch success', { isAdmin: data?.is_admin ?? false });
        } else {
          console.log('[memberState:adminFlag] fetch success', { isAdmin: data?.is_admin ?? false });
        }
        setRealAdminError(null);
        setRealAdmin(data?.is_admin ?? false);
        realAdminHasLoadedOnce.current = true;
        if (isRefetch) {
          setRealAdminRefetching(false);
        } else {
          setRealAdminLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, realAdminRetryTick]);

  const [simulated, setSimulated] = useState<SimulatedMembershipState>(() =>
    loadJSON(SIMULATED_STORAGE_KEY, DEFAULT_SIMULATED_STATE)
  );
  const {
    tier: simulatedTier,
    trialEndsAtMs,
    trialWarningDismissed,
    tenPackClassesRemaining,
    firstClassUsed,
    newsletterOptIn,
    justPurchased,
    planStartedAt,
    cancellationRequested: simulatedCancellationRequested,
    hasEverTrialed: simulatedHasEverTrialed,
  } = simulated;

  useEffect(() => {
    saveJSON(SIMULATED_STORAGE_KEY, simulated);
  }, [simulated]);

  const value = useMemo<MembershipContextValue>(() => {
    // Real admin: fully unchanged, exactly today's simulated system — the
    // dev-preview toggle keeps working for Doc's testing regardless of
    // what's really in the subscriptions/class_packs tables for her own
    // account. Every other account's tier is computed entirely from real
    // server data from here on — the subscriptions table (online plans AND
    // in-person Monthly Unlimited, both real Stripe subscriptions) and
    // ClassPackContext (10 Class Pack's real credits).
    const isAdminPreview = realAdmin;

    let tier: MembershipTier;
    let hasEverTrialed: boolean;
    if (isAdminPreview) {
      tier = simulatedTier;
      hasEverTrialed = simulatedHasEverTrialed;
    } else if (subscription.loading || classPack.loading) {
      // Safe default while the real reads are in flight — the safe
      // direction to be wrong in for a moment is "no access yet," not the
      // reverse.
      tier = 'online_free';
      hasEverTrialed = simulatedHasEverTrialed;
    } else if (subscription.status === 'trialing') {
      tier = 'trial';
      hasEverTrialed = true;
    } else if (subscription.status === 'active' && subscription.plan === 'founding') {
      tier = 'founding_50';
      hasEverTrialed = true;
    } else if (subscription.status === 'active' && subscription.plan === 'in_person_monthly') {
      tier = 'in_person_unlimited';
      hasEverTrialed = true;
    } else if (subscription.status === 'active') {
      tier = 'online_paid';
      hasEverTrialed = true;
    } else if (classPack.active) {
      // An expired or fully-spent pack never lands here — ClassPackContext
      // only reports `active` for a pack that still has both credit and
      // time left, so a lapsed pack falls straight through to online_free
      // below, which is exactly what sends a booking through the drop-in
      // gate instead.
      tier = 'ten_pack';
      hasEverTrialed = simulatedHasEverTrialed || subscription.status !== null;
    } else {
      // past_due / canceled / incomplete / incomplete_expired / unpaid /
      // no row at all, and no active class pack — no real active access.
      tier = 'online_free';
      hasEverTrialed = simulatedHasEverTrialed || subscription.status !== null;
    }

    const trialEndsAt = isAdminPreview
      ? trialEndsAtMs
        ? new Date(trialEndsAtMs)
        : null
      : tier === 'trial'
        ? subscription.trialEnd
        : null;
    const daysLeftInTrial = trialEndsAt
      ? Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : null;

    const planRenewsAt = isAdminPreview
      ? ['online_paid', 'founding_50', 'in_person_unlimited'].includes(tier) && planStartedAt
        ? new Date(planStartedAt + RENEWAL_CYCLE_DAYS * 24 * 60 * 60 * 1000)
        : null
      : tier === 'online_paid' || tier === 'founding_50' || tier === 'in_person_unlimited'
        ? subscription.currentPeriodEnd
        : null;

    const cancellationRequested =
      !isAdminPreview &&
      (tier === 'online_paid' || tier === 'founding_50' || tier === 'trial' || tier === 'in_person_unlimited')
        ? subscription.cancelAtPeriodEnd
        : simulatedCancellationRequested;

    const fullContentAccess =
      tier === 'admin' ||
      tier === 'trial' ||
      tier === 'online_paid' ||
      tier === 'founding_50' ||
      tier === 'in_person_unlimited';
    const wodAccessLevel: WodAccessLevel = fullContentAccess ? 'full' : tier === 'online_free' ? 'partial' : 'none';
    // Every tier gets full community access now — including Drop In, which
    // used to read 'none' back when it was a persistent simulated tier. A
    // real Drop In purchase gets the exact same access as a 10 Class Pack
    // (community + booking, no full content unlock); 'drop_in' is only
    // ever the account's actual `tier` during Doc's own dev-preview now.
    const communityAccess: 'full' | 'none' = 'full';

    const computedStateLoading = subscription.loading || classPack.loading || realAdminLoading;
    const computedStateRefetching = subscription.refetching || classPack.refetching || realAdminRefetching;
    const computedStateError = subscription.error ?? classPack.error ?? realAdminError ?? null;
    if (signedUp) {
      console.log('[memberState:membership] tier computed', {
        tier,
        stateLoading: computedStateLoading,
        stateRefetching: computedStateRefetching,
        stateError: computedStateError,
        subscriptionLoading: subscription.loading,
        subscriptionRefetching: subscription.refetching,
        subscriptionError: subscription.error,
        realAdminLoading,
        realAdminRefetching,
        realAdminError,
      });
    }

    return {
      tier,
      signedUp,
      // Same "safe direction to be wrong in" convention as subscription's
      // own `loading` — while true, `tier` may still be the 'online_free'
      // fallback and `isAdmin` may still be false regardless of the real
      // account. isAdminPreview (admin dev-preview) doesn't depend on any
      // of these reads, but this doesn't special-case it — one simple rule
      // for every account is safer than a second one to keep in sync.
      stateLoading: computedStateLoading,
      stateRefetching: computedStateRefetching,
      stateError: computedStateError,
      retryState: () => {
        subscription.retry();
        classPack.retry();
        setRealAdminRetryTick((t) => t + 1);
      },
      email,
      displayName: deriveDisplayName(email),
      trialEndsAt,
      daysLeftInTrial,
      trialWarningDismissed,
      hasEverTrialed,

      isAdmin: tier === 'admin',
      fullContentAccess,
      wodAccessLevel,
      cowsAccess: fullContentAccess,
      deckAccess: fullContentAccess,
      storiesAccess: fullContentAccess,
      communityAccess,
      bookingAccess: true,
      // Admin dev-preview has no real pack to check — it previews whichever
      // single tier is selected, so "has an active pack" there just means
      // "currently previewing the ten_pack tier." Every real account reads
      // this straight from ClassPackContext, regardless of `tier`.
      hasActivePack: isAdminPreview ? simulatedTier === 'ten_pack' : classPack.active,
      tenPackClassesRemaining: isAdminPreview ? tenPackClassesRemaining : classPack.creditsRemaining,
      tenPackExpiresAt: isAdminPreview ? null : classPack.expiresAt,
      firstClassUsed,
      newsletterOptIn,
      justPurchased,
      planRenewsAt,
      cancellationRequested,

      enterFreeTier: () => {
        setSimulated((prev) => ({ ...prev, tier: 'online_free' }));
      },
      notifyCheckoutSuccess: () => {
        setSimulated((prev) => ({ ...prev, justPurchased: true, cancellationRequested: false }));
      },
      setDevTier: (nextTier: MembershipTier) => {
        setSimulated((prev) => ({
          ...prev,
          tier: nextTier,
          trialEndsAtMs: nextTier === 'trial' && !prev.trialEndsAtMs
            ? (() => {
                const endsAt = new Date();
                endsAt.setDate(endsAt.getDate() + 14);
                return endsAt.getTime();
              })()
            : prev.trialEndsAtMs,
          // Always a fresh, round demo count — this is the preview path,
          // not a real purchase, so there's no reason to leave it wherever
          // a previous preview session happened to decrement it to.
          tenPackClassesRemaining: nextTier === 'ten_pack' ? TEN_PACK_SIZE : prev.tenPackClassesRemaining,
          planStartedAt:
            ['online_paid', 'founding_50', 'in_person_unlimited'].includes(nextTier) && prev.planStartedAt === null
              ? Date.now()
              : prev.planStartedAt,
          // Previewing one of the named Dockside tiers should reliably show
          // that tier's own banner variant, not the first-time-visitor one —
          // only the dedicated previewFirstTimeVisitor() below should ever
          // show that state.
          hasEverTrialed:
            nextTier === 'online_free' || nextTier === 'ten_pack' || nextTier === 'drop_in' ? true : prev.hasEverTrialed,
        }));
      },
      previewFirstTimeVisitor: () => {
        setSimulated((prev) => ({ ...prev, tier: 'online_free', hasEverTrialed: false }));
      },
      dismissTrialWarning: () => setSimulated((prev) => ({ ...prev, trialWarningDismissed: true })),
      useTenPackClass: () => {
        if (isAdminPreview) {
          setSimulated((prev) => ({
            ...prev,
            tenPackClassesRemaining: Math.max(0, (prev.tenPackClassesRemaining ?? TEN_PACK_SIZE) - 1),
          }));
          return;
        }
        classPack.useCredit();
      },
      refundTenPackClass: () => {
        if (isAdminPreview) {
          setSimulated((prev) => ({
            ...prev,
            tenPackClassesRemaining: Math.min(TEN_PACK_SIZE, (prev.tenPackClassesRemaining ?? 0) + 1),
          }));
          return;
        }
        classPack.refundCredit();
      },
      useFirstClass: () => setSimulated((prev) => ({ ...prev, firstClassUsed: true })),
      setNewsletterOptIn: (optIn: boolean) => setSimulated((prev) => ({ ...prev, newsletterOptIn: optIn })),
      clearJustPurchased: () => setSimulated((prev) => ({ ...prev, justPurchased: false })),
      requestCancellation: () => setSimulated((prev) => ({ ...prev, cancellationRequested: true })),
      keepMembership: () => setSimulated((prev) => ({ ...prev, cancellationRequested: false })),
      signOut: () => {
        authSignOut();
        setSimulated(DEFAULT_SIMULATED_STATE);
      },
    };
  }, [
    realAdmin,
    realAdminLoading,
    realAdminRefetching,
    realAdminError,
    simulatedTier,
    subscription.loading,
    subscription.refetching,
    subscription.error,
    subscription.status,
    subscription.plan,
    subscription.trialEnd,
    subscription.currentPeriodEnd,
    subscription.cancelAtPeriodEnd,
    subscription.retry,
    classPack.loading,
    classPack.refetching,
    classPack.error,
    classPack.active,
    classPack.creditsRemaining,
    classPack.expiresAt,
    classPack.retry,
    classPack.useCredit,
    classPack.refundCredit,
    planStartedAt,
    signedUp,
    email,
    trialEndsAtMs,
    trialWarningDismissed,
    tenPackClassesRemaining,
    firstClassUsed,
    newsletterOptIn,
    justPurchased,
    simulatedHasEverTrialed,
    simulatedCancellationRequested,
    authSignOut,
  ]);

  return <MembershipContext.Provider value={value}>{children}</MembershipContext.Provider>;
}

export function useMembership() {
  const ctx = useContext(MembershipContext);
  if (!ctx) {
    throw new Error('useMembership must be used within a MembershipProvider');
  }
  return ctx;
}

export const TRIAL_WARNING_THRESHOLD = TRIAL_WARNING_THRESHOLD_DAYS;
