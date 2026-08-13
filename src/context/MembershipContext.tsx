import React, { createContext, useContext, useMemo, useState } from 'react';

// Three states: TRIAL (2-week full-access trial), MEMBER (paid), FREE (trial expired).
export type MembershipTier = 'trial' | 'member' | 'free';

const TRIAL_LENGTH_DAYS = 14;

type MembershipContextValue = {
  tier: MembershipTier;
  signedUp: boolean;
  email: string | null;
  trialEndsAt: Date | null;
  // True once a user has full access to Doc's COWS, The Deck, and Community (trial or paid member).
  hasFullAccess: boolean;
  startTrial: (email: string) => void;
  becomeMember: () => void;
  setDevTier: (tier: MembershipTier) => void;
};

const MembershipContext = createContext<MembershipContextValue | undefined>(undefined);

export function MembershipProvider({ children }: { children: React.ReactNode }) {
  const [tier, setTier] = useState<MembershipTier>('trial');
  const [signedUp, setSignedUp] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [trialEndsAt, setTrialEndsAt] = useState<Date | null>(null);

  const value = useMemo<MembershipContextValue>(
    () => ({
      tier,
      signedUp,
      email,
      trialEndsAt,
      hasFullAccess: tier === 'trial' || tier === 'member',
      startTrial: (enteredEmail: string) => {
        const endsAt = new Date();
        endsAt.setDate(endsAt.getDate() + TRIAL_LENGTH_DAYS);
        setEmail(enteredEmail);
        setTrialEndsAt(endsAt);
        setTier('trial');
        setSignedUp(true);
      },
      becomeMember: () => {
        setTier('member');
        setSignedUp(true);
      },
      setDevTier: (nextTier: MembershipTier) => setTier(nextTier),
    }),
    [tier, signedUp, email, trialEndsAt]
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
