import React, { createContext, useContext, useMemo, useState } from 'react';

export type MembershipTier = 'trial' | 'member' | 'free';

const TIER_CYCLE: MembershipTier[] = ['trial', 'member', 'free'];

type MembershipContextValue = {
  tier: MembershipTier;
  // Trial and paid Member both get full access; only an expired (Free) tier is gated.
  hasFullAccess: boolean;
  setTier: (tier: MembershipTier) => void;
  cycleTier: () => void;
};

const MembershipContext = createContext<MembershipContextValue | undefined>(undefined);

export function MembershipProvider({ children }: { children: React.ReactNode }) {
  const [tier, setTier] = useState<MembershipTier>('trial');

  const value = useMemo<MembershipContextValue>(() => {
    const nextIndex = (TIER_CYCLE.indexOf(tier) + 1) % TIER_CYCLE.length;
    return {
      tier,
      hasFullAccess: tier !== 'free',
      setTier,
      cycleTier: () => setTier(TIER_CYCLE[nextIndex]),
    };
  }, [tier]);

  return <MembershipContext.Provider value={value}>{children}</MembershipContext.Provider>;
}

export function useMembership() {
  const ctx = useContext(MembershipContext);
  if (!ctx) {
    throw new Error('useMembership must be used within a MembershipProvider');
  }
  return ctx;
}
