import { useCallback, useState } from 'react';
import { colors } from '../theme';

// The app's own quiet replacement for the browser's default blue focus
// outline (killed globally in public/index.html): the field's container
// border shifts from the hairline to brand green at 1px, nothing else — no
// glow, no layout shift. Spread `onFocus`/`onBlur` onto the TextInput (or
// merge with an existing handler) and apply `borderColor` to whichever
// element actually carries the visible border.
export function useFocusRing() {
  const [focused, setFocused] = useState(false);
  const onFocus = useCallback(() => setFocused(true), []);
  const onBlur = useCallback(() => setFocused(false), []);
  return { focused, onFocus, onBlur, borderColor: focused ? colors.green : colors.hairline };
}
