import { useEffect, useRef, useState } from 'react';

export type SaveConfirmationState = 'idle' | 'pending' | 'saved' | 'error';

const SAVED_DISPLAY_MS = 2500;

// One small reusable "did this data-changing action actually go through"
// state machine — the app-wide rule is that every save/write confirms,
// never silently and never optimistically before the write really
// succeeds. Screens that already show their own failure alert can just
// drive `saved`/`pending` off this and keep their existing alert as the
// error state; screens with no error handling yet can use `error`/
// `errorMessage` too. Pair with <SaveConfirmation /> to render it.
export function useSaveConfirmation() {
  const [state, setState] = useState<SaveConfirmationState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    []
  );

  const start = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setErrorMessage(null);
    setState('pending');
  };

  const succeed = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setState('saved');
    timeoutRef.current = setTimeout(() => setState('idle'), SAVED_DISPLAY_MS);
  };

  const fail = (message?: string | null) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setErrorMessage(message ?? null);
    setState('error');
  };

  const reset = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setErrorMessage(null);
    setState('idle');
  };

  return { state, errorMessage, start, succeed, fail, reset };
}
