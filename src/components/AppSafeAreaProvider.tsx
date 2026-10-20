import React from 'react';
import { Dimensions, Platform } from 'react-native';
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  SafeAreaProvider,
  type EdgeInsets,
} from 'react-native-safe-area-context';

const ZERO_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

// react-native-safe-area-context's web implementation is NOT inert. Its
// NativeSafeAreaProvider.web.tsx appends a hidden, position:fixed probe
// div to document.body whose padding is set to env(safe-area-inset-*) (or
// the older constant(...) syntax), watches its CSS transition for when
// that resolves, reads the real computed padding in pixels, and pushes it
// through SafeAreaInsetsContext to every useSafeAreaInsets() caller and
// every <SafeAreaView> -- live, and genuinely updating on resize.
//
// In ordinary desktop/mobile browser testing (no notch, no home
// indicator) that measurement is 0, which is what made two previous
// rounds conclude the library "resolves to a literal 0 on web" and is
// therefore safe to combine with this app's own SafeAreaTopFill /
// SafeAreaBottomFill. On a REAL installed standalone iPhone, the probe
// measures the REAL inset and feeds it to every consumer
// (AppTopBar's <SafeAreaView edges={['top']}>, the tab bar's
// `Math.max(insets.bottom, 6)`, useTabBarHeight, DocThreadView's and
// DocsGroupChatScreen's composer padding, ...) at the exact same time
// this app's own fills add it again -- the actual root cause of the
// "roughly double" top offset and the bottom dead zone, confirmed by
// grepping the production bundle: "safe-area-inset-top" appears in it,
// built at runtime via a template literal (env name + "(safe-area-inset-"
// + side + ")"), which is exactly why a static grep for the literal text
// "env(safe-area-inset" never found it, and why forcing our OWN CSS rules
// in the Playwright suite never exercised it (the suite's forced styles
// don't touch the library's own independently-created probe element).
//
// Neutralized here, once, at the single choke point every current and
// future consumer goes through: on web, this renders the library's real
// context values pinned to zero PERMANENTLY, bypassing
// SafeAreaProvider/NativeSafeAreaProvider (and its probe) entirely, so
// useSafeAreaInsets()/<SafeAreaView> contribute exactly nothing on web --
// by construction, not by accident of the test environment. The ONE
// sanctioned source of the real inset on web is now --real-safe-top /
// --real-safe-bottom (see public/index.html), which every one of this
// app's own fills consumes. Native (iOS/Android) renders the library's
// real SafeAreaProvider completely unchanged -- real native insets still
// apply exactly as before.
export function AppSafeAreaProvider({ children }: { children: React.ReactNode }) {
  if (Platform.OS !== 'web') {
    return <SafeAreaProvider>{children}</SafeAreaProvider>;
  }

  const { width, height } = Dimensions.get('window');
  return (
    <SafeAreaFrameContext.Provider value={{ x: 0, y: 0, width, height }}>
      <SafeAreaInsetsContext.Provider value={ZERO_INSETS}>{children}</SafeAreaInsetsContext.Provider>
    </SafeAreaFrameContext.Provider>
  );
}
