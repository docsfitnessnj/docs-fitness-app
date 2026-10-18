import { useEffect, useRef, useState } from 'react';

export type ActionStatus = 'idle' | 'busy' | 'completed';

// The one shared "SAVED / POSTED" pattern for every one-time-action button
// in the app (save, post, submit, book, ...) — run() calls the real
// action, and on success swaps the button into a brief `completed` status
// the caller renders as its own past-tense label + a small check (no
// emojis) for ~900ms before settling back to idle, or — for an action that
// closes a sheet or navigates on success — before calling the optional
// `onSettled` callback, so the acknowledgment is what the member actually
// sees happen before the screen moves on, not something that gets skipped
// because the screen was already gone. `action` returning `false`
// (distinct from throwing) means "didn't actually happen, don't
// celebrate" — e.g. a client-side validation guard — and goes straight
// back to idle with no flash and no onSettled call. A thrown error does
// the same; the action itself is responsible for surfacing what went
// wrong (showAlert etc.), this hook only ever tracks whether to show the
// acknowledgment, never duplicates error UI.
export function useActionCompletion(durationMs = 900) {
  const [status, setStatus] = useState<ActionStatus>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(
    () => () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  const run = async (action: () => Promise<boolean | void> | boolean | void, onSettled?: () => void) => {
    if (status === 'busy') return;
    setStatus('busy');
    let succeeded = true;
    try {
      const result = await action();
      succeeded = result !== false;
    } catch {
      succeeded = false;
    }
    if (!mountedRef.current) return;
    if (!succeeded) {
      setStatus('idle');
      return;
    }
    setStatus('completed');
    timerRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      setStatus('idle');
      onSettled?.();
    }, durationMs);
  };

  return { status, run, busy: status === 'busy', completed: status === 'completed' };
}
