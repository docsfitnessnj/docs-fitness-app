import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
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
const TEN_PACK_SIZE = 10;
const RENEWAL_CYCLE_DAYS = 30;
const IN_PERSON_TIERS: MembershipTier[] = ['ten_pack', 'drop_in', 'in_person_unlimited'];

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
  // Only meaningful for tier === 'ten_pack'; null otherwise.
  tenPackClassesRemaining: number | null;
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

  selectInPersonPlan: (plan: InPersonPlan) => void;
  // The About page's BOOK YOUR CLASS door — real account signup landing on
  // the free tier: booking access, first-class-free, full (non-anonymous)
  // community. TRAIN ONLINE's door goes through real Stripe Checkout
  // instead (see startOnlineCheckout) — there's no simulated trial door
  // anymore.
  enterFreeTier: () => void;
  // Called once a real Stripe Checkout redirect-back has been confirmed
  // (the subscription row shows trialing/active) — fires the purchase
  // celebration and clears any leftover in-person cancellation flag.
  notifyOnlineCheckoutSuccess: () => void;
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

// In-person plans (Monthly Unlimited, 10 Class Pack, Drop In) and Doc's own
// admin/dev-preview tier are still exactly the simulated system this app
// has always used — this round only wires real billing for the ONLINE
// tiers. It's persisted so a signed-in member's simulated (in-person/
// preview) plan survives a reload, same as their real Supabase session.
// Since there's no real in-person billing backend, this stays one shared
// simulated state per *device*, not per account, for the in-person branch —
// unchanged from before this round.
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

  // A small, deliberately separate read of just the real admin flag — kept
  // local to this context rather than depending on ProfileContext, since
  // ProfileContext's own useDisplayName() already depends on
  // MembershipContext (a provider can't depend on a context nested inside
  // it). Only used to decide whether to trust the dev-preview simulated
  // tier for the online branch below; every actual access decision is
  // still enforced server-side by Row Level Security regardless of what
  // this flag shows.
  const [realAdmin, setRealAdmin] = useState(false);
  useEffect(() => {
    if (!user) {
      setRealAdmin(false);
      return;
    }
    let cancelled = false;
    supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setRealAdmin(data?.is_admin ?? false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

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
    // what's really in the subscriptions table for her own account.
    // Non-admin, currently on an in-person plan (still simulated, untouched
    // by this round): keep that as-is too. Otherwise (a real member's
    // online branch): the subscriptions table is the only truth.
    const isAdminPreview = realAdmin;
    const onInPersonPlan = IN_PERSON_TIERS.includes(simulatedTier);

    let tier: MembershipTier;
    let hasEverTrialed: boolean;
    if (isAdminPreview || onInPersonPlan) {
      tier = simulatedTier;
      hasEverTrialed = simulatedHasEverTrialed;
    } else if (subscription.loading) {
      // Safe default while the real read is in flight — the safe direction
      // to be wrong in for a moment is "no access yet," not the reverse.
      tier = 'online_free';
      hasEverTrialed = simulatedHasEverTrialed;
    } else if (subscription.status === 'trialing') {
      tier = 'trial';
      hasEverTrialed = true;
    } else if (subscription.status === 'active' && subscription.plan === 'founding') {
      tier = 'founding_50';
      hasEverTrialed = true;
    } else if (subscription.status === 'active') {
      tier = 'online_paid';
      hasEverTrialed = true;
    } else {
      // past_due / canceled / incomplete / incomplete_expired / unpaid /
      // no row at all — no real active access.
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
      : tier === 'online_paid' || tier === 'founding_50'
        ? subscription.currentPeriodEnd
        : tier === 'in_person_unlimited' && planStartedAt
          ? new Date(planStartedAt + RENEWAL_CYCLE_DAYS * 24 * 60 * 60 * 1000)
          : null;

    const cancellationRequested =
      !isAdminPreview && (tier === 'online_paid' || tier === 'founding_50' || tier === 'trial')
        ? subscription.cancelAtPeriodEnd
        : simulatedCancellationRequested;

    const fullContentAccess =
      tier === 'admin' ||
      tier === 'trial' ||
      tier === 'online_paid' ||
      tier === 'founding_50' ||
      tier === 'in_person_unlimited';
    const wodAccessLevel: WodAccessLevel = fullContentAccess ? 'full' : tier === 'online_free' ? 'partial' : 'none';
    const communityAccess: 'full' | 'none' = tier === 'drop_in' ? 'none' : 'full';

    return {
      tier,
      signedUp,
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
      tenPackClassesRemaining,
      firstClassUsed,
      newsletterOptIn,
      justPurchased,
      planRenewsAt,
      cancellationRequested,

      selectInPersonPlan: (plan: InPersonPlan) => {
        const nextTier = plan === 'monthly_unlimited' ? 'in_person_unlimited' : plan === 'ten_pack' ? 'ten_pack' : 'drop_in';
        setSimulated((prev) => ({
          ...prev,
          tier: nextTier,
          tenPackClassesRemaining: plan === 'ten_pack' ? TEN_PACK_SIZE : prev.tenPackClassesRemaining,
          // Drop In is a one-off, not a membership — no celebration for it.
          justPurchased: plan !== 'drop_in' ? true : prev.justPurchased,
          planStartedAt: plan === 'monthly_unlimited' ? Date.now() : prev.planStartedAt,
          cancellationRequested: false,
        }));
        // Still simulated (no real in-person billing) — but mirrored to the
        // member's own profile row so it's visible beyond just this device,
        // for Member Manager's plan grouping. Best-effort: this selection
        // already lives in local storage as the real source of truth for
        // this device's own access, so a failed mirror write here doesn't
        // block anything the member can do.
        if (user) {
          supabase.from('profiles').update({ in_person_plan: plan }).eq('id', user.id).then(() => {});
        }
      },
      enterFreeTier: () => {
        setSimulated((prev) => ({ ...prev, tier: 'online_free' }));
      },
      notifyOnlineCheckoutSuccess: () => {
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
      useTenPackClass: () =>
        setSimulated((prev) => ({ ...prev, tenPackClassesRemaining: Math.max(0, (prev.tenPackClassesRemaining ?? TEN_PACK_SIZE) - 1) })),
      refundTenPackClass: () =>
        setSimulated((prev) => ({ ...prev, tenPackClassesRemaining: Math.min(TEN_PACK_SIZE, (prev.tenPackClassesRemaining ?? 0) + 1) })),
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
    simulatedTier,
    subscription.loading,
    subscription.status,
    subscription.plan,
    subscription.trialEnd,
    subscription.currentPeriodEnd,
    subscription.cancelAtPeriodEnd,
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
