import React from 'react';
import { useMembership } from '../context/MembershipContext';
import { JoinBoathouseLock } from './JoinBoathouseLock';

type Props = {
  children: React.ReactNode;
};

// Wraps a tab's content. Free (trial-expired) tier sees the "Join the Boathouse"
// lock screen instead of the real feature. Trial and Member tiers see the real content.
export function MembershipGate({ children }: Props) {
  const { fullContentAccess } = useMembership();

  if (fullContentAccess) {
    return <>{children}</>;
  }

  return <JoinBoathouseLock />;
}
