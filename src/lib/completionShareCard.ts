import { useEffect, useState } from 'react';
import { DeckCardData } from '../data/deckCards';

// Round 33: THE COMPLETION SHARE CARD. Mirrors deckCardModal.ts's
// module-level-ref pattern so any of the four completion call sites
// (marking a Doc's WOD complete, marking a deck card complete, saving or
// posting logged results, posting a COW score) can open this from
// anywhere -- DocsWodsScreen, DayPanel, LogResultsModal, DeckScreen,
// App.tsx's own global DeckCardDetailModal singleton, DocsCowsScreen --
// without prop-drilling. The card itself (App.tsx's one global
// <CompletionShareCardOverlay>) reads the badge/deck counts live via
// context at render time rather than taking them as payload fields, so it
// always reflects the just-applied optimistic completion, never a number
// computed a tick too early.
export type ShareCardSource =
  | { kind: 'wod'; title: string; date: Date }
  | { kind: 'logged'; title: string; date: Date }
  | { kind: 'cow'; title: string; date: Date }
  | { kind: 'deck'; card: DeckCardData; date: Date };

let openRef: ((source: ShareCardSource) => void) | null = null;

export function openCompletionShareCard(source: ShareCardSource) {
  openRef?.(source);
}

export function useCompletionShareCardState() {
  const [source, setSource] = useState<ShareCardSource | null>(null);

  useEffect(() => {
    openRef = (next) => setSource(next);
    return () => {
      openRef = null;
    };
  }, []);

  return [source, setSource] as const;
}
