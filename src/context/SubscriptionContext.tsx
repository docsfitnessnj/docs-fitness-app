import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabaseClient';

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid'
  | null;
export type SubscriptionPlan = 'monthly' | 'annual' | 'founding' | null;

type SubscriptionContextValue = {
  // True until the real subscription row has been fetched at least once —
  // callers treat "loading" as "no access yet," the safe direction to be
  // wrong in for a moment (same convention FoundingFiftyContext uses).
  loading: boolean;
  status: SubscriptionStatus;
  plan: SubscriptionPlan;
  currentPeriodEnd: Date | null;
  trialEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  // Re-reads this member's own row — used right after a Stripe Checkout
  // redirect-back, to poll until the webhook has actually landed.
  refetch: () => Promise<void>;
};

const SubscriptionContext = createContext<SubscriptionContextValue | undefined>(undefined);

type Row = {
  status: string | null;
  plan: string | null;
  current_period_end: string | null;
  trial_end: string | null;
  cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
};

// The real, server-written truth about a member's ONLINE subscription (see
// supabase/setup.sql's `subscriptions` table and the stripe-webhook Edge
// Function — the only thing that ever writes to it). No authenticated
// client can insert or update this table at all, only read their own row,
// so this context can never itself grant access; it only ever reports what
// Stripe and the webhook already decided. In-person plans don't use this
// context at all — they stay on MembershipContext's simulated state.
export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { user, authReady } = useAuth();
  const [row, setRow] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('subscriptions')
      .select('status, plan, current_period_end, trial_end, cancel_at_period_end, stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();
    setRow((data as Row | null) ?? null);
  };

  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      setRow(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    refetch().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, user]);

  const value = useMemo<SubscriptionContextValue>(
    () => ({
      loading,
      status: (row?.status as SubscriptionStatus) ?? null,
      plan: (row?.plan as SubscriptionPlan) ?? null,
      currentPeriodEnd: row?.current_period_end ? new Date(row.current_period_end) : null,
      trialEnd: row?.trial_end ? new Date(row.trial_end) : null,
      cancelAtPeriodEnd: row?.cancel_at_period_end ?? false,
      stripeCustomerId: row?.stripe_customer_id ?? null,
      refetch,
    }),
    [loading, row, refetch]
  );

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return ctx;
}
