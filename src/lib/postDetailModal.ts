import { useEffect, useState } from 'react';

// Mirrors movementVaultModal.ts / deckCardModal.ts's module-level-ref
// pattern -- lets a search result open a specific community post's detail
// view from App.tsx, regardless of which tab is active, without needing
// the Community tab itself to be mounted. CommunityScreen.tsx keeps its own
// local `detailPostId` state for posts opened from the feed directly;
// this is the separate "open from anywhere else" entry point.
let openRef: ((postId: string) => void) | null = null;

export function openPostDetail(postId: string) {
  openRef?.(postId);
}

export function usePostDetailModalState() {
  const [postId, setPostId] = useState<string | null>(null);

  useEffect(() => {
    openRef = (id) => setPostId(id);
    return () => {
      openRef = null;
    };
  }, []);

  return [postId, setPostId] as const;
}
