import { useEffect, useState } from 'react';

// Same module-level-ref pattern as movementVaultModal.ts / deckCardModal.ts
// / postDetailModal.ts -- lets a search "member" result open a read-only
// view of another member's basic public profile (display name + avatar)
// from App.tsx. There is no other entry point into this view anywhere in
// the app yet, so there's no local/per-screen instance to coordinate with.
let openRef: ((memberId: string) => void) | null = null;

export function openMemberProfile(memberId: string) {
  openRef?.(memberId);
}

export function useMemberProfileModalState() {
  const [memberId, setMemberId] = useState<string | null>(null);

  useEffect(() => {
    openRef = (id) => setMemberId(id);
    return () => {
      openRef = null;
    };
  }, []);

  return [memberId, setMemberId] as const;
}
