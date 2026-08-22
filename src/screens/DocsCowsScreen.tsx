import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../components/ScreenContainer';
import { MembershipGate } from '../components/MembershipGate';
import { Avatar } from '../components/Avatar';
import { useBadges } from '../context/BadgeContext';
import { useChallenge } from '../context/ChallengeContext';
import { useDisplayName } from '../context/ProfileContext';
import { colors, fonts } from '../theme';

export const CHALLENGE_TITLE = 'SWING CHALLENGE';

type Entry = {
  rank: number;
  name: string;
  kettlebell: string;
  rounds: string;
  time: string;
  tag: 'Boathouse Crew' | 'Virtual';
};

const DEMO_ENTRIES: Entry[] = [
  { rank: 1, name: 'J. Marino', kettlebell: '16', rounds: '12', time: '8:42', tag: 'Boathouse Crew' },
  { rank: 2, name: 'K. Alvarez', kettlebell: '12', rounds: '11', time: '9:05', tag: 'Boathouse Crew' },
  { rank: 3, name: 'T. Ruiz', kettlebell: '16', rounds: '10', time: '9:18', tag: 'Virtual' },
  { rank: 4, name: 'S. Boyle', kettlebell: '12', rounds: '10', time: '9:47', tag: 'Boathouse Crew' },
  { rank: 5, name: 'D. Castillo', kettlebell: '8', rounds: '9', time: '10:02', tag: 'Virtual' },
];

function ChallengeHero() {
  return (
    <View style={styles.hero}>
      <Text style={styles.ghostWatermark}>COW</Text>
      <View style={styles.badge}>
        <Ionicons name="flame" size={14} color={colors.greenDeep} />
        <Text style={styles.badgeText}>THIS WEEK'S CHALLENGE OF THE WEEK</Text>
      </View>
      <Text style={styles.heroTitle}>{CHALLENGE_TITLE}</Text>
      <Text style={styles.heroSubtext}>
        Rack up as many kettlebell swings as you can, for time. No shortcuts, no excuses.
      </Text>
      <View style={styles.heroDivider} />
      <Text style={styles.daysLeftLabel}>DAYS LEFT</Text>
      <Text style={styles.daysLeft}>4</Text>
    </View>
  );
}

function EntryForm({ onSubmit }: { onSubmit: (entry: Omit<Entry, 'rank' | 'tag'>) => void }) {
  const displayName = useDisplayName();
  const { recordCowKillerScore } = useBadges();
  const [time, setTime] = useState('');
  const [rounds, setRounds] = useState('');
  const [kettlebell, setKettlebell] = useState('');

  const canSubmit = time.trim().length > 0;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit({
      name: displayName,
      kettlebell: kettlebell.trim() || '—',
      rounds: rounds.trim() || '—',
      time: time.trim(),
    });
    recordCowKillerScore();
    setTime('');
    setRounds('');
    setKettlebell('');
  };

  return (
    <View style={styles.formCard}>
      <Text style={styles.formTitle}>POST YOUR SCORE</Text>

      <View style={styles.formRow}>
        <View style={styles.formField}>
          <Text style={styles.label}>TIME</Text>
          <TextInput
            style={styles.input}
            value={time}
            onChangeText={setTime}
            placeholder="e.g. 9:42"
            placeholderTextColor={colors.textMuted}
          />
        </View>
        <View style={styles.formField}>
          <Text style={styles.label}>ROUNDS</Text>
          <TextInput
            style={styles.input}
            value={rounds}
            onChangeText={setRounds}
            placeholder="e.g. 12"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
          />
        </View>
      </View>

      <Text style={styles.label}>KETTLEBELL SIZE (KG)</Text>
      <TextInput
        style={styles.input}
        value={kettlebell}
        onChangeText={setKettlebell}
        placeholder="e.g. 16"
        placeholderTextColor={colors.textMuted}
        keyboardType="numeric"
      />

      <Pressable style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]} disabled={!canSubmit} onPress={submit}>
        <Text style={styles.submitButtonText}>POST SCORE</Text>
      </Pressable>
    </View>
  );
}

