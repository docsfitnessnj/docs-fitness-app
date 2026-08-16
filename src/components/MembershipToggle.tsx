import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DEV_PREVIEW_TIERS, MembershipTier, useMembership } from '../context/MembershipContext';
import { colors, fonts } from '../theme';

const LABEL: Record<MembershipTier, string> = {
  trial: 'TRIAL',
  online_paid: 'ONLINE PAID',
  in_person_unlimited: 'IN-PERSON',
  online_free: 'ONLINE FREE',
  ten_pack: '10-PACK',
  drop_in: 'DROP-IN',
  guest: 'GUEST',
  admin: 'ADMIN',
};

const TIER_COLOR: Record<MembershipTier, string> = {
  trial: colors.green,
  online_paid: colors.green,
  in_person_unlimited: colors.green,
  online_free: colors.textMuted,
  ten_pack: colors.textMuted,
  drop_in: colors.textMuted,
  guest: colors.textMuted,
  admin: colors.gold,
};

// Dev-only 5-state switch so the gym owner can preview Admin / Online Paid /
// In-Person Unlimited / Online Free / Guest without a real signup or payment.
export function MembershipToggle() {
  const { tier, setDevTier } = useMembership();
  const previewIndex = DEV_PREVIEW_TIERS.indexOf(tier);

  const cycle = () => {
    const nextIndex = (Math.max(previewIndex, 0) + 1) % DEV_PREVIEW_TIERS.length;
    setDevTier(DEV_PREVIEW_TIERS[nextIndex]);
  };

  return (
    <Pressable onPress={cycle} style={styles.wrapper} hitSlop={8} testID="dev-tier-toggle">
      <Text style={[styles.label, { color: TIER_COLOR[tier] }]}>{LABEL[tier]}</Text>
      <View style={styles.track}>
        {DEV_PREVIEW_TIERS.map((t) => (
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
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  label: {
    fontFamily: fonts.labelSemiBold,
    fontSize: 10,
    letterSpacing: 0.8,
    marginRight: 6,
  },
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingVertical: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.hairline,
    marginHorizontal: 2,
  },
});
