import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useMembership } from '../context/MembershipContext';
import { colors, fonts } from '../theme';

// Dev-only preview control, simplified to a single MEMBER / NON-MEMBER
// switch — the full access-matrix logic (admin, online tiers, in-person
// tiers, guest) stays intact in MembershipContext; this just gives testers
// one obvious lever instead of cycling five named states. Admin is no
// longer previewable here — it's tied to Doc's own account in the real
// access logic, not something anyone can switch into.
export function MembershipToggle() {
  const { fullContentAccess, setDevTier } = useMembership();

  const toggle = () => setDevTier(fullContentAccess ? 'guest' : 'online_paid');

  return (
    <Pressable onPress={toggle} style={styles.wrapper} hitSlop={8} testID="dev-tier-toggle">
      <Text style={styles.caption}>PREVIEW</Text>
      <View style={[styles.track, fullContentAccess && styles.trackOn]}>
        <View style={[styles.thumb, fullContentAccess && styles.thumbOn]} />
      </View>
      <Text style={[styles.label, { color: fullContentAccess ? colors.goldBright : 'rgba(255,255,255,0.85)' }]}>
        {fullContentAccess ? 'MEMBER' : 'NON-MEMBER'}
      </Text>
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
