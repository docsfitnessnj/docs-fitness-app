import React, { createContext, useContext, useMemo, useState } from 'react';

// Every state a person (or Doc) can be in:
// - trial: 2-week free online trial, full access
// - online_paid: paying online member, full access
// - in_person_unlimited: Boathouse Monthly Unlimited — full app included
// - online_free: online trial expired, no plan chosen — 2 of 5 weekly WODs, no COWS, no Deck
// - ten_pack: Boathouse 10 Class Pack — community + booking, workouts locked
// - drop_in: Boathouse Drop In — booking only, no community, workouts locked
// - guest: browsing without an account — read-only community + booking, workouts locked
// - admin: Doc's own account — full access + community moderation
// The dev preview toggle only cycles the five states named in the product brief
// (admin / online_paid / in_person_unlimited / online_free / guest); ten_pack and
// drop_in are real outcomes of the In-Person Plans screen but aren't previewable there
// since their capabilities are identical to guest's.
export type MembershipTier =
  | 'trial'
  | 'online_paid'
  | 'in_person_unlimited'
  | 'online_free'
  | 'ten_pack'
  | 'drop_in'
  | 'guest'
  | 'admin';

export type InPersonPlan = 'monthly_unlimited' | 'ten_pack' | 'drop_in';

export const DEV_PREVIEW_TIERS: MembershipTier[] = [
  'admin',
  'online_paid',
  'in_person_unlimited',
  'ten_pack',
  'online_free',
  'guest',
];

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
    case 'online_free':
      return 'Online (Free)';
    case 'in_person_unlimited':
      return 'Monthly Unlimited';
    case 'ten_pack':
      return '10 Class Pack';
    case 'drop_in':
      return 'Drop In';
    case 'guest':
      return 'Guest';
    default:
      return tier;
  }
}

function deriveDisplayName(email: string | null): string {
  if (!email) return 'Guest';
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

  isAdmin: boolean;
  // Full access to Doc's WODs, COWS, The Deck, and Community.
  fullContentAccess: boolean;
  wodAccessLevel: WodAccessLevel;
  cowsAccess: boolean;
  deckAccess: boolean;
  communityAccess: 'full' | 'read_only' | 'none';
  // Class booking is available to every tier, including guests — kept as an explicit
  // flag (rather than assumed) so call sites read intent, not "true" literals.
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

  startTrial: (email: string) => void;
  becomeMember: () => void;
  selectInPersonPlan: (plan: InPersonPlan) => void;
  becomeGuest: () => void;
  setDevTier: (tier: MembershipTier) => void;
  dismissTrialWarning: () => void;
  useTenPackClass: () => void;
  refundTenPackClass: () => void;
  useFirstClass: () => void;
  setNewsletterOptIn: (optIn: boolean) => void;
};

const MembershipContext = createContext<MembershipContextValue | undefined>(undefined);

export function MembershipProvider({ children }: { children: React.ReactNode }) {
  const [tier, setTier] = useState<MembershipTier>('trial');
  const [signedUp, setSignedUp] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [trialEndsAt, setTrialEndsAt] = useState<Date | null>(null);
  const [trialWarningDismissed, setTrialWarningDismissed] = useState(false);
  const [tenPackClassesRemaining, setTenPackClassesRemaining] = useState<number | null>(null);
  const [firstClassUsed, setFirstClassUsed] = useState(false);
  const [newsletterOptIn, setNewsletterOptIn] = useState(true);

  const daysLeftInTrial = trialEndsAt
    ? Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  const value = useMemo<MembershipContextValue>(() => {
    const fullContentAccess = tier === 'admin' || tier === 'trial' || tier === 'online_paid' || tier === 'in_person_unlimited';
    const wodAccessLevel: WodAccessLevel = fullContentAccess ? 'full' : tier === 'online_free' ? 'partial' : 'none';
    const communityAccess: 'full' | 'read_only' | 'none' =
      tier === 'drop_in' ? 'none' : tier === 'guest' ? 'read_only' : 'full';

    return {
      tier,
      signedUp,
      email,
      displayName: deriveDisplayName(email),
      trialEndsAt,
      daysLeftInTrial,
      trialWarningDismissed,

      isAdmin: tier === 'admin',
      fullContentAccess,
      wodAccessLevel,
      cowsAccess: fullContentAccess,
      deckAccess: fullContentAccess,
      communityAccess,
      bookingAccess: true,
      tenPackClassesRemaining,
      firstClassUsed,
      newsletterOptIn,

      startTrial: (enteredEmail: string) => {
        const endsAt = new Date();
        endsAt.setDate(endsAt.getDate() + TRIAL_LENGTH_DAYS);
        setEmail(enteredEmail);
        setTrialEndsAt(endsAt);
        setTrialWarningDismissed(false);
        setTier('trial');
        setSignedUp(true);
      },
      becomeMember: () => {
        setTier('online_paid');
        setSignedUp(true);
      },
      selectInPersonPlan: (plan: InPersonPlan) => {
        setTier(plan === 'monthly_unlimited' ? 'in_person_unlimited' : plan === 'ten_pack' ? 'ten_pack' : 'drop_in');
        setSignedUp(true);
        if (plan === 'ten_pack') setTenPackClassesRemaining(TEN_PACK_SIZE);
      },
      becomeGuest: () => {
        setEmail(null);
        setTier('guest');
        setSignedUp(true);
      },
      setDevTier: (nextTier: MembershipTier) => {
        setTier(nextTier);
        setSignedUp(true);
        if (nextTier === 'trial' && !trialEndsAt) {
          const endsAt = new Date();
          endsAt.setDate(endsAt.getDate() + TRIAL_LENGTH_DAYS);
          setTrialEndsAt(endsAt);
        }
        if (nextTier === 'ten_pack' && tenPackClassesRemaining === null) {
          setTenPackClassesRemaining(TEN_PACK_SIZE);
        }
      },
      dismissTrialWarning: () => setTrialWarningDismissed(true),
      useTenPackClass: () => setTenPackClassesRemaining((prev) => Math.max(0, (prev ?? TEN_PACK_SIZE) - 1)),
      refundTenPackClass: () =>
        setTenPackClassesRemaining((prev) => Math.min(TEN_PACK_SIZE, (prev ?? 0) + 1)),
      useFirstClass: () => setFirstClassUsed(true),
      setNewsletterOptIn: (optIn: boolean) => setNewsletterOptIn(optIn),
    };
  }, [
    tier,
    signedUp,
    email,
    trialEndsAt,
    daysLeftInTrial,
    trialWarningDismissed,
    tenPackClassesRemaining,
    firstClassUsed,
    newsletterOptIn,
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
