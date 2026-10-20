import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';

type Props = {
  // All instances share one id (duplicate DOM ids are harmless for a pure
  // CSS id-selector rule like this one -- every element gets the same
  // computed height independently), so new screens don't need an
  // index.html edit to pick it up.
  nativeID?: string;
  backgroundColor: string;
};

// Web-only. The top-edge counterpart of SafeAreaBottomFill -- covers the
// status bar / notch / Dynamic Island area in an installed, standalone
// iPhone PWA on any full-screen layout that doesn't render the main app
// top bar (which already handles this correctly via SafeAreaView). Same
// root cause as the bottom fill: react-native-web's useSafeAreaInsets()
// always reports 0 on web, so any screen relying on insets.top for this is
// silently wrong in standalone mode even though it's correct on native.
// The real height comes from a plain CSS rule in index.html keyed to
// `nativeID`, not from any numeric style here, so it's 0 (invisible) in
// ordinary browser chrome -- including regular Safari, where the URL bar
// already occupies that space -- and doesn't exist at all on native, where
// this component renders null.
export function SafeAreaTopFill({ nativeID = 'safe-area-top-fill', backgroundColor }: Props) {
  if (Platform.OS !== 'web') return null;
  return <View nativeID={nativeID} style={[styles.fill, { backgroundColor }]} />;
}

const styles = StyleSheet.create({
  fill: {
    flexShrink: 0,
  },
});
