import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../components/ScreenContainer';
import { useMembership } from '../context/MembershipContext';
import { colors, fonts, TAGLINE } from '../theme';

const FREE_DAYS_UNLOCKED = 2;

type DayWod = {
  day: string;
  title: string;
  moves: string[];
};

const WEEK: DayWod[] = [
  { day: 'MONDAY', title: 'THE GAUNTLET', moves: ['5 Rounds', '10 Kettlebell Swings', '10 Goblet Squats', '10 Push-Ups', '200m Run'] },
  { day: 'TUESDAY', title: 'IRON GRIP', moves: ['4 Rounds', '15 Farmer Carries (50m)', '12 Pull-Ups', '20 Sit-Ups'] },
  { day: 'WEDNESDAY', title: 'THE GRINDER', moves: ['AMRAP 20', '10 Burpees', '15 Wall Balls', '20 Lunges'] },
  { day: 'THURSDAY', title: 'SWING SET', moves: ['21-15-9', 'Kettlebell Swings', 'Box Jumps', 'Push-Press'] },
  { day: 'FRIDAY', title: 'FRIDAY FURY', moves: ['3 Rounds for Time', '400m Run', '20 Kettlebell Snatches', '15 Toes-to-Bar'] },
];

function DayCard({ wod, locked }: { wod: DayWod; locked: boolean }) {
  if (locked) {
    return (
      <View style={[styles.card, styles.lockedCard]}>
        <View style={styles.lockedHeader}>
          <Text style={styles.lockedDay}>{wod.day}</Text>
          <Ionicons name="lock-closed" size={16} color={colors.textMuted} />
        </View>
        <Text style={styles.lockedText}>Join to unlock this workout</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>{wod.day}</Text>
      <Text style={styles.cardHeadline}>{wod.title}</Text>

      <View style={styles.divider} />

      {wod.moves.map((move) => (
        <WodRow key={move} label={move} />
      ))}
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

export default function DocsWodsScreen() {
  const { hasFullAccess } = useMembership();
  const unlockedCount = hasFullAccess ? WEEK.length : FREE_DAYS_UNLOCKED;

  return (
    <ScreenContainer>
      <Text style={styles.tagline}>{TAGLINE}</Text>

      <View style={styles.week}>
        {WEEK.map((wod, index) => (
          <DayCard key={wod.day} wod={wod} locked={index >= unlockedCount} />
        ))}
      </View>

      <View style={styles.statsRow}>
        <StatBox value="0" label="STREAK" />
        <StatBox value="--:--" label="LAST TIME" />
        <StatBox value="0" label="WODS DONE" />
      </View>
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
  week: {
    gap: 14,
  },
  card: {
    backgroundColor: colors.backgroundLight,
    borderRadius: 12,
    padding: 20,
  },
  lockedCard: {
    opacity: 0.6,
  },
  lockedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lockedDay: {
    color: colors.textMuted,
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    letterSpacing: 2,
  },
  lockedText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    marginTop: 8,
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
    fontSize: 32,
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
