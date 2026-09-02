import { useEffect } from 'react';
import { Platform } from 'react-native';

// Toggles between two page-scroll models on web:
//
// "Locked" (signed in, tab bar showing): html/body/#root stay pinned to
// exactly the visible viewport height (the CSS in public/index.html),
// and the one screen currently on top scrolls internally via its own
// ScrollView. That fixed frame is what keeps the tab bar anchored to
// the bottom of the screen instead of scrolling away with content.
//
// "Natural" (pre-signup — About, Pricing, In-Person Plans, and anything
// else reached before there's a tab bar to anchor): html/body/#root are
// un-clipped so the browser's own document scroll takes over instead of
// a bounded inner scroller. See WebScrollScreen.tsx for why — this is
// the other half of that fix, since freeing the screen's own ScrollView
// only works if nothing above it in the DOM is still clipping to a
// fixed height.
//
// Implemented as inline style overrides (which win over the stylesheet
// unconditionally) rather than editing public/index.html's CSS directly,
// since which mode applies depends on React state (signedUp).
export function useWebDocumentScroll(locked: boolean) {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const root = document.getElementById('root');
    const targets = [document.documentElement, document.body, root].filter(
      (el): el is HTMLElement => el != null
    );

    if (locked) {
      targets.forEach((el) => {
        el.style.removeProperty('height');
        el.style.removeProperty('min-height');
        el.style.removeProperty('overflow');
      });
      return;
    }

    targets.forEach((el) => {
      el.style.setProperty('height', 'auto');
      el.style.setProperty('min-height', '100%');
      el.style.setProperty('overflow', 'visible');
    });

    return () => {
      targets.forEach((el) => {
        el.style.removeProperty('height');
        el.style.removeProperty('min-height');
        el.style.removeProperty('overflow');
      });
    };
  }, [locked]);
}
