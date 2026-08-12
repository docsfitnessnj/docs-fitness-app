import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../components/ScreenContainer';
import { MembershipGate } from '../components/MembershipGate';
import { colors, fonts } from '../theme';

type Entry = { name: string; kettlebell: string; score: string };

const INITIAL_ENTRIES: Entry[] = [
  { name: 'J. Marino', kettlebell: '53lb', score: '8:42' },
  { name: 'K. Alvarez', kettlebell: '44lb', score: '9:05' },
  { name: 'T. Ruiz', kettlebell: '44lb', score: '9:18' },
  { name: 'S. Boyle', kettlebell: '35lb', score: '9:47' },
  { name: 'D. Castillo', kettlebell: '53lb', score: '10:02' },
  { name: 'M. Petrillo', kettlebell: '35lb', score: '10:15' },
  { name: 'A. Novak', kettlebell: '26lb', score: '10:33' },
];

function CurrentChallenge() {
  return (
    <View style={styles.card}>
      <View style={styles.badge}>
        <Ionicons name="flame" size={16} color={colors.background} />
        <Text style={styles.badgeText}>THIS WEEK&apos;S CHALLENGE</Text>
      </View>

      <Text style={styles.cardHeadline}>SWING CHALLENGE</Text>
      <Text style={styles.cardSubtext}>
        Rack up as many kettlebell swings as you can this week. No shortcuts, no excuses.
      </Text>

      <View style={styles.progressTrack}>
        <View style={styles.progressFill} />
      </View>
      <Text style={styles.progressText}>0 / 1,000 SWINGS</Text>

      <View style={styles.divider} />

      <Text style={styles.sectionLabel}>DAYS LEFT</Text>
      <Text style={styles.daysLeft}>5</Text>
    </View>
  );
}

function EntryForm({ onSubmit }: { onSubmit: (entry: Entry) => void }) {
  const [name, setName] = useState('');
  const [kettlebell, setKettlebell] = useState('');
  const [score, setScore] = useState('');

  const canSubmit = name.trim().length > 0 && score.trim().length > 0;

  const handleSubmit = () => {
    if (!canSubmit) {
      return;
    }
    onSubmit({ name: name.trim(), kettlebell: kettlebell.trim() || '—', score: score.trim() });
    setName('');
    setKettlebell('');
    setScore('');
  };

  return (
    <View style={styles.formCard}>
      <Text style={styles.formHeading}>LOG YOUR SCORE</Text>

      <TextInput
        style={styles.input}
        placeholder="Name"
        placeholderTextColor={colors.textMuted}
        value={name}
        onChangeText={setName}
      />
      <TextInput
        style={styles.input}
        placeholder="Kettlebell size (e.g. 35lb)"
        placeholderTextColor={colors.textMuted}
        value={kettlebell}
        onChangeText={setKettlebell}
      />
      <TextInput
        style={styles.input}
        placeholder="Score — time, or rounds + reps"
        placeholderTextColor={colors.textMuted}
        value={score}
        onChangeText={setScore}
      />

      <Pressable
        style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
        disabled={!canSubmit}
        onPress={handleSubmit}
      >
        <Text style={styles.submitButtonText}>SUBMIT ENTRY</Text>
      </Pressable>
    </View>
  );
}

function LeaderboardRow({ entry, rank }: { entry: Entry; rank: number }) {
  const isTopThree = rank <= 3;
  return (
    <View style={styles.row}>
      <Text style={[styles.rank, isTopThree && styles.rankTop]}>{rank}</Text>
      <View style={styles.rowMain}>
        <Text style={styles.name}>{entry.name}</Text>
        <Text style={styles.kettlebell}>{entry.kettlebell} KB</Text>
      </View>
      <Text style={styles.score}>{entry.score}</Text>
    </View>
  );
}

function DocsCows() {
  const [entries, setEntries] = useState<Entry[]>(INITIAL_ENTRIES);

  return (
    <View>
      <CurrentChallenge />
      <EntryForm onSubmit={(entry) => setEntries((prev) => [...prev, entry])} />

      <Text style={styles.subtitle}>LIVE LEADERBOARD — THIS WEEK</Text>
      <View style={styles.list}>
        {entries.map((entry, index) => (
          <LeaderboardRow key={`${entry.name}-${index}`} entry={entry} rank={index + 1} />
        ))}
      </View>
    </View>
  );
}

export default function DocsCowsScreen() {
  return (
    <ScreenContainer>
      <MembershipGate>
        <DocsCows />
      </MembershipGate>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.backgroundLight,
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
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
    backgroundColor: colors.background,
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
  formCard: {
    backgroundColor: colors.backgroundLight,
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
  },
  formHeading: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 22,
    letterSpacing: 1,
    marginBottom: 14,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    marginBottom: 10,
  },
  submitButton: {
    backgroundColor: colors.highlight,
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 4,
  },
  submitButtonDisabled: {
    opacity: 0.4,
  },
  submitButtonText: {
    color: colors.background,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    letterSpacing: 1,
  },
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
  rowMain: {
    flex: 1,
  },
  name: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 17,
  },
  kettlebell: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13,
    marginTop: 1,
  },
  score: {
    color: colors.text,
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
  },
});
