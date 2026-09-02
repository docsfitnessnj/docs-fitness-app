import React, { createContext, useContext, useMemo, useState } from 'react';

// Every state a person (or Doc) can be in. There is no anonymous/guest
// state — every account, whichever door it came through, has an email —
// so every one of these is either full access ("Crew") or not ("Dockside").
// - trial: 2-week free online trial, full access
// - online_paid: paying online member, full access
// - in_person_unlimited: Boathouse Monthly Unlimited — full app included
// - online_free: no active plan (trial lapsed, or came in through BOOK YOUR
//   CLASS and hasn't chosen one yet) — 2 of 5 weekly WODs, no COWS, no Deck
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

  startTrial: (email: string) => void;
  becomeMember: () => void;
  // Claims a Founding 50 spot — same full access as becomeMember's
  // online_paid, but at the locked-in rate, tracked as its own tier so a
  // later cancellation can't quietly resubscribe at the founding rate.
  becomeFoundingFifty: () => void;
  selectInPersonPlan: (plan: InPersonPlan) => void;
  // The About page's BOOK YOUR CLASS door — captures an email without
  // committing to a paid plan yet, same as a lapsed trial (online_free):
  // booking access, first-class-free, full (non-anonymous) community.
  enterFreeTier: (email: string) => void;
  // A returning member signing back in — full online access, no trial
  // dates, and (unlike becomeMember) no purchase celebration since nothing
  // was just bought.
  signIn: (email: string) => void;
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

export function MembershipProvider({ children }: { children: React.ReactNode }) {
  const [tier, setTier] = useState<MembershipTier>('trial');
  const [signedUp, setSignedUp] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [trialEndsAt, setTrialEndsAt] = useState<Date | null>(null);
  const [trialWarningDismissed, setTrialWarningDismissed] = useState(false);
  const [tenPackClassesRemaining, setTenPackClassesRemaining] = useState<number | null>(null);
  const [firstClassUsed, setFirstClassUsed] = useState(false);
  const [newsletterOptIn, setNewsletterOptIn] = useState(true);
  const [justPurchased, setJustPurchased] = useState(false);
  const [planStartedAt, setPlanStartedAt] = useState<number | null>(null);
  const [cancellationRequested, setCancellationRequested] = useState(false);
  const [hasEverTrialed, setHasEverTrialed] = useState(false);

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

      startTrial: (enteredEmail: string) => {
        const endsAt = new Date();
        endsAt.setDate(endsAt.getDate() + TRIAL_LENGTH_DAYS);
        setEmail(enteredEmail);
        setTrialEndsAt(endsAt);
        setTrialWarningDismissed(false);
        setTier('trial');
        setSignedUp(true);
        setHasEverTrialed(true);
      },
      becomeMember: () => {
        setTier('online_paid');
        setSignedUp(true);
        setJustPurchased(true);
        setPlanStartedAt(Date.now());
        setCancellationRequested(false);
      },
      becomeFoundingFifty: () => {
        setTier('founding_50');
        setSignedUp(true);
        setJustPurchased(true);
        setPlanStartedAt(Date.now());
        setCancellationRequested(false);
      },
      selectInPersonPlan: (plan: InPersonPlan) => {
        setTier(plan === 'monthly_unlimited' ? 'in_person_unlimited' : plan === 'ten_pack' ? 'ten_pack' : 'drop_in');
        setSignedUp(true);
        if (plan === 'ten_pack') setTenPackClassesRemaining(TEN_PACK_SIZE);
        // Drop In is a one-off, not a membership — no celebration for it.
        if (plan !== 'drop_in') setJustPurchased(true);
        if (plan === 'monthly_unlimited') setPlanStartedAt(Date.now());
        setCancellationRequested(false);
      },
      enterFreeTier: (enteredEmail) => {
        setEmail(enteredEmail);
        setTier('online_free');
        setSignedUp(true);
      },
      signIn: (enteredEmail) => {
        setEmail(enteredEmail);
        setTier('online_paid');
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
        if (nextTier === 'ten_pack') {
          // Always a fresh, round demo count — this is the preview path,
          // not a real purchase, so there's no reason to leave it wherever
          // a previous preview session happened to decrement it to.
          setTenPackClassesRemaining(TEN_PACK_SIZE);
        }
        if (RECURRING_TIERS.includes(nextTier) && planStartedAt === null) {
          setPlanStartedAt(Date.now());
        }
        // Previewing one of the named Dockside tiers should reliably show
        // that tier's own banner variant, not the first-time-visitor one —
        // only the dedicated previewFirstTimeVisitor() below should ever
        // show that state.
        if (nextTier === 'online_free' || nextTier === 'ten_pack' || nextTier === 'drop_in') {
          setHasEverTrialed(true);
        }
      },
      previewFirstTimeVisitor: () => {
        setTier('online_free');
        setSignedUp(true);
        setHasEverTrialed(false);
      },
      dismissTrialWarning: () => setTrialWarningDismissed(true),
      useTenPackClass: () => setTenPackClassesRemaining((prev) => Math.max(0, (prev ?? TEN_PACK_SIZE) - 1)),
      refundTenPackClass: () =>
        setTenPackClassesRemaining((prev) => Math.min(TEN_PACK_SIZE, (prev ?? 0) + 1)),
      useFirstClass: () => setFirstClassUsed(true),
      setNewsletterOptIn: (optIn: boolean) => setNewsletterOptIn(optIn),
      clearJustPurchased: () => setJustPurchased(false),
      requestCancellation: () => setCancellationRequested(true),
      keepMembership: () => setCancellationRequested(false),
      signOut: () => {
        setSignedUp(false);
        setTier('trial');
        setEmail(null);
        setTrialEndsAt(null);
        setTrialWarningDismissed(false);
        setTenPackClassesRemaining(null);
        setFirstClassUsed(false);
        setJustPurchased(false);
        setPlanStartedAt(null);
        setCancellationRequested(false);
        setHasEverTrialed(false);
      },
    };
  }, [
    tier,
    planStartedAt,
    cancellationRequested,
    signedUp,
    email,
    trialEndsAt,
    daysLeftInTrial,
    trialWarningDismissed,
    tenPackClassesRemaining,
    firstClassUsed,
    newsletterOptIn,
    justPurchased,
    hasEverTrialed,
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
