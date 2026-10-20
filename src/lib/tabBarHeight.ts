import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Enough room for icon + active-dot + label without clipping the label's
// descenders, plus whatever the device's home-indicator safe area needs.
// Shared between the Tab.Navigator's own tabBarStyle and anything (like
// ScreenOverlay) that needs to know how tall the bar renders so it can
// leave that space clear instead of covering it.
//
// react-navigation's own bottom-tabs item bakes in ~10px of vertical
// padding (5px top + bottom) on top of whatever we set here, so the real
// budget is: our own top/bottom padding + that 10px + icon (22) + the
// active-dot indicator (~8) + the label line (~14). Cutting this too close
// clips the label to a sliver — verified by measuring the rendered DOM.
//
// Round 10 measured the rendered DOM precisely (see AGENTS.md's "Tab bar
// bottom density" section): at the old value of 74, the tab row
// (tablist, 62px after our own 6/6 top/bottom padding) was TALLER than
// what each tab item's own content actually needs (5px item padding + 28
// icon block + 13 label = 51px), because each item stretches to match the
// row's cross-axis height — the unused ~10px of leftover flex space
// landed below the label, not above it (the row is justify-content:
// flex-start), which is what actually made the bar look tall. 64
// shrinks the row to ~52px — just above that 51px floor, so content is
// never clipped — removing that dead space without touching the item's
// own padding, the icon, or the label.
export const TAB_BAR_CONTENT_HEIGHT = 64;

export function useTabBarHeight(): number {
  const insets = useSafeAreaInsets();
  return TAB_BAR_CONTENT_HEIGHT + insets.bottom;
}
