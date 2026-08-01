import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { MembershipGate } from '../components/MembershipGate';
import { colors, fonts } from '../theme';

type Entry = { rank: number; name: string; time: string };

const ENTRIES: Entry[] = [
  { rank: 1, name: 'J. Marino', time: '8:42' },
  { rank: 2, name: 'K. Alvarez', time: '9:05' },
  { rank: 3, name: 'T. Ruiz', time: '9:18' },
  { rank: 4, name: 'S. Boyle', time: '9:47' },
  { rank: 5, name: 'D. Castillo', time: '10:02' },
  { rank: 6, name: 'M. Petrillo', time: '10:15' },
  { rank: 7, name: 'A. Novak', time: '10:33' },
];

function LeaderboardRow({ entry }: { entry: Entry }) {
  const isTopThree = entry.rank <= 3;
  return (
    <View style={styles.row}>
      <Text style={[styles.rank, isTopThree && styles.rankTop]}>{entry.rank}</Text>
      <Text style={styles.name}>{entry.name}</Text>
      <Text style={styles.time}>{entry.time}</Text>
    </View>
  );
}

function LeaderboardList() {
  return (
    <View>
      <Text style={styles.subtitle}>THE GAUNTLET — THIS WEEK</Text>
      <View style={styles.list}>
        {ENTRIES.map((entry) => (
          <LeaderboardRow key={entry.rank} entry={entry} />
        ))}
      </View>
    </View>
  );
}

export default function LeaderboardScreen() {
  return (
    <ScreenContainer>
      <MembershipGate featureName="Leaderboard">
        <LeaderboardList />
      </MembershipGate>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    color: colors.accent,
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    letterSpacing: 1,
    marginBottom: 12,
  },
  list: {
    backgroundColor: colors.backgroundLight,
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.background,
  },
  rank: {
    width: 28,
    color: colors.textMuted,
    fontFamily: fonts.bodyBold,
    fontSize: 16,
  },
  rankTop: {
    color: colors.highlight,
  },
  name: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 17,
  },
  time: {
    color: colors.text,
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
  },
});
