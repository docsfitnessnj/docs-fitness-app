import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { showAlert } from '../lib/alert';
import { startOnlineCheckout } from '../lib/stripeCheckout';
import { colors, fonts } from '../theme';

type Props = {
  onBack: () => void;
  onSkipToPricing: () => void;
};

export default function OnlineStartScreen({ onBack, onSkipToPricing }: Props) {
  const [starting, setStarting] = useState(false);

  // Goes straight to Stripe Checkout for Monthly (Online) — the founding
  // vs. standard price is decided for real, server-side — with the 14-day
  // trial attached. "Skip the trial — see pricing" is for a member who'd
  // rather pick Annual specifically instead of defaulting to Monthly.
  const startTrial = async () => {
    setStarting(true);
    const { error } = await startOnlineCheckout('monthly');
    setStarting(false);
    if (error) showAlert("Couldn't Start Checkout", error);
  };

  return (
    <View style={styles.container}>
      <Pressable onPress={onBack} hitSlop={8} style={styles.backButton} testID="online-start-back">
        <Ionicons name="chevron-back" size={20} color={colors.text} />
        <Text style={styles.backText}>BACK</Text>
      </Pressable>

      <View style={styles.content}>
        <Text style={styles.title}>2 WEEKS FREE,{'\n'}ON US</Text>
        <Text style={styles.subtext}>
          Full access to Doc's WODs, COWS, The Deck, and Community. Card required to start — you won't be charged
          until your trial ends, and you can cancel anytime.
        </Text>

        <Pressable style={styles.trialButton} onPress={startTrial} disabled={starting} testID="start-trial">
          {starting ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.trialButtonText}>START MY 2-WEEK FREE TRIAL</Text>
          )}
        </Pressable>

        <Pressable onPress={onSkipToPricing} hitSlop={8} style={styles.skipLink} testID="skip-to-pricing">
          <Text style={styles.skipLinkText}>Skip the trial — see pricing</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 24,
    paddingTop: 60,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  backText: {
    color: colors.text,
    fontFamily: fonts.labelSemiBold,
    fontSize: 14,
    letterSpacing: 1,
    marginLeft: 2,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 42,
    lineHeight: 44,
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: 14,
  },
  subtext: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 32,
  },
  trialButton: {
    backgroundColor: colors.green,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
  },
  trialButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 15,
    letterSpacing: 1,
  },
  skipLink: {
    alignItems: 'center',
    marginTop: 24,
  },
  skipLinkText: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
