import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { loadJSON, saveJSON } from '../lib/storage';

const STORAGE_KEY = 'docsfitness.foundingFifty.v1';

export const FOUNDING_FIFTY_CAPACITY = 50;
export const FOUNDING_FIFTY_PRICE = 37;

export type FoundingFiftyMember = {
  name: string;
  email: string | null;
  joinedAt: number;
};

type PersistedState = {
  // Off by default — the whole tier stays invisible until launch weekend.
  enabled: boolean;
  members: FoundingFiftyMember[];
};

const DEFAULT_STATE: PersistedState = {
  enabled: false,
  members: [],
};

// A one-time cleanup for a device that already persisted the old fabricated
// launch-weekend roster before this fix — those 19 fake names would
// otherwise keep counting against the real 50 spots forever, since
// loadJSON only ever falls back to DEFAULT_STATE when nothing is stored
// yet. Anyone genuinely named one of these can just claim again.
const REMOVED_FAKE_NAMES = new Set([
  'R. Nakamura', 'C. Delgado', 'B. Whitfield', 'M. Okafor', 'L. Prentice',
  'A. Sorrentino', 'J. Halvorsen', 'E. Iglesias', 'T. Marsh', 'P. Kowalski',
  'S. Devereaux', 'N. Abernathy', 'G. Fontaine', 'K. Bramwell', 'D. Osei',
  'W. Calloway', 'F. Rourke', 'H. Vasquez', 'I. Thackeray',
]);

function stripFakeMembers(state: PersistedState): PersistedState {
  const filtered = state.members.filter((m) => !REMOVED_FAKE_NAMES.has(m.name));
  return filtered.length === state.members.length ? state : { ...state, members: filtered };
}

type FoundingFiftyContextValue = {
  enabled: boolean;
  members: FoundingFiftyMember[];
  capacity: number;
  claimedCount: number;
  spotsRemaining: number;
  soldOut: boolean;
  isMember: (name: string) => boolean;
  setEnabled: (enabled: boolean) => void;
  // Claims one of the 50 spots for `name` — returns false (no-op) if sold
  // out or if that name has already claimed one.
  claim: (name: string, email: string | null) => boolean;
};

const FoundingFiftyContext = createContext<FoundingFiftyContextValue | undefined>(undefined);

export function FoundingFiftyProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PersistedState>(() => stripFakeMembers(loadJSON(STORAGE_KEY, DEFAULT_STATE)));

  useEffect(() => {
    saveJSON(STORAGE_KEY, state);
  }, [state]);

  const value = useMemo<FoundingFiftyContextValue>(() => {
    const claimedCount = state.members.length;
    const spotsRemaining = Math.max(0, FOUNDING_FIFTY_CAPACITY - claimedCount);

    return {
      enabled: state.enabled,
      members: state.members,
      capacity: FOUNDING_FIFTY_CAPACITY,
      claimedCount,
      spotsRemaining,
      soldOut: spotsRemaining <= 0,
      isMember: (name) => state.members.some((m) => m.name === name),
      setEnabled: (enabled) => setState((prev) => ({ ...prev, enabled })),
      claim: (name, email) => {
        if (spotsRemaining <= 0) return false;
        if (state.members.some((m) => m.name === name)) return false;
        setState((prev) => ({ ...prev, members: [...prev.members, { name, email, joinedAt: Date.now() }] }));
        return true;
      },
    };
  }, [state]);

  return <FoundingFiftyContext.Provider value={value}>{children}</FoundingFiftyContext.Provider>;
}

export function useFoundingFifty() {
  const ctx = useContext(FoundingFiftyContext);
  if (!ctx) {
    throw new Error('useFoundingFifty must be used within a FoundingFiftyProvider');
  }
  return ctx;
}
