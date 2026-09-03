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
      // #root is pinned with position: fixed instead of being left as a
      // normal in-flow child of html/body — see the Round 5 comment above
      // the viewport-sync script in public/index.html for the full why.
      // In short: html/body are clipped to exactly the app's height for
      // the tab bar (overflow: hidden), so a normal-flow #root has
      // nowhere for iOS's keyboard-focus viewport pan to go and the whole
      // app scrolls up out of the clipped box. Fixed positioning takes
      // #root out of that box entirely (fixed elements aren't subject to
      // an ancestor's overflow clipping) so the translateY(--app-offset-top)
      // transform on #root in index.html can re-align it with the panned
      // visual viewport.
      root?.style.setProperty('position', 'fixed');
      root?.style.setProperty('top', '0');
      root?.style.setProperty('left', '0');
      root?.style.setProperty('right', '0');
      // Let index.html's CSS var-driven transform apply — it's what
      // re-aligns #root with the keyboard-panned visual viewport.
      root?.style.removeProperty('transform');
      return () => {
        root?.style.removeProperty('position');
        root?.style.removeProperty('top');
        root?.style.removeProperty('left');
        root?.style.removeProperty('right');
      };
    }

    targets.forEach((el) => {
      el.style.setProperty('height', 'auto');
      el.style.setProperty('min-height', '100%');
      el.style.setProperty('overflow', 'visible');
    });
    root?.style.removeProperty('position');
    root?.style.removeProperty('top');
    root?.style.removeProperty('left');
    root?.style.removeProperty('right');
    // index.html's #root rule applies transform: translateY(--app-offset-top)
    // unconditionally, but that compensation only makes sense for the
    // locked/fixed shell above — it exists to re-align a *fixed-position*
    // #root with the visual viewport's keyboard-open pan. Here #root is a
    // normal in-flow element inside the real document scroll, which
    // already tracks the visual viewport correctly on its own. Left
    // active, every visualViewport 'scroll' tick (which also fires during
    // iOS's native elastic/momentum scroll correction — e.g. right after
    // a page swap leaves the document shorter than the old scroll
    // position) rewrites --app-offset-top and yanks the whole page via
    // this transform, which is the vertical "shake" seen when a door
    // button on the About page swaps in a shorter screen. Pinning it to
    // 'none' here removes it from the equation entirely.
    root?.style.setProperty('transform', 'none');

    return () => {
      targets.forEach((el) => {
        el.style.removeProperty('height');
        el.style.removeProperty('min-height');
        el.style.removeProperty('overflow');
      });
      root?.style.removeProperty('transform');
    };
  }, [locked]);
}
