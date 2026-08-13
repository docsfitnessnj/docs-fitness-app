import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MembershipTier, useMembership } from '../context/MembershipContext';
import { colors, fonts } from '../theme';

const ORDER: MembershipTier[] = ['trial', 'member', 'free'];

const LABEL: Record<MembershipTier, string> = {
  trial: 'TRIAL',
  member: 'MEMBER',
  free: 'FREE',
};

const TIER_COLOR: Record<MembershipTier, string> = {
  trial: colors.accent,
  member: colors.highlight,
  free: colors.textMuted,
};

// Dev-only 3-state switch so the gym owner can preview Trial / Member / Free (expired)
// without a real signup or payment.
export function MembershipToggle() {
  const { tier, setDevTier } = useMembership();

  const cycle = () => {
    const nextIndex = (ORDER.indexOf(tier) + 1) % ORDER.length;
    setDevTier(ORDER[nextIndex]);
  };

  return (
    <Pressable onPress={cycle} style={styles.wrapper} hitSlop={8}>
      <Text style={[styles.label, { color: TIER_COLOR[tier] }]}>{LABEL[tier]}</Text>
      <View style={styles.track}>
        {ORDER.map((t) => (
          <View
            key={t}
            style={[styles.dot, t === tier && { backgroundColor: TIER_COLOR[tier] }]}
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
    alignItems: 'center',
    backgroundColor: colors.locked,
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingVertical: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.background,
    marginHorizontal: 2,
  },
});
