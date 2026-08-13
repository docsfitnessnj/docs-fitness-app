import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../components/ScreenContainer';
import { MembershipGate } from '../components/MembershipGate';
import { colors, fonts } from '../theme';

type Entry = { rank: number; name: string; kettlebell: string; score: string };

const INITIAL_ENTRIES: Entry[] = [
  { rank: 1, name: 'J. Marino', kettlebell: '35lb', score: '8:42' },
  { rank: 2, name: 'K. Alvarez', kettlebell: '26lb', score: '9:05' },
  { rank: 3, name: 'T. Ruiz', kettlebell: '35lb', score: '9:18' },
  { rank: 4, name: 'S. Boyle', kettlebell: '26lb', score: '9:47' },
  { rank: 5, name: 'D. Castillo', kettlebell: '18lb', score: '10:02' },
];

function CurrentChallenge() {
  return (
    <View style={styles.card}>
      <View style={styles.badge}>
        <Ionicons name="flame" size={16} color={colors.background} />
        <Text style={styles.badgeText}>THIS WEEK'S CHALLENGE</Text>
      </View>

      <Text style={styles.cardHeadline}>SWING CHALLENGE</Text>
      <Text style={styles.cardSubtext}>
        Rack up as many kettlebell swings as you can, for time. No shortcuts, no excuses.
      </Text>

      <View style={styles.divider} />

      <Text style={styles.sectionLabel}>DAYS LEFT</Text>
      <Text style={styles.daysLeft}>4</Text>
    </View>
  );
}

function EntryForm({ onSubmit }: { onSubmit: (entry: Omit<Entry, 'rank'>) => void }) {
  const [name, setName] = useState('');
  const [kettlebell, setKettlebell] = useState('');
  const [score, setScore] = useState('');

  const canSubmit = name.trim().length > 0 && score.trim().length > 0;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit({ name: name.trim(), kettlebell: kettlebell.trim() || '—', score: score.trim() });
    setName('');
    setKettlebell('');
    setScore('');
  };

  return (
    <View style={styles.formCard}>
      <Text style={styles.formTitle}>SUBMIT YOUR SCORE</Text>

      <Text style={styles.label}>NAME</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Your name"
        placeholderTextColor={colors.textMuted}
      />

      <Text style={styles.label}>KETTLEBELL SIZE</Text>
      <TextInput
        style={styles.input}
        value={kettlebell}
        onChangeText={setKettlebell}
        placeholder="e.g. 35lb"
        placeholderTextColor={colors.textMuted}
      />

      <Text style={styles.label}>SCORE / TIME / ROUNDS+REPS</Text>
      <TextInput
        style={styles.input}
        value={score}
        onChangeText={setScore}
        placeholder="e.g. 9:42 or 12 rounds + 5"
        placeholderTextColor={colors.textMuted}
      />

      <Pressable style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]} disabled={!canSubmit} onPress={submit}>
        <Text style={styles.submitButtonText}>SUBMIT SCORE</Text>
      </Pressable>
    </View>
  );
}

function LeaderboardRow({ entry }: { entry: Entry }) {
  const isTopThree = entry.rank <= 3;
  return (
    <View style={styles.row}>
      <Text style={[styles.rank, isTopThree && styles.rankTop]}>{entry.rank}</Text>
      <View style={styles.rowMain}>
        <Text style={styles.name}>{entry.name}</Text>
        <Text style={styles.kettlebell}>{entry.kettlebell} KB</Text>
      </View>
      <Text style={styles.score}>{entry.score}</Text>
    </View>
  );
}

function Leaderboard({ entries }: { entries: Entry[] }) {
  return (
    <View>
      <Text style={styles.subtitle}>LIVE LEADERBOARD — THIS WEEK</Text>
      <View style={styles.list}>
        {entries.map((entry) => (
          <LeaderboardRow key={`${entry.rank}-${entry.name}`} entry={entry} />
        ))}
      </View>
    </View>
  );
}

function DocsCowsContent() {
  const [entries, setEntries] = useState<Entry[]>(INITIAL_ENTRIES);

  const addEntry = (entry: Omit<Entry, 'rank'>) => {
    setEntries((prev) => [...prev, { ...entry, rank: prev.length + 1 }]);
  };

  return (
    <View>
      <CurrentChallenge />
      <EntryForm onSubmit={addEntry} />
      <Leaderboard entries={entries} />
    </View>
  );
}

export default function DocsCowsScreen() {
  return (
    <ScreenContainer>
      <MembershipGate>
        <DocsCowsContent />
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
  formCard: {
    backgroundColor: colors.backgroundLight,
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  formTitle: {
    color: colors.accent,
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    letterSpacing: 2,
    marginBottom: 16,
  },
  label: {
    color: colors.textMuted,
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    marginBottom: 14,
  },
  submitButton: {
    backgroundColor: colors.highlight,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
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
