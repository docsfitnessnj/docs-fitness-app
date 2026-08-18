import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTabBarHeight } from '../lib/tabBarHeight';
import { colors } from '../theme';

type Props = {
  visible: boolean;
  children: React.ReactNode;
};

// A full-bleed secondary screen (Profile, My Workouts, Close Friends, the
// Boathouse schedule, Messages, Search) that stops just short of the bottom
// tab bar instead of covering it, so the tab bar stays visible and tappable
// underneath — the user can jump straight to another tab without first
// backing out. Only truly transient overlays (the story viewer, the deck
// card detail popup) are allowed to cover the whole screen.
export function ScreenOverlay({ visible, children }: Props) {
  const tabBarHeight = useTabBarHeight();
  if (!visible) return null;

  return (
    <View style={[StyleSheet.absoluteFill, { bottom: tabBarHeight, zIndex: 500, backgroundColor: colors.background }]}>
      {children}
    </View>
  );
}
