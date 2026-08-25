import { useEffect, useState } from 'react';

// Mirrors lib/scheduleModal.ts's module-level-ref pattern so any screen —
// the hamburger's "THE MOVEMENT VAULT" row, the WODs "LOOK UP A MOVEMENT"
// button, or a tapped movement name inside a WOD/deck card/challenge — can
// open the vault (optionally straight to one movement's detail view)
// without prop-drilling through React Navigation.
let openRef: ((movementId?: string) => void) | null = null;

export function openMovementVault(movementId?: string) {
  openRef?.(movementId);
}

export function useMovementVaultModalState() {
  const [open, setOpen] = useState(false);
  const [initialMovementId, setInitialMovementId] = useState<string | undefined>(undefined);

  useEffect(() => {
    openRef = (movementId) => {
      setInitialMovementId(movementId);
      setOpen(true);
    };
    return () => {
      openRef = null;
    };
  }, []);

  return [open, setOpen, initialMovementId] as const;
}
