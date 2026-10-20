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
};

// A full-bleed secondary screen (Profile, My Workouts, Close Friends, the
// Boathouse schedule, Messages, Search) that stops just short of the bottom
// tab bar instead of covering it, so the tab bar stays visible and tappable
// underneath — the user can jump straight to another tab without first
// backing out. Only truly transient overlays (the story viewer, the deck
// card detail popup) are allowed to cover the whole screen.
export function ScreenOverlay({ visible, children, fullBleed = false, topFillColor = colors.background }: Props) {
  const tabBarHeight = useTabBarHeight();
  if (!visible) return null;

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        { bottom: fullBleed ? 0 : tabBarHeight, zIndex: 500, backgroundColor: colors.background },
      ]}
    >
      <SafeAreaTopFill backgroundColor={topFillColor} />
      {children}
    </View>
  );
}
