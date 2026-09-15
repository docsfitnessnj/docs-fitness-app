import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { loadJSON, saveJSON } from '../lib/storage';

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

const TRIAL_LENGTH_DAYS = 14;
const TRIAL_WARNING_THRESHOLD_DAYS = 3;
const TEN_PACK_SIZE = 10;

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
  // True the moment startTrial() is ever called for this account, and never
  // reset back to false (short of a full signOut) — this is what lets the
  // status banner tell "never trained here, first class is free" apart from
  // "was on trial, it lapsed." Distinct from tier === 'trial', which is only
  // true *during* an active trial.
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
  // Only meaningful for the two recurring-billing tiers (online_paid,
  // in_person_unlimited) — null for one-off/non-recurring tiers.
  planRenewsAt: Date | null;
  // Set by requestCancellation, shown in Settings — access continues through
  // planRenewsAt/trialEndsAt even once flagged.
  cancellationRequested: boolean;

  // Sets the simulated tier for a member who just created a real account and
  // chose the online trial door. Identity itself (the account, the email)
  // is real now — AuthContext/Supabase own that — this just picks which
  // simulated plan they start on, same as every other tier transition here.
  startTrial: () => void;
  becomeMember: () => void;
  // Claims a Founding 50 spot — same full access as becomeMember's
  // online_paid, but at the locked-in rate, tracked as its own tier so a
  // later cancellation can't quietly resubscribe at the founding rate.
  becomeFoundingFifty: () => void;
  selectInPersonPlan: (plan: InPersonPlan) => void;
  // The About page's BOOK YOUR CLASS door — same real-account signup as
  // startTrial, just landing on the free tier instead: booking access,
  // first-class-free, full (non-anonymous) community.
  enterFreeTier: () => void;
  // A returning member who just signed back into their real account — full
  // online access, no trial dates, and (unlike becomeMember) no purchase
  // celebration since nothing was just bought.
  signIn: () => void;
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
  requestCancellation: () => void;
  keepMembership: () => void;
  signOut: () => void;
};

const RENEWAL_CYCLE_DAYS = 30;
const RECURRING_TIERS: MembershipTier[] = ['online_paid', 'founding_50', 'in_person_unlimited'];

const MembershipContext = createContext<MembershipContextValue | undefined>(undefined);

const SIMULATED_STORAGE_KEY = 'docsfitness.simulatedMembership.v1';

// Everything below is still exactly the simulated tier/access-matrix system
// this app has always used — no real billing this round. It's persisted so
// a signed-in member's simulated plan survives a reload the same way their
// real Supabase session now does (otherwise a returning member would stay
// logged in but land back on a reset "trial" tier every time, which is its
// own version of the "signed in every time" bug this round fixes). Since
// there's no real membership backend yet, this is one shared simulated
// state per *device*, not per account — a reasonable stand-in until a real
// billing/membership round replaces it.
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
  const { session, signOut: authSignOut } = useAuth();
  const signedUp = !!session;
  const email = session?.user?.email ?? null;

  const [simulated, setSimulated] = useState<SimulatedMembershipState>(() =>
    loadJSON(SIMULATED_STORAGE_KEY, DEFAULT_SIMULATED_STATE)
  );
  const {
    tier,
    trialEndsAtMs,
    trialWarningDismissed,
    tenPackClassesRemaining,
    firstClassUsed,
    newsletterOptIn,
    justPurchased,
    planStartedAt,
    cancellationRequested,
    hasEverTrialed,
  } = simulated;
  const trialEndsAt = trialEndsAtMs ? new Date(trialEndsAtMs) : null;

  useEffect(() => {
    saveJSON(SIMULATED_STORAGE_KEY, simulated);
  }, [simulated]);

  const daysLeftInTrial = trialEndsAt
    ? Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  const value = useMemo<MembershipContextValue>(() => {
    const planRenewsAt =
      RECURRING_TIERS.includes(tier) && planStartedAt
        ? new Date(planStartedAt + RENEWAL_CYCLE_DAYS * 24 * 60 * 60 * 1000)
        : null;

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

      startTrial: () => {
        const endsAt = new Date();
        endsAt.setDate(endsAt.getDate() + TRIAL_LENGTH_DAYS);
        setSimulated((prev) => ({ ...prev, tier: 'trial', trialEndsAtMs: endsAt.getTime(), trialWarningDismissed: false, hasEverTrialed: true }));
      },
      becomeMember: () => {
        setSimulated((prev) => ({ ...prev, tier: 'online_paid', justPurchased: true, planStartedAt: Date.now(), cancellationRequested: false }));
      },
      becomeFoundingFifty: () => {
        setSimulated((prev) => ({ ...prev, tier: 'founding_50', justPurchased: true, planStartedAt: Date.now(), cancellationRequested: false }));
      },
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
      },
      enterFreeTier: () => {
        setSimulated((prev) => ({ ...prev, tier: 'online_free' }));
      },
      signIn: () => {
        setSimulated((prev) => ({ ...prev, tier: 'online_paid' }));
      },
      setDevTier: (nextTier: MembershipTier) => {
        setSimulated((prev) => ({
          ...prev,
          tier: nextTier,
          trialEndsAtMs: nextTier === 'trial' && !prev.trialEndsAtMs
            ? (() => {
                const endsAt = new Date();
                endsAt.setDate(endsAt.getDate() + TRIAL_LENGTH_DAYS);
                return endsAt.getTime();
              })()
            : prev.trialEndsAtMs,
          // Always a fresh, round demo count — this is the preview path,
          // not a real purchase, so there's no reason to leave it wherever
          // a previous preview session happened to decrement it to.
          tenPackClassesRemaining: nextTier === 'ten_pack' ? TEN_PACK_SIZE : prev.tenPackClassesRemaining,
          planStartedAt: RECURRING_TIERS.includes(nextTier) && prev.planStartedAt === null ? Date.now() : prev.planStartedAt,
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
  }, [tier, planStartedAt, cancellationRequested, signedUp, email, trialEndsAt, daysLeftInTrial, trialWarningDismissed, tenPackClassesRemaining, firstClassUsed, newsletterOptIn, justPurchased, hasEverTrialed, authSignOut]);

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
