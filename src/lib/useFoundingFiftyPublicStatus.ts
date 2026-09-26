import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { FOUNDING_FIFTY_CAPACITY } from '../context/FoundingFiftyContext';

type PublicStatusRow = {
  starts_at: string | null;
  ends_at: string | null;
  claimed_count: number;
};

type FoundingFiftyPublicStatus = {
  loading: boolean;
  isLive: boolean;
  claimedCount: number;
  spotsRemaining: number;
  capacity: number;
  // Null until loaded — used to derive the live "OFFER ENDS <DAY>" deadline
  // line, never a hardcoded day.
  endsAt: number | null;
};

const LOADING_STATE: FoundingFiftyPublicStatus = {
  loading: true,
  isLive: false,
  claimedCount: 0,
  spotsRemaining: FOUNDING_FIFTY_CAPACITY,
  capacity: FOUNDING_FIFTY_CAPACITY,
  endsAt: null,
};

// The About page's own read of the Founding 50 launch window — deliberately
// separate from FoundingFiftyContext, whose fetch only ever runs for a
// signed-in member. The About page is the one screen a logged-out stranger
// sees, so it reads the public-only founding_fifty_public_status() function
// instead (see supabase/setup.sql / migration_009.sql), which works for an
// anonymous visitor and a signed-in member alike and never exposes the
// founding_fifty_members roster itself. Same "safe direction to be wrong in"
// convention as FoundingFiftyContext: defaults to not-live while loading.
export function useFoundingFiftyPublicStatus(): FoundingFiftyPublicStatus {
  const [state, setState] = useState<FoundingFiftyPublicStatus>(LOADING_STATE);

  useEffect(() => {
    let cancelled = false;
    supabase
      .rpc('founding_fifty_public_status')
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setState({ ...LOADING_STATE, loading: false });
          return;
        }
        const row = data as PublicStatusRow;
        const claimedCount = row.claimed_count ?? 0;
        const spotsRemaining = Math.max(0, FOUNDING_FIFTY_CAPACITY - claimedCount);
        const soldOut = spotsRemaining <= 0;
        const now = Date.now();
        const startsAtMs = row.starts_at ? new Date(row.starts_at).getTime() : null;
        const endsAtMs = row.ends_at ? new Date(row.ends_at).getTime() : null;
        const windowOpen = startsAtMs !== null && endsAtMs !== null && now >= startsAtMs && now < endsAtMs;
        setState({
          loading: false,
          isLive: windowOpen && !soldOut,
          claimedCount,
          spotsRemaining,
          capacity: FOUNDING_FIFTY_CAPACITY,
          endsAt: endsAtMs,
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
