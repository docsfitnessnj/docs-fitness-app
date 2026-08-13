import React, { createContext, useContext, useMemo, useState } from 'react';

// Three states: TRIAL (2-week full-access trial), MEMBER (paid), FREE (trial expired).
export type MembershipTier = 'trial' | 'member' | 'free';

const TRIAL_LENGTH_DAYS = 14;
const TRIAL_WARNING_THRESHOLD_DAYS = 3;

function deriveDisplayName(email: string | null): string {
  if (!email) return 'Member';
  const local = email.split('@')[0].replace(/[._-]+/g, ' ').trim();
  if (!local) return 'Member';
  return local
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

type MembershipContextValue = {
  tier: MembershipTier;
  signedUp: boolean;
  email: string | null;
  displayName: string;
  trialEndsAt: Date | null;
  daysLeftInTrial: number | null;
  trialWarningDismissed: boolean;
  // True once a user has full access to Doc's COWS, The Deck, and Community (trial or paid member).
  hasFullAccess: boolean;
  startTrial: (email: string) => void;
  becomeMember: () => void;
  setDevTier: (tier: MembershipTier) => void;
  dismissTrialWarning: () => void;
};

const MembershipContext = createContext<MembershipContextValue | undefined>(undefined);

export function MembershipProvider({ children }: { children: React.ReactNode }) {
  const [tier, setTier] = useState<MembershipTier>('trial');
  const [signedUp, setSignedUp] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [trialEndsAt, setTrialEndsAt] = useState<Date | null>(null);
  const [trialWarningDismissed, setTrialWarningDismissed] = useState(false);

  const daysLeftInTrial = trialEndsAt
    ? Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  const value = useMemo<MembershipContextValue>(
    () => ({
      tier,
      signedUp,
      email,
      displayName: deriveDisplayName(email),
      trialEndsAt,
      daysLeftInTrial,
      trialWarningDismissed,
      hasFullAccess: tier === 'trial' || tier === 'member',
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
        setTier('member');
        setSignedUp(true);
      },
      setDevTier: (nextTier: MembershipTier) => {
        setTier(nextTier);
        if (nextTier === 'trial' && !trialEndsAt) {
          const endsAt = new Date();
          endsAt.setDate(endsAt.getDate() + TRIAL_LENGTH_DAYS);
          setTrialEndsAt(endsAt);
        }
      },
      dismissTrialWarning: () => setTrialWarningDismissed(true),
    }),
    [tier, signedUp, email, trialEndsAt, daysLeftInTrial, trialWarningDismissed]
  );

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
