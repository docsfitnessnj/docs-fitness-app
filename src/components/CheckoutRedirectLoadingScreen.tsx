import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { DocsBadge } from './brand/DocsBadge';
import { colors, fonts } from '../theme';

type Props = {
  message: string;
};

const BADGE_SIZE = 96;
const RING_SIZE = BADGE_SIZE + 22;
const RING_THICKNESS = 2;

// Final, authoritative — word for word, in this exact order, looping.
// Do not reword, reorder, trim, or add to this list.
const BRAND_LINES = [
  'STRONGER EVERY DAY',
  'BETTER EVERY DAY',
  'BETTER THAN YESTERDAY',
  'SHOW UP. PICK UP. REPEAT.',
  'THE BELL IS WAITING',
  'EARN YOUR SATURDAY',
  'FEEL BETTER. LOOK BETTER.',
  'ONE MORE REP',
  'LAST SET. BEST SET. ALWAYS',
];

const LINE_HOLD_MS = 2000;
const LINE_FADE_MS = 300;

// The ONLY thing on screen for the whole span between "a Stripe redirect is
// about to happen" and "Stripe's page has actually loaded" (and, in
// reverse, between "back from a successful checkout" and "the purchase
// celebration is ready to show") — see AuthGatedProviders, which renders
// this INSTEAD OF MainApp/OnboardingFlow rather than layering it on top, so
// no member screen, paywall, or onboarding step is ever mounted underneath
// for even a single frame.
//
// The single shared full-screen loading component for every screen-to-
// screen buffer in the app — any future one should reuse this rather than
// rolling its own, so the wait always looks identical: badge, spinner ring,
// cycling brand line, status message.
export function CheckoutRedirectLoadingScreen({ message }: Props) {
  const spin = useRef(new Animated.Value(0)).current;
  const lineOpacity = useRef(new Animated.Value(1)).current;
  const [lineIndex, setLineIndex] = useState(0);

  useEffect(() => {
    const spinLoop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 2600,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    spinLoop.start();
    return () => spinLoop.stop();
  }, [spin]);

  useEffect(() => {
    // Whatever line is current when this mounts is just shown as-is — this
    // interval only ever advances the line going forward; it never delays
    // or extends how long the loading screen itself stays up.
    let cancelled = false;
    const timer = setInterval(() => {
      Animated.timing(lineOpacity, {
        toValue: 0,
        duration: LINE_FADE_MS,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }).start(() => {
        if (cancelled) return;
        setLineIndex((i) => (i + 1) % BRAND_LINES.length);
        Animated.timing(lineOpacity, {
          toValue: 1,
          duration: LINE_FADE_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }).start();
      });
    }, LINE_HOLD_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [lineOpacity]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={styles.root} testID="checkout-redirect-loading">
      <View style={styles.badgeWrap}>
        <View style={styles.spinnerTrack} pointerEvents="none" />
        <Animated.View
          style={[styles.spinnerArc, { transform: [{ rotate }] }]}
          pointerEvents="none"
          testID="checkout-redirect-spinner-arc"
        />
        <DocsBadge variant="white" size={BADGE_SIZE} />
      </View>
      <Animated.Text style={[styles.brandLine, { opacity: lineOpacity }]} testID="checkout-redirect-brand-line">
        {BRAND_LINES[lineIndex]}
      </Animated.Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: '100%',
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  badgeWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // A faint, always-on ring — the "track" the bright arc travels around.
  spinnerTrack: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: RING_THICKNESS,
    borderColor: 'rgba(229, 184, 11, 0.16)',
  },
  // Only the top edge is colored — the rest of the border is transparent —
  // so rotating this whole ring reads as a single short gold arc orbiting
  // the badge, not a pulsing or bouncing shape.
  spinnerArc: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: RING_THICKNESS,
    borderColor: 'transparent',
    borderTopColor: colors.gold,
  },
  brandLine: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 12,
    letterSpacing: 2,
    textAlign: 'center',
    textTransform: 'uppercase',
    marginTop: 22,
  },
  message: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 13,
    letterSpacing: 1.2,
    marginTop: 10,
    textAlign: 'center',
  },
});