function LeaderboardRow({ entry }: { entry: Entry }) {
  const isFirst = entry.rank === 1;
  return (
    <View style={styles.row}>
      <Text style={[styles.rank, isFirst && styles.rankFirst]}>{entry.rank}</Text>
      <Avatar name={entry.name} size={32} />
      <View style={styles.rowMain}>
        <Text style={styles.name}>{entry.name}</Text>
        <Text style={styles.rowMeta}>
          {entry.rounds} rounds · {entry.kettlebell} KG KB · {entry.tag}
        </Text>
      </View>
      <Text style={styles.score}>{entry.time}</Text>
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
  const { entries: myEntries, addEntry: addChallengeEntry } = useChallenge();

  const postedEntries: Entry[] = myEntries
    .filter((e) => e.challengeTitle === CHALLENGE_TITLE)
    .map((e, i) => ({
      rank: DEMO_ENTRIES.length + i + 1,
      name: e.author,
      kettlebell: e.kettlebell,
      rounds: e.rounds,
      time: e.time,
      tag: e.tag,
    }));
  const entries = [...DEMO_ENTRIES, ...postedEntries];

  const addEntry = (entry: Omit<Entry, 'rank' | 'tag'>) => {
    addChallengeEntry({
      author: entry.name,
      challengeTitle: CHALLENGE_TITLE,
      kettlebell: entry.kettlebell,
      rounds: entry.rounds,
      time: entry.time,
      tag: 'Boathouse Crew',
    });
  };

  return (
    <View>
      <ChallengeHero />
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
  hero: {
    backgroundColor: colors.green,
    borderRadius: 14,
    padding: 20,
    marginBottom: 16,
    overflow: 'hidden',
  },
  ghostWatermark: {
    position: 'absolute',
    top: -22,
    right: -8,
    color: 'rgba(255,255,255,0.08)',
    fontFamily: fonts.headline,
    fontSize: 96,
    letterSpacing: 2,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.goldBright,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 12,
    gap: 5,
  },
  badgeText: {
    color: colors.greenDeep,
    fontFamily: fonts.labelBold,
    fontSize: 11,
    letterSpacing: 1,
  },
  heroTitle: {
    color: colors.white,
    fontFamily: fonts.headline,
    fontSize: 40,
    letterSpacing: 1,
  },
  heroSubtext: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: fonts.body,
    fontSize: 15,
    marginTop: 8,
    lineHeight: 20,
  },
  heroDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginVertical: 16,
  },
  daysLeftLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontFamily: fonts.labelSemiBold,
    fontSize: 13,
    letterSpacing: 1,
  },
  daysLeft: {
    color: colors.goldBright,
    fontFamily: fonts.headline,
    fontSize: 32,
  },
  formCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    padding: 20,
    marginBottom: 20,
  },
  formTitle: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 18,
    letterSpacing: 1,
    marginBottom: 16,
  },
  formRow: {
    flexDirection: 'row',
    gap: 12,
  },
  formField: {
    flex: 1,
  },
  label: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    marginBottom: 14,
  },
  submitButton: {
    backgroundColor: colors.gold,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: colors.greenDeep,
    fontFamily: fonts.labelBold,
    fontSize: 14,
    letterSpacing: 1,
  },
  subtitle: {
    color: colors.green,
    fontFamily: fonts.labelSemiBold,
    fontSize: 14,
    letterSpacing: 1,
    marginBottom: 12,
  },
  list: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.background,
  },
  rank: {
    width: 20,
    color: colors.textMuted,
    fontFamily: fonts.bodyBold,
    fontSize: 16,
  },
  rankFirst: {
    color: colors.gold,
  },
  rowMain: {
    flex: 1,
  },
  name: {
    color: colors.text,
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
  },
  rowMeta: {
    color: colors.textMuted,
    fontFamily: fonts.label,
    fontSize: 12,
    marginTop: 1,
  },
  score: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 16,
  },
});
