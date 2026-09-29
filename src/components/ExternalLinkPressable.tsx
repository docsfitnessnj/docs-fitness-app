import React from 'react';
import { Insets, Linking, Platform, Pressable, StyleProp, ViewStyle } from 'react-native';
import { showAlert } from '../lib/alert';

type Props = {
  href: string;
  // Auxiliary side effect only (e.g. closing the hamburger drawer first, or
  // dismissing an upsell modal) — never responsible for opening the link
  // itself, and never blocks the tap from also opening it.
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  hitSlop?: Insets | number;
  fallbackTitle?: string;
  fallbackMessage?: string;
  children: React.ReactNode;
};

// A real <a target="_blank" rel="noopener noreferrer"> on web, not a
// Pressable that calls window.open() from onPress. iOS Safari's popup
// blocker only reliably allows a new tab when it's the browser's own
// synchronous reaction to a tap on a genuine anchor element — a Pressable's
// onPress goes through react-native-web's synthetic touch-responder
// pipeline first, which Safari doesn't treat as the same user gesture, and
// silently blocks the window it would have opened. That's why the previous
// window.open()-in-onPress fix worked in this dev sandbox but not on a real
// iPhone against the production build.
//
// react-native-web's Pressable/View already render a real <a> tag when
// given `href` (with `hrefAttrs` for target/rel), fully through the normal
// RN style system — no raw DOM escape hatch needed. Its press-responder
// only ever preventDefault()s a click for a long-press or text-selection
// gesture, never a plain tap, so the anchor's own default navigation still
// fires normally alongside `onPress`.
export function ExternalLinkPressable({
  href,
  onPress,
  style,
  testID,
  hitSlop,
  fallbackTitle = 'Sorry',
  fallbackMessage = "Couldn't open that link right now.",
  children,
}: Props) {
  if (Platform.OS === 'web') {
    const anchorProps = { href, hrefAttrs: { target: '_blank', rel: 'noopener noreferrer' } } as object;
    return (
      <Pressable style={style} testID={testID} hitSlop={hitSlop} onPress={onPress} {...anchorProps}>
        {children}
      </Pressable>
    );
  }
  return (
    <Pressable
      style={style}
      testID={testID}
      hitSlop={hitSlop}
      onPress={() => {
        onPress?.();
        Linking.openURL(href).catch(() => {
          showAlert(fallbackTitle, fallbackMessage);
        });
      }}
    >
      {children}
    </Pressable>
  );
}
