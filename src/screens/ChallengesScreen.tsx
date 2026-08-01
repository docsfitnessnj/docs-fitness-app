import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../components/ScreenContainer';
import { colors, fonts } from '../theme';

// Challenges is always visible, even on the Free tier.
export default function ChallengesScreen() {
  return (
    <ScreenContainer>
      <View style={styles.card}>
        <View style={styles.badge}>
          <Ionicons name="flame" size={16} color={colors.background} />
          <Text style={styles.badgeText}>ACTIVE CHALLENGE</Text>
        </View>

        <Text style={styles.cardHeadline}>SWING CHALLENGE</Text>
        <Text style={styles.cardSubtext}>
          Rack up as many kettlebell swings as you can this month. No shortcuts, no excuses.
        </Text>

        <View style={styles.progressTrack}>
          <View style={styles.progressFill} />
        </View>
        <Text style={styles.progressText}>0 / 1,000 SWINGS</Text>

        <View style={styles.divider} />

        <Text style={styles.sectionLabel}>DAYS LEFT</Text>
        <Text style={styles.daysLeft}>30</Text>
      </View>

      <Text style={styles.footerNote}>Free accounts can join Challenges. Everything else is for Members.</Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.backgroundLight,
    borderRadius: 12,
    padding: 20,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.highlight,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 12,
  },
  badgeText: {
    color: colors.background,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 1,
    marginLeft: 6,
  },
  cardHeadline: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 40,
    letterSpacing: 1,
  },
  cardSubtext: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 16,
    marginTop: 8,
    lineHeight: 20,
  },
  progressTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.locked,
    marginTop: 20,
    overflow: 'hidden',
  },
  progressFill: {
    width: '0%',
    height: '100%',
    backgroundColor: colors.accent,
  },
  progressText: {
    color: colors.accent,
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    letterSpacing: 1,
    marginTop: 8,
  },
  divider: {
    height: 1,
    backgroundColor: colors.locked,
    marginVertical: 16,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    letterSpacing: 1,
  },
  daysLeft: {
    color: colors.highlight,
    fontFamily: fonts.headline,
    fontSize: 32,
  },
  footerNote: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 20,
  },
});
