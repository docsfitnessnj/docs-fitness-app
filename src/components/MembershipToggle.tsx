import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useMembership, MembershipTier } from '../context/MembershipContext';
import { colors, fonts } from '../theme';

const TIERS: { key: MembershipTier; label: string; color: string }[] = [
  { key: 'trial', label: 'TRIAL', color: colors.accent },
  { key: 'member', label: 'MEMBER', color: colors.highlight },
  { key: 'free', label: 'FREE', color: colors.textMuted },
];

// Dev-only corner control: cycles TRIAL -> MEMBER -> FREE (expired) so the gym
// owner can preview every access state without a real trial or payment.
export function MembershipToggle() {
  const { tier, cycleTier } = useMembership();
  const active = TIERS.find((t) => t.key === tier) ?? TIERS[0];

  return (
    <Pressable onPress={cycleTier} style={styles.wrapper} hitSlop={8}>
      <Text style={[styles.label, { color: active.color }]}>{active.label}</Text>
      <View style={styles.track}>
        {TIERS.map((t) => (
          <View
            key={t.key}
            style={[styles.dot, { backgroundColor: t.key === tier ? t.color : colors.locked }]}
          />
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    letterSpacing: 1,
    marginRight: 6,
  },
  track: {
    flexDirection: 'row',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 3,
  },
});
