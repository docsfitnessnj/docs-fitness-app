import { useEffect, useState } from 'react';

// Mirrors movementVaultModal.ts's module-level-ref pattern -- lets a search
// result open a specific Deck card's detail view from App.tsx (always
// mounted, so this works regardless of which tab is currently active or
// even mounted) without prop-drilling through React Navigation. The Deck
// tab's own Shuffle/Browse flow keeps its own local `selectedCard` state in
// DeckScreen.tsx, untouched by this -- this is purely the "open from
// anywhere else" entry point.
let openRef: ((cardId: string) => void) | null = null;

export function openDeckCard(cardId: string) {
  openRef?.(cardId);
}

export function useDeckCardModalState() {
  const [cardId, setCardId] = useState<string | null>(null);

  useEffect(() => {
    openRef = (id) => setCardId(id);
    return () => {
      openRef = null;
    };
  }, []);

  return [cardId, setCardId] as const;
}
