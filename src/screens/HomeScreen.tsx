import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { MembershipGate } from '../components/MembershipGate';
import { colors, fonts, TAGLINE } from '../theme';

function WodOfTheDay() {
  return (
    <View>
      <Text style={styles.tagline}>{TAGLINE}</Text>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>TODAY'S WOD</Text>
        <Text style={styles.cardHeadline}>THE GAUNTLET</Text>

        <View style={styles.divider} />

        <WodRow label="5 ROUNDS" />
        <WodRow label="10 Kettlebell Swings" />
        <WodRow label="10 Goblet Squats" />
        <WodRow label="10 Push-Ups" />
        <WodRow label="200m Run" />

        <View style={styles.divider} />

        <Text style={styles.cardMeta}>Scale weight as needed. Rest 2 min between rounds.</Text>
      </View>

      <View style={styles.statsRow}>
        <StatBox value="0" label="STREAK" />
        <StatBox value="--:--" label="LAST TIME" />
        <StatBox value="0" label="WODS DONE" />
      </View>
    </View>
  );
}

function WodRow({ label }: { label: string }) {
  return (
    <View style={styles.wodRow}>
      <View style={styles.bullet} />
      <Text style={styles.wodRowText}>{label}</Text>
    </View>
  );
}

function StatBox({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function HomeScreen() {
  return (
    <ScreenContainer>
      <MembershipGate featureName="Home">
        <WodOfTheDay />
      </MembershipGate>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  tagline: {
    color: colors.highlight,
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    letterSpacing: 1,
    marginBottom: 20,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: colors.backgroundLight,
    borderRadius: 12,
    padding: 20,
  },
  cardLabel: {
    color: colors.accent,
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    letterSpacing: 2,
  },
  cardHeadline: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 36,
    letterSpacing: 1,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.locked,
    marginVertical: 14,
  },
  wodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  bullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.highlight,
    marginRight: 10,
  },
  wodRowText: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 18,
  },
  cardMeta: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.backgroundLight,
    borderRadius: 12,
    paddingVertical: 16,
    marginHorizontal: 4,
  },
  statValue: {
    color: colors.highlight,
    fontFamily: fonts.headline,
    fontSize: 26,
  },
  statLabel: {
    color: colors.textMuted,
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    letterSpacing: 1,
    marginTop: 2,
  },
});
