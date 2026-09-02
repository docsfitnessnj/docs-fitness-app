import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PostAuthorBadges } from './PostAuthorBadges';
import { useMembership } from '../context/MembershipContext';
import { useDisplayName } from '../context/ProfileContext';
import { openMemberships } from '../lib/membershipsModal';
import { colors, fonts } from '../theme';

// Pure display language layered on top of the existing access model — no
// new status concept, no new access rule. membership.fullContentAccess
// already IS the crew/dockside line (trial, online_paid, founding_50,
// in_person_unlimited, admin get it; online_free, ten_pack, drop_in, guest
// don't), so this just reads that existing flag and gives it a name.
export function StatusBanner() {
  const { fullContentAccess } = useMembership();
  const displayName = useDisplayName();

  if (fullContentAccess) {
    return (
      <View style={[styles.card, styles.crewCard]}>
        <Ionicons name="boat-outline" size={20} color={colors.green} />
        <View style={styles.textCol}>
          <Text style={styles.crewTitle}>YOU'RE PART OF THE CREW</Text>
          <Text style={styles.crewSubtitle}>FULL ACCESS</Text>
        </View>
        <View style={styles.badgesWrap}>
          <PostAuthorBadges author={displayName} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.docksideWrap}>
      <View style={[styles.card, styles.docksideCard]}>
        <Ionicons name="help-buoy-outline" size={20} color={colors.textMuted} />
        <View style={styles.textCol}>
          <Text style={styles.docksideTitle}>YOU'RE DOCKSIDE</Text>
          <Text style={styles.docksideSubtitle}>ONLY 2 DOC'S WODS A WEEK + COMMUNITY</Text>
        </View>
      </View>
      <Pressable style={styles.joinButton} onPress={() => openMemberships('unlock')} testID="status-banner-join-crew">
        <Text style={styles.joinButtonText}>JOIN THE CREW — FULL ACCESS</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  docksideWrap: {
    marginBottom: 16,
  },
  card: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  docksideCard: {
    backgroundColor: colors.card,
    borderColor: colors.hairline,
    marginBottom: 10,
  },
  crewCard: {
    backgroundColor: colors.card,
    borderColor: colors.green,
    marginBottom: 16,
  },
  textCol: {
    flexShrink: 0,
  },
  docksideTitle: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 20,
    letterSpacing: 0.5,
  },
  docksideSubtitle: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 13,
    letterSpacing: 0.8,
    marginTop: 2,
  },
  crewTitle: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 20,
    letterSpacing: 0.5,
  },
  crewSubtitle: {
    color: colors.green,
    fontFamily: fonts.labelSemiBold,
    fontSize: 13,
    letterSpacing: 0.8,
    marginTop: 2,
  },
  badgesWrap: {
    marginLeft: 'auto',
  },
  joinButton: {
    backgroundColor: colors.green,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  joinButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 14,
    letterSpacing: 1,
  },
});
