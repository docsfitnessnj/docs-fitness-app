import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useMembership } from '../context/MembershipContext';
import { colors, fonts } from '../theme';

// Corner toggle so the gym owner can preview Free vs Member without real payments.
export function MembershipToggle() {
  const { tier, toggleTier } = useMembership();
  const isMember = tier === 'member';

  return (
    <Pressable onPress={toggleTier} style={styles.wrapper} hitSlop={8}>
      <Text style={styles.label}>{isMember ? 'MEMBER' : 'FREE'}</Text>
      <View style={[styles.track, isMember && styles.trackOn]}>
        <View style={[styles.thumb, isMember && styles.thumbOn]} />
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
    color: colors.accent,
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    letterSpacing: 1,
    marginRight: 6,
  },
  track: {
    width: 40,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.locked,
    padding: 2,
    justifyContent: 'center',
  },
  trackOn: {
    backgroundColor: colors.highlight,
  },
  thumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.text,
  },
  thumbOn: {
    alignSelf: 'flex-end',
  },
});
