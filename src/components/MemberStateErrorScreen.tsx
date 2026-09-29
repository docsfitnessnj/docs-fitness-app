import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DocsBadge } from './brand/DocsBadge';
import { colors, fonts } from '../theme';

type Props = {
  onRetry: () => void;
};

const BADGE_SIZE = 96;

// The fail-closed counterpart to CheckoutRedirectLoadingScreen — shown
// INSTEAD OF that loading screen, and instead of MainApp, the moment any of
// the three real-account reads ResponsiveShell gates on (subscription,
// profile, admin flag) comes back as an error rather than a success. Never
// silently falls through to MainApp on stale/default data — that silent
// fallthrough (loading flips false on error same as on success, with
// nothing checking which) is exactly what let a real Supabase failure look
// like "loaded, free plan, tour never seen" instead of "failed to load."
export function MemberStateErrorScreen({ onRetry }: Props) {
  return (
    <View style={styles.root} testID="member-state-error">
      <DocsBadge variant="white" size={BADGE_SIZE} />
      <Text style={styles.title}>COULDN'T LOAD YOUR ACCOUNT</Text>
      <Text style={styles.subtitle}>Check your connection and try again.</Text>
      <Pressable style={styles.retryButton} onPress={onRetry} testID="member-state-error-retry">
        <Text style={styles.retryButtonText}>RETRY</Text>
      </Pressable>
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
  title: {
    color: colors.text,
    fontFamily: fonts.labelBold,
    fontSize: 15,
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 22,
  },
  subtitle: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
  },
  retryButton: {
    backgroundColor: colors.green,
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 32,
    marginTop: 22,
  },
  retryButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 1,
  },
});
