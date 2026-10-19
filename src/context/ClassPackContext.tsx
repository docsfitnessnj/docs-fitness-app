import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabaseClient';

type ClassPackContextValue = {
  // Same "safe direction to be wrong in" convention as SubscriptionContext's
  // own `loading` — while true, `active`/`creditsRemaining` may still be
  // their no-pack defaults regardless of the real account.
  loading: boolean;
  refetching: boolean;
  error: string | null;
  // True while the member has at least one pack that isn't expired and
  // still has credit left — this (not a raw row count) is what
  // MembershipContext treats as "on the 10 Class Pack tier."
  active: boolean;
  // Credits left on the soonest-expiring active pack — null when there's
  // no active pack at all (never 0 as a stand-in for "no pack").
  creditsRemaining: number | null;
  expiresAt: Date | null;
  refetch: () => Promise<void>;
  retry: () => void;
  // Spends/refunds one credit via the matching security-definer RPC
  // (migration_019 — the client can never write class_packs directly).
  // Fire-and-forget from the caller's point of view: optimistically
  // updates the locally-held value immediately, then reconciles with a
  // refetch once the RPC actually resolves.
  useCredit: () => void;
  refundCredit: () => void;
};

const ClassPackContext = createContext<ClassPackContextValue | undefined>(undefined);

type Row = {
  credits_remaining: number;
  expires_at: string;
};

const LOG_TAG = '[memberState:classPack]';

function pickActivePack(rows: Row[]): Row | null {
  const now = Date.now();
  const active = rows.filter((r) => r.credits_remaining > 0 && new Date(r.expires_at).getTime() > now);
  if (active.length === 0) return null;
  // Soonest-expiring first — mirrors use_class_pack_credit()'s own choice
  // so what's shown here always matches what a booking would actually spend.
  active.sort((a, b) => new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime());
  return active[0];
}

// The real, server-written truth about a member's 10 Class Pack credits
// (see supabase/setup.sql's `class_packs` table and the stripe-webhook Edge
// Function, which is the only thing that ever inserts a pack). Credits are
// only ever spent or refunded through the two security-definer RPCs below
// — no authenticated client can UPDATE this table directly.
export function ClassPackProvider({ children }: { children: React.ReactNode }) {
  const { user, authReady } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const hasLoadedOnce = useRef(false);
  const lastUserId = useRef<string | null>(null);

  const refetch = async () => {
    if (!user) return;
    const isRefetch = hasLoadedOnce.current;
    const { data, error: fetchError } = await supabase
      .from('class_packs')
      .select('credits_remaining, expires_at')
      .eq('user_id', user.id);
    if (fetchError) {
      if (isRefetch) {
        console.error(LOG_TAG, 'refetch error — keeping last known good state', fetchError);
        return;
      }
      console.error(LOG_TAG, 'fetch error', fetchError);
      setError(fetchError.message);
      return;
    }
    setError(null);
    setRows((data as Row[] | null) ?? []);
    hasLoadedOnce.current = true;
  };

  useEffect(() => {
    if (!authReady) return;
    const currentUserId = user?.id ?? null;
    if (currentUserId !== lastUserId.current) {
      lastUserId.current = currentUserId;
      hasLoadedOnce.current = false;
      setRows([]);
      setError(null);
      setRefetching(false);
      setLoading(true);
    }
    if (!user) return;
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

  const activePack = pickActivePack(rows);

  const value = useMemo<ClassPackContextValue>(
    () => ({
      loading,
      refetching,
      error,
      active: activePack !== null,
      creditsRemaining: activePack?.credits_remaining ?? null,
      expiresAt: activePack ? new Date(activePack.expires_at) : null,
      refetch,
      retry: () => setRetryTick((t) => t + 1),
      useCredit: () => {
        // Optimistic: decrement the locally-held soonest-expiring pack
        // immediately so the booking flow's "X classes left" reads right
        // without waiting on a round trip, then reconcile for real.
        setRows((prev) => {
          if (!activePack) return prev;
          const idx = prev.findIndex((r) => r.expires_at === activePack.expires_at && r.credits_remaining === activePack.credits_remaining);
          if (idx === -1) return prev;
          const next = [...prev];
          next[idx] = { ...next[idx], credits_remaining: Math.max(0, next[idx].credits_remaining - 1) };
          return next;
        });
        supabase.rpc('use_class_pack_credit').then(({ error: rpcError }) => {
          if (rpcError) console.error(LOG_TAG, 'use_class_pack_credit failed', rpcError);
          refetch();
        });
      },
      refundCredit: () => {
        setRows((prev) => {
          if (!activePack) return prev;
          const idx = prev.findIndex((r) => r.expires_at === activePack.expires_at && r.credits_remaining === activePack.credits_remaining);
          if (idx === -1) return prev;
          const next = [...prev];
          next[idx] = { ...next[idx], credits_remaining: next[idx].credits_remaining + 1 };
          return next;
        });
        supabase.rpc('refund_class_pack_credit').then(({ error: rpcError }) => {
          if (rpcError) console.error(LOG_TAG, 'refund_class_pack_credit failed', rpcError);
          refetch();
        });
      },
    }),
    [loading, refetching, error, activePack, rows]
  );

  return <ClassPackContext.Provider value={value}>{children}</ClassPackContext.Provider>;
}

export function useClassPack() {
  const ctx = useContext(ClassPackContext);
  if (!ctx) {
    throw new Error('useClassPack must be used within a ClassPackProvider');
  }
  return ctx;
}
