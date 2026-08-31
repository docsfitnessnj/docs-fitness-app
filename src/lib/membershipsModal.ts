import { useEffect, useState } from 'react';

// Mirrors lib/scheduleModal.ts's module-level-ref pattern — lets the
// desktop identity sidebar's JOIN THE BOATHOUSE prompt (which renders
// outside MainApp's tree entirely) open the Memberships screen without
// prop-drilling a callback down through ResponsiveShell.

// 'unlock' filters the screen down to just the three plans that grant full
// app access (the two online plans + Monthly Unlimited) — every locked-state
// prompt in the app (a gated tab, a locked WOD day, a locked story) opens in
// this mode so the choice in front of the member is never muddied by 10
// Class Pack / Drop In, neither of which unlock anything. 'all' is the
// full plan list, for browsing/switching from Settings or the hamburger menu.
export type MembershipsModalMode = 'all' | 'unlock';

let setOpenRef: ((open: boolean) => void) | null = null;
let setModeRef: ((mode: MembershipsModalMode) => void) | null = null;

export function openMemberships(mode: MembershipsModalMode = 'all') {
  setModeRef?.(mode);
  setOpenRef?.(true);
}

export function useMembershipsModalState() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<MembershipsModalMode>('all');
  useEffect(() => {
    setOpenRef = setOpen;
    setModeRef = setMode;
    return () => {
      setOpenRef = null;
      setModeRef = null;
    };
  }, []);
  return [open, setOpen, mode] as const;
}
