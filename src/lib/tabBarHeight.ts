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
export const TAB_BAR_CONTENT_HEIGHT = 74;

export function useTabBarHeight(): number {
  const insets = useSafeAreaInsets();
  return TAB_BAR_CONTENT_HEIGHT + insets.bottom;
}
