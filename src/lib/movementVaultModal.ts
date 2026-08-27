import { useEffect, useState } from 'react';

// Mirrors lib/scheduleModal.ts's module-level-ref pattern so any screen —
// the hamburger's "THE MOVEMENT VAULT" row, the WODs "LOOK UP A MOVEMENT"
// button, or a tapped movement name inside a WOD/deck card/challenge — can
// open the vault (optionally straight to one movement's detail view)
// without prop-drilling through React Navigation.
//
// `returnLabel` names where a direct-to-detail open came from (e.g.
// "WORKOUT", "DECK CARD", "CHALLENGE") so the detail view's BACK button can
// read "BACK TO WORKOUT" and — more importantly — so backing out returns
// there instead of dropping into the vault's own list, which the user never
// asked to see.
let openRef: ((movementId?: string, returnLabel?: string) => void) | null = null;

export function openMovementVault(movementId?: string, returnLabel?: string) {
  openRef?.(movementId, returnLabel);
}

export function useMovementVaultModalState() {
  const [open, setOpen] = useState(false);
  const [initialMovementId, setInitialMovementId] = useState<string | undefined>(undefined);
  const [initialReturnLabel, setInitialReturnLabel] = useState<string | undefined>(undefined);

  useEffect(() => {
    openRef = (movementId, returnLabel) => {
      setInitialMovementId(movementId);
      setInitialReturnLabel(returnLabel);
      setOpen(true);
    };
    return () => {
      openRef = null;
    };
  }, []);

  return [open, setOpen, initialMovementId, initialReturnLabel] as const;
}
