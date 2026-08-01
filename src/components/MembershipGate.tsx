import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMembership } from '../context/MembershipContext';
import { colors, fonts } from '../theme';

type Props = {
  featureName: string;
  children: React.ReactNode;
};

// Wraps a tab's content. Free tier sees a grayed-out lock screen with an Unlock button
// instead of the real feature. Member tier sees the real content.
export function MembershipGate({ featureName, children }: Props) {
  const { isMember } = useMembership();

  if (isMember) {
    return <>{children}</>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.lockCircle}>
        <Ionicons name="lock-closed" size={40} color={colors.textMuted} />
      </View>
      <Text style={styles.heading}>{featureName.toUpperCase()} IS LOCKED</Text>
      <Text style={styles.subtext}>
        Members get full access to {featureName}. Free accounts can preview Challenges only.
      </Text>
      <Pressable
        style={styles.unlockButton}
        onPress={() =>
          Alert.alert('Unlock Membership', 'Membership purchases are coming soon.')
        }
      >
        <Text style={styles.unlockButtonText}>UNLOCK</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  lockCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.locked,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  heading: {
    color: colors.textMuted,
    fontFamily: fonts.headline,
    fontSize: 24,
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: 10,
  },
  subtext: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  unlockButton: {
    backgroundColor: colors.highlight,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  unlockButtonText: {
    color: colors.background,
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    letterSpacing: 1,
  },
});
