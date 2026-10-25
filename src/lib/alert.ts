import { useEffect, useState } from 'react';

// React Native Web's Alert.alert() is a no-op stub — it never shows anything and
// never invokes button callbacks. This is a drop-in replacement (same call shape)
// backed by a real Modal via <AlertHost />, so confirmation flows work on web too.
export type AlertButton = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

type AlertState = { title: string; message?: string; buttons: AlertButton[] } | null;

let setStateRef: ((state: AlertState) => void) | null = null;

export function showAlert(title: string, message?: string, buttons: AlertButton[] = [{ text: 'OK' }]) {
  setStateRef?.({ title, message, buttons });
}

// Round 31: this module-level state is independent of auth state by
// design (AlertHost is mounted once near the app root, above the signed
// in/out branch, so showAlert() works no matter which screen is up) --
// but that also means signing out never clears whatever alert happened
// to be showing. Call this from AuthContext's signOut() so a free-tier
// upgrade nudge (or any other showAlert() call) can never survive onto
// the signed-out welcome screen.
export function dismissAlert() {
  setStateRef?.(null);
}

export function useAlertState() {
  const [state, setState] = useState<AlertState>(null);
  useEffect(() => {
    setStateRef = setState;
    return () => {
      setStateRef = null;
    };
  }, []);
  return [state, setState] as const;
}
