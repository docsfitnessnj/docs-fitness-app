import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { etWallTimeToUTC } from '../lib/challengeSchedule';
import { isBackendUnavailableError, supabase } from '../lib/supabaseClient';

export const FOUNDING_FIFTY_CAPACITY = 50;
export const FOUNDING_FIFTY_PRICE = 37;

export type FoundingFiftyMember = {
  name: string;
  joinedAt: number;
};

type FoundingFiftyContextValue = {
  // True until the launch window and the real claimed count have both been
  // fetched at least once — callers use this to avoid ever flashing the
  // wrong card (standard vs founding) before the real answer is in.
  loading: boolean;
  // Both null until Doc has set a window from the admin area.
  startsAt: number | null;
  endsAt: number | null;
  members: FoundingFiftyMember[];
  capacity: number;
  claimedCount: number;
  spotsRemaining: number;
  soldOut: boolean;
  // The single source of truth every screen uses to decide whether to show
  // founding pricing at all: only true between startsAt/endsAt (both set)
  // and only while spots remain.
  isLive: boolean;
  // Admin-only write — takes plain Eastern-time wall-clock parts (as typed
  // into the FOUNDING 50 LAUNCH fields) and converts them to real UTC
  // instants before saving, the same way Weekly Challenge timing does, so
  // the window is correct for every member regardless of their own device's
  // timezone. Pass nulls to clear the window entirely.
  setWindow: (
    start: { year: number; month: number; day: number; hour: number; minute: number } | null,
    end: { year: number; month: number; day: number; hour: number; minute: number } | null
  ) => Promise<{ error: string | null }>;
  // Re-reads the roster — used right after a real Stripe Checkout at the
  // founding price is confirmed, so this device's own "X of 50 claimed"
  // count updates immediately instead of waiting for a future reload. A
  // spot is only ever actually claimed by the stripe-webhook Edge Function
  // (or an admin) now — see supabase/migration_007.sql.
  refetch: () => Promise<void>;
};

const FoundingFiftyContext = createContext<FoundingFiftyContextValue | undefined>(undefined);

type MemberRow = { id: string; joined_at: string; profiles: { display_name: string } | { display_name: string }[] | null };

function nameOf(row: MemberRow): string {
  const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  return p?.display_name?.trim() || 'Member';
}

export function FoundingFiftyProvider({ children }: { children: React.ReactNode }) {
  const { user, authReady } = useAuth();
  const [loading, setLoading] = useState(true);
  const [startsAt, setStartsAt] = useState<number | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [members, setMembers] = useState<FoundingFiftyMember[]>([]);

  const refetchMembers = async () => {
    const { data } = await supabase
      .from('founding_fifty_members')
      .select('id, joined_at, profiles(display_name)')
      .order('joined_at', { ascending: true });
    setMembers(((data as unknown as MemberRow[]) ?? []).map((row) => ({ name: nameOf(row), joinedAt: new Date(row.joined_at).getTime() })));
  };

  useEffect(() => {
    if (!authReady || !user) return;
    let cancelled = false;
    setLoading(true);

    Promise.all([
      supabase.from('founding_fifty_settings').select('starts_at, ends_at').eq('id', 1).maybeSingle(),
      supabase.from('founding_fifty_members').select('id, joined_at, profiles(display_name)').order('joined_at', { ascending: true }),
    ]).then(([settingsRes, membersRes]) => {
      if (cancelled) return;
      if (!settingsRes.error && settingsRes.data) {
        setStartsAt(settingsRes.data.starts_at ? new Date(settingsRes.data.starts_at).getTime() : null);
        setEndsAt(settingsRes.data.ends_at ? new Date(settingsRes.data.ends_at).getTime() : null);
      }
      if (!membersRes.error) {
        setMembers(((membersRes.data as unknown as MemberRow[]) ?? []).map((row) => ({ name: nameOf(row), joinedAt: new Date(row.joined_at).getTime() })));
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [authReady, user]);

  const value = useMemo<FoundingFiftyContextValue>(() => {
    const claimedCount = members.length;
    const spotsRemaining = Math.max(0, FOUNDING_FIFTY_CAPACITY - claimedCount);
    const soldOut = spotsRemaining <= 0;
    const now = Date.now();
    const windowOpen = startsAt !== null && endsAt !== null && now >= startsAt && now < endsAt;
    // Defaults to false while still loading — the safe direction to be
    // wrong in for a moment is "don't offer a discount that isn't
    // confirmed yet," not the reverse.
    const isLive = !loading && windowOpen && !soldOut;

    return {
      loading,
      startsAt,
      endsAt,
      members,
      capacity: FOUNDING_FIFTY_CAPACITY,
      claimedCount,
      spotsRemaining,
      soldOut,
      isLive,
      setWindow: async (start, end) => {
        const startsAtIso = start ? etWallTimeToUTC(start.year, start.month, start.day, start.hour, start.minute).toISOString() : null;
        const endsAtIso = end ? etWallTimeToUTC(end.year, end.month, end.day, end.hour, end.minute).toISOString() : null;
        const { error } = await supabase
          .from('founding_fifty_settings')
          .update({ starts_at: startsAtIso, ends_at: endsAtIso })
          .eq('id', 1);
        if (error) {
          return {
            error: isBackendUnavailableError(error)
              ? "Can't save the launch window right now — the backend isn't reachable."
              : error.message,
          };
        }
        setStartsAt(startsAtIso ? new Date(startsAtIso).getTime() : null);
        setEndsAt(endsAtIso ? new Date(endsAtIso).getTime() : null);
        return { error: null };
      },
      refetch: refetchMembers,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, startsAt, endsAt, members, user]);

  return <FoundingFiftyContext.Provider value={value}>{children}</FoundingFiftyContext.Provider>;
}

export function useFoundingFifty() {
  const ctx = useContext(FoundingFiftyContext);
  if (!ctx) {
    throw new Error('useFoundingFifty must be used within a FoundingFiftyProvider');
  }
  return ctx;
}
