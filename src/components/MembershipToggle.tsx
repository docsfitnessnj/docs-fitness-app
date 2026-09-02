import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useMembership } from '../context/MembershipContext';
import { colors, fonts } from '../theme';

type Membership = ReturnType<typeof useMembership>;

// Dev-only preview control — cycles through the states that matter for
// testing on tap. The full access-matrix logic stays intact in
// MembershipContext; this just gives testers one obvious lever instead of
// cycling every named state. Covers every Dockside status-banner variant
// (first-time visitor, free tier, 10-Class Pack with its live count, Drop
// In), both Crew tiers that matter for booking (online, in-person
// unlimited), and Admin.
//
// FIRST VISIT and FREE TIER are both tier === 'online_free' under the
// hood — they're told apart by hasEverTrialed, which is why `matches` and
// `apply` are separate per-step functions rather than a plain tier list.
type Step = {
  label: string;
  matches: (m: Membership) => boolean;
  apply: (m: Membership) => void;
};

const STEPS: Step[] = [
  {
    label: 'FIRST VISIT',
    matches: (m) => m.tier === 'online_free' && !m.hasEverTrialed,
    apply: (m) => m.previewFirstTimeVisitor(),
  },
  {
    label: 'FREE TIER',
    matches: (m) => m.tier === 'online_free' && m.hasEverTrialed,
    apply: (m) => m.setDevTier('online_free'),
  },
  {
    label: '10-PACK',
    matches: (m) => m.tier === 'ten_pack',
    apply: (m) => m.setDevTier('ten_pack'),
  },
  {
    label: 'DROP IN',
    matches: (m) => m.tier === 'drop_in',
    apply: (m) => m.setDevTier('drop_in'),
  },
  {
    label: 'ONLINE MEMBER',
    matches: (m) => m.tier === 'online_paid',
    apply: (m) => m.setDevTier('online_paid'),
  },
  {
    label: 'UNLIMITED',
    matches: (m) => m.tier === 'in_person_unlimited',
    apply: (m) => m.setDevTier('in_person_unlimited'),
  },
  {
    label: 'ADMIN PREVIEW',
    matches: (m) => m.tier === 'admin',
    apply: (m) => m.setDevTier('admin'),
  },
];

export function MembershipToggle() {
  const membership = useMembership();
  const index = STEPS.findIndex((step) => step.matches(membership));
  const safeIndex = index === -1 ? 0 : index;

  const cycle = () => STEPS[(safeIndex + 1) % STEPS.length].apply(membership);

  const isAdminPreview = membership.tier === 'admin';
  const isOn = safeIndex > 0;
  const label = STEPS[safeIndex].label;
  const labelColor = isAdminPreview ? colors.scoreboardRed : isOn ? colors.goldBright : 'rgba(255,255,255,0.85)';

  return (
    <Pressable onPress={cycle} style={styles.wrapper} hitSlop={8} testID="dev-tier-toggle">
      <Text style={styles.caption}>PREVIEW</Text>
      <View style={[styles.track, isOn && styles.trackOn, isAdminPreview && styles.trackAdmin]}>
        <View style={[styles.thumb, isOn && styles.thumbOn]} />
      </View>
      <Text style={[styles.label, { color: labelColor }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  caption: {
    color: 'rgba(255,255,255,0.6)',
    fontFamily: fonts.labelSemiBold,
    fontSize: 10,
    letterSpacing: 1,
    marginRight: 8,
  },
  track: {
    width: 36,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.25)',
    padding: 2,
    justifyContent: 'center',
    marginRight: 8,
  },
  trackOn: {
    backgroundColor: colors.goldBright,
  },
  trackAdmin: {
    backgroundColor: colors.scoreboardRed,
  },
  thumb: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.white,
  },
  thumbOn: {
    alignSelf: 'flex-end',
  },
  label: {
    fontFamily: fonts.labelBold,
    fontSize: 12,
    letterSpacing: 0.5,
  },
});
