import React from 'react';
import { Platform, ScrollView, ScrollViewProps, StyleSheet, View } from 'react-native';

type Props = ScrollViewProps & {
  children: React.ReactNode;
};

// A drop-in ScrollView replacement for the pre-signup screens (About,
// Pricing, In-Person Plans — the ones reachable before there's a tab bar
// to anchor a screen-local scroller against). On native this renders a
// normal ScrollView, unchanged.
//
// On web it renders a plain View instead, so the browser's own document
// scroll takes over rather than a bounded inner scroller. Two documented
// iOS Safari issues motivate this:
//   - react-native-web #2835: iOS Safari mishandles a ScrollView used as
//     a screen's main scroll container (including failing to collapse
//     its own chrome), and the documented workaround is normal document
//     scrolling instead of a nested ScrollView.
//   - Shopify Polaris #8590: iOS WebKit can miscalculate a vh/dvh-derived
//     element height on-device in ways that never reproduce in desktop
//     browser devtools, clipping content at the wrong boundary.
// A plain View has no height/overflow of its own — it just grows with
// its content — so there's no bounded frame left for either bug to act
// on; App.tsx un-clips the ancestor chain (body/html/#root/mainColumn)
// to match whenever the pre-signup flow is showing.
//
// In-app screens (reached only after the tab bar exists) intentionally
// keep the original ScrollView-inside-a-fixed-viewport structure — that
// fixed frame is what makes the tab bar stay anchored to the bottom of
// the screen instead of scrolling away with the content.
export function WebScrollScreen({ style, contentContainerStyle, children, ...rest }: Props) {
  if (Platform.OS !== 'web') {
    return (
      <ScrollView style={style} contentContainerStyle={contentContainerStyle} {...rest}>
        {children}
      </ScrollView>
    );
  }

  return <View style={[styles.web, style, contentContainerStyle]}>{children}</View>;
}

const styles = StyleSheet.create({
  web: {
    flexGrow: 1,
    flexBasis: 0,
  },
});
