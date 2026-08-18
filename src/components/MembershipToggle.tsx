import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MembershipTier, useMembership } from '../context/MembershipContext';
import { colors, fonts } from '../theme';

// Dev-only preview control — cycles NON-MEMBER -> MEMBER -> ADMIN PREVIEW on
// tap. The full access-matrix logic (online tiers, in-person tiers, guest)
// stays intact in MembershipContext; this just gives testers one obvious
// lever instead of cycling every named state. Admin preview exists so
// admin-only surfaces (e.g. the community post menu's Pin/Unpin) can
// actually be reached and verified without a real Doc account.
const CYCLE: MembershipTier[] = ['guest', 'online_paid', 'admin'];

export function MembershipToggle() {
  const { tier, setDevTier } = useMembership();
  const index = CYCLE.indexOf(tier);
  const safeIndex = index === -1 ? 0 : index;

  const cycle = () => setDevTier(CYCLE[(safeIndex + 1) % CYCLE.length]);

  const isAdminPreview = tier === 'admin';
  const isOn = safeIndex > 0;
  const label = isAdminPreview ? 'ADMIN PREVIEW' : isOn ? 'MEMBER' : 'NON-MEMBER';
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
