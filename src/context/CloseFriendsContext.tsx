import React, { createContext, useContext, useMemo, useState } from 'react';

type CloseFriendsContextValue = {
  isCloseFriend: (name: string) => boolean;
  toggleCloseFriend: (name: string) => void;
  closeFriendNames: string[];
};

const CloseFriendsContext = createContext<CloseFriendsContextValue | undefined>(undefined);

// Local/UI only for now — no backend, resets on app restart. Real friend data
// (and a friends feed backed by the server) comes later.
export function CloseFriendsProvider({ children }: { children: React.ReactNode }) {
  const [closeFriends, setCloseFriends] = useState<Record<string, boolean>>({});

  const value = useMemo<CloseFriendsContextValue>(
    () => ({
      isCloseFriend: (name) => !!closeFriends[name],
      toggleCloseFriend: (name) => {
        setCloseFriends((prev) => ({ ...prev, [name]: !prev[name] }));
      },
      closeFriendNames: Object.keys(closeFriends).filter((name) => closeFriends[name]),
    }),
    [closeFriends]
  );

  return <CloseFriendsContext.Provider value={value}>{children}</CloseFriendsContext.Provider>;
}

export function useCloseFriends() {
  const ctx = useContext(CloseFriendsContext);
  if (!ctx) {
    throw new Error('useCloseFriends must be used within a CloseFriendsProvider');
  }
  return ctx;
}
