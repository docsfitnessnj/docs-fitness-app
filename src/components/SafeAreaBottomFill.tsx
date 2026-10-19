import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';

type Props = {
  // Distinct per usage so each instance gets its own CSS rule in
  // index.html (one shared id would collide if more than one of these
  // were ever mounted at once).
  nativeID: string;
  backgroundColor: string;
};

// Web-only. Covers the gap between a fixed-height bottom bar/composer and
// the true physical bottom edge in an installed, standalone iPhone PWA,
// where env(safe-area-inset-bottom) is real and nonzero but
// react-native-web's own useSafeAreaInsets() always reports 0 -- there's no
// OS bridge feeding it on web, so JS-side inset math (insets.bottom) is
// silently wrong there even though it's correct on native. The real height
// comes from a plain CSS rule in index.html keyed to `nativeID`, not from
// any numeric style here, so it's 0 (invisible) in ordinary browser chrome
// and doesn't exist at all on native, where this component renders null and
// the real native insets.bottom already does the right thing.
export function SafeAreaBottomFill({ nativeID, backgroundColor }: Props) {
  if (Platform.OS !== 'web') return null;
  return <View nativeID={nativeID} style={[styles.fill, { backgroundColor }]} />;
}

const styles = StyleSheet.create({
  fill: {
    flexShrink: 0,
  },
});
