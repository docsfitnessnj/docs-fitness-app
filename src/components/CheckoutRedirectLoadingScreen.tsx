import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DocsBadge } from './brand/DocsBadge';
import { colors, fonts } from '../theme';

type Props = {
  message: string;
};

// The ONLY thing on screen for the whole span between "a Stripe redirect is
// about to happen" and "Stripe's page has actually loaded" (and, in
// reverse, between "back from a successful checkout" and "the purchase
// celebration is ready to show") — see AuthGatedProviders, which renders
// this INSTEAD OF MainApp/OnboardingFlow rather than layering it on top, so
// no member screen, paywall, or onboarding step is ever mounted underneath
// for even a single frame.
export function CheckoutRedirectLoadingScreen({ message }: Props) {
  return (
    <View style={styles.root} testID="checkout-redirect-loading">
      <DocsBadge variant="white" size={96} />
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
  message: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 13,
    letterSpacing: 1.2,
    marginTop: 22,
    textAlign: 'center',
  },
});
