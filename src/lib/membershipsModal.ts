import { useEffect, useState } from 'react';

// Mirrors lib/scheduleModal.ts's module-level-ref pattern — lets the
// desktop identity sidebar's JOIN THE BOATHOUSE prompt (which renders
// outside MainApp's tree entirely) open the Memberships screen without
// prop-drilling a callback down through ResponsiveShell.
let setOpenRef: ((open: boolean) => void) | null = null;

export function openMemberships() {
  setOpenRef?.(true);
}

export function useMembershipsModalState() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpenRef = setOpen;
    return () => {
      setOpenRef = null;
    };
  }, []);
  return [open, setOpen] as const;
}
