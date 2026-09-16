import { useEffect } from 'react';
import { Platform } from 'react-native';

// Web only: whenever a text field gets focus, scroll it into the center of
// the viewport once the on-screen keyboard has had a moment to open and
// resize the visual viewport. React Native Web renders every TextInput as a
// real <input>/<textarea>, so a single document-level listener covers every
// form in the app — no per-screen wiring needed. Mounted once, near the
// app's root (see App.tsx).
export function useScrollFocusedInputIntoView() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName;
      if (tag !== 'INPUT' && tag !== 'TEXTAREA') return;

      // Give the keyboard/viewport resize a moment to settle before
      // measuring where "into view" actually is.
      setTimeout(() => {
        target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 300);
    };

    document.addEventListener('focusin', handleFocusIn);
    return () => document.removeEventListener('focusin', handleFocusIn);
  }, []);
}
