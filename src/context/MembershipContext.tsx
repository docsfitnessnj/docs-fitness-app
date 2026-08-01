import React, { createContext, useContext, useMemo, useState } from 'react';

export type MembershipTier = 'free' | 'member';

type MembershipContextValue = {
  tier: MembershipTier;
  isMember: boolean;
  toggleTier: () => void;
};

const MembershipContext = createContext<MembershipContextValue | undefined>(undefined);

export function MembershipProvider({ children }: { children: React.ReactNode }) {
  const [tier, setTier] = useState<MembershipTier>('free');

  const value = useMemo<MembershipContextValue>(
    () => ({
      tier,
      isMember: tier === 'member',
      toggleTier: () => setTier((t) => (t === 'free' ? 'member' : 'free')),
    }),
    [tier]
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
