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
