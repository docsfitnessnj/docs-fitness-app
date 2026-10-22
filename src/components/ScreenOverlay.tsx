import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaTopFill } from './SafeAreaTopFill';
import { useTabBarHeight } from '../lib/tabBarHeight';
import { colors } from '../theme';

type Props = {
  visible: boolean;
  children: React.ReactNode;
  // The hamburger drawer is the one intentional exception to the persistent
  // tab bar rule: the tab bar hides itself while the drawer is open (see
  // App.tsx), so the drawer should cover that now-empty space instead of
  // leaving a gap where the bar used to be.
  fullBleed?: boolean;
  // Every screen this wraps reaches the true physical top of the screen
  // (see the SafeAreaTopFill it renders below), and almost all of them
  // open straight onto colors.background -- the one exception is the
  // hamburger drawer, whose own root is colors.green; passing that here
  // keeps the fill from painting a mismatched strip above it.
  topFillColor?: string;
  // Most screens this wraps were built pre-SafeAreaTopFill with a flat
  // `paddingTop: 60` of their own (clearing a hidden tab bar's worth of
  // chrome in ordinary browser chrome) -- see AGENTS.md's "Web safe-area
  // insets always report zero" writeup. Folding that same 60 into THIS
  // fill via a dedicated id/CSS rule, and deleting it from each of those
  // screens' own styles, keeps the real env(safe-area-inset-top) and the
  // flat breathing-room value as a SINGLE additive source instead of two
  // independently-sized boxes stacking in standalone mode (the "roughly
  // double" top-offset regression). Omit this for a screen that already
  // manages its own top spacing correctly (DOC'S GROUP CHAT) -- passing
  // it there would reintroduce the exact bug this is fixing.
  topBasePadding?: 60;
};

// A non-fullBleed secondary screen (Profile, My Workouts, Close Friends,
// the Boathouse schedule, Messages, and Search whenever its own keyboard is
// closed) stops just short of the bottom tab bar instead of covering it, so
// the tab bar stays visible and tappable underneath — the user can jump
// straight to another tab without first backing out. `fullBleed` covers the
// full shell instead (hamburger drawer, DOC'S GROUP CHAT always; Search
// only while its keyboard is open and the Round 17 shell can be resizing
// #root — see its own `fullBleed={keyboardVisible}` in App.tsx).
export function ScreenOverlay({ visible, children, fullBleed = false, topFillColor = colors.background, topBasePadding }: Props) {
  const tabBarHeight = useTabBarHeight();
  if (!visible) return null;

  return (
    <View
      // `tabBarHeight` alone is the tab bar's own box height -- it doesn't
      // include the SafeAreaBottomFill sibling stacked below it that
      // extends the bar's background through the real home-indicator inset
      // in standalone mode. Without the matching CSS override below (keyed
      // to this id, added via `calc()` the same way every other real-inset
      // addition in this app is), this box's own bottom edge would cut
      // through the middle of the real tab bar rather than stopping above
      // it entirely -- a real device confirmed this as a cropped-icons tab
      // bar on Movement Vault, the exact same shape of bug search's own
      // fullBleed fix solved for the keyboard-open case.
      nativeID={fullBleed ? undefined : 'screen-overlay-tab-bar-gap'}
      style={[
        StyleSheet.absoluteFill,
        { bottom: fullBleed ? 0 : tabBarHeight, zIndex: 500, backgroundColor: colors.background },
      ]}
    >
      <SafeAreaTopFill
        nativeID={topBasePadding === 60 ? 'screen-overlay-safe-top-60' : undefined}
        backgroundColor={topFillColor}
      />
      {children}
    </View>
  );
}
