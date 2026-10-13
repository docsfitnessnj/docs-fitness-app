import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
  // True ONLY until the real subscription row has been fetched successfully
  // for the very first time ever — callers treat "loading" as "no access
  // yet," the safe direction to be wrong in for a moment (same convention
  // FoundingFiftyContext uses). Deliberately does NOT flip true again for a
  // later background refetch (token refresh, tab refocus, a manual
  // `refetch()` call) — see `refetching` below for that. A refetch holds
  // `status`/`plan`/etc at their last successfully-loaded values the whole
  // time it's in flight; it never resets them to a default.
  loading: boolean;
  // True only while a refetch (a fetch AFTER the first successful load) is
  // in flight. `status`/`plan`/etc keep reporting the last known good value
  // throughout — this is purely informational for a caller that wants to
  // know a refresh is happening, not a signal to fall back to anything.
  refetching: boolean;
  // Non-null when the INITIAL fetch failed (network, RLS, a genuinely
  // missing/misconfigured column, anything) — see ResponsiveShell in
  // App.tsx, which now checks this before ever trusting `status`/`plan`.
  // Previously this context discarded the query's error entirely, which is
  // how a real failure against production Supabase could read as "loaded,
  // no subscription" instead of "failed to load" — silently handing every
  // caller the free-tier defaults. A refetch that errors AFTER a successful
  // earlier load does NOT populate this field — see `refetch` below, which
  // keeps the last known good state and only logs the failure. This field
  // is deliberately scoped to "the member has never seen a real value yet,"
  // the one case where failing closed (ResponsiveShell's retry screen) is
  // correct; a transient refetch failure on an already-loaded account must
  // never fail closed.
  error: string | null;
  status: SubscriptionStatus;
  plan: SubscriptionPlan;
  currentPeriodEnd: Date | null;
  trialEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  // Re-reads this member's own row — used right after a Stripe Checkout
  // redirect-back, to poll until the webhook has actually landed.
  refetch: () => Promise<void>;
  // Re-runs the initial load from scratch — the "loading" flag flips back
  // to true, and a swallowed error can't happen twice. Wired to the
  // fail-closed retry screen in ResponsiveShell.
  retry: () => void;
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

const LOG_TAG = '[memberState:subscription]';

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
  const [refetching, setRefetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  // Whether a value has EVER loaded successfully — the first-load-vs-refetch
  // distinction this round's fix hinges on. A ref, not state: it must be
  // readable synchronously inside the same effect run that flips it, and it
  // never itself needs to trigger a re-render (loading/refetching already do).
  const hasLoadedOnce = useRef(false);

  const refetch = async () => {
    if (!user) return;
    const isRefetch = hasLoadedOnce.current;
    if (isRefetch) {
      console.log(LOG_TAG, 'refetch start', {
        userId: user.id,
        heldStatus: row?.status ?? null,
        heldPlan: row?.plan ?? null,
      });
    } else {
      console.log(LOG_TAG, 'fetch start', { userId: user.id });
    }
    const { data, error: fetchError } = await supabase
      .from('subscriptions')
      .select('status, plan, current_period_end, trial_end, cancel_at_period_end, stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (fetchError) {
      if (isRefetch) {
        // A refetch failing must NEVER erase a value this member already
        // has — keep serving `row` exactly as it was before this call, and
        // just log it. This is the fix: previously there was no `isRefetch`
        // distinction at all, so this path didn't exist — every failure
        // (initial or not) looked identical.
        console.error(LOG_TAG, 'refetch error — keeping last known good state', fetchError, {
          heldStatus: row?.status ?? null,
          heldPlan: row?.plan ?? null,
        });
        return;
      }
      console.error(LOG_TAG, 'fetch error', fetchError);
      setError(fetchError.message);
      // Deliberately NOT touching `row` here — a failed read must never be
      // indistinguishable from "no subscription row" (which is a legitimate,
      // real state for online_free/in-person accounts). See `error` above.
      return;
    }
    if (isRefetch) {
      console.log(LOG_TAG, 'refetch success', { status: data?.status ?? null, plan: data?.plan ?? null });
    } else {
      console.log(LOG_TAG, 'fetch success', { status: data?.status ?? null, plan: data?.plan ?? null });
    }
    setError(null);
    setRow((data as Row | null) ?? null);
    hasLoadedOnce.current = true;
  };

  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      setRow(null);
      setError(null);
      setLoading(false);
      setRefetching(false);
      hasLoadedOnce.current = false;
      return;
    }
    let cancelled = false;
    const isRefetch = hasLoadedOnce.current;
    if (isRefetch) {
      setRefetching(true);
    } else {
      setLoading(true);
    }
    refetch().finally(() => {
      if (cancelled) return;
      if (isRefetch) {
        setRefetching(false);
      } else {
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, user, retryTick]);

  const value = useMemo<SubscriptionContextValue>(
    () => ({
      loading,
      refetching,
      error,
      status: (row?.status as SubscriptionStatus) ?? null,
      plan: (row?.plan as SubscriptionPlan) ?? null,
      currentPeriodEnd: row?.current_period_end ? new Date(row.current_period_end) : null,
      trialEnd: row?.trial_end ? new Date(row.trial_end) : null,
      cancelAtPeriodEnd: row?.cancel_at_period_end ?? false,
      stripeCustomerId: row?.stripe_customer_id ?? null,
      refetch,
      retry: () => setRetryTick((t) => t + 1),
    }),
    [loading, refetching, error, row, refetch]
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
