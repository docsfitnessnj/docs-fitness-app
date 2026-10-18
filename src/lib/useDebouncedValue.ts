import { useEffect, useState } from 'react';

// Returns `value`, but only after it's stopped changing for `delayMs` —
// used by GifPicker.tsx to turn "a member typing a whole word" into one
// settled search request instead of one per keystroke.
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
