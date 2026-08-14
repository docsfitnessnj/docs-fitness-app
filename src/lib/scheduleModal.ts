import { useEffect, useState } from 'react';

// Mirrors lib/alert.ts's module-level-ref pattern so any screen (Community's
// "SEE FULL SCHEDULE" link, the hamburger's "BOATHOUSE SCHEDULE" row) can open
// the Full Schedule screen without prop-drilling through React Navigation.
let setOpenRef: ((open: boolean) => void) | null = null;

export function openFullSchedule() {
  setOpenRef?.(true);
}

export function useScheduleModalState() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpenRef = setOpen;
    return () => {
      setOpenRef = null;
    };
  }, []);
  return [open, setOpen] as const;
}
