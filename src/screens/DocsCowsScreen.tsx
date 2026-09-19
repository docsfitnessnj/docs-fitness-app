import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { ScreenContainer } from '../components/ScreenContainer';
import { BackendErrorNotice } from '../components/BackendErrorNotice';
import { MembershipGate } from '../components/MembershipGate';
import { Avatar } from '../components/Avatar';
import { WatchVideoBreakdownButton } from '../components/WatchVideoBreakdownButton';
import { TappableMovementText } from '../components/movement/TappableMovementText';
import { useBadges } from '../context/BadgeContext';
import { ContentCowScoringType } from '../context/ContentLibraryContext';
import {
  CurrentChallenge,
  LeaderboardEntry,
  useChallenge,
  useChallengeLeaderboard,
  useCurrentChallenge,
} from '../context/ChallengeContext';
import { useDisplayName } from '../context/ProfileContext';
import { openMovementVault } from '../lib/movementVaultModal';
import { colors, fonts } from '../theme';

type Entry = LeaderboardEntry;

function ChallengeHero({ current }: { current: CurrentChallenge }) {
  return (
    <View style={styles.hero}>
      <Text style={styles.ghostWatermark}>COW</Text>
      <View style={styles.badge}>
        <Ionicons name="flame" size={14} color={colors.greenDeep} />
        <Text style={styles.badgeText}>THIS WEEK'S CHALLENGE OF THE WEEK</Text>
      </View>
      <Text style={styles.heroTitle}>{current.title}</Text>
      <WatchVideoBreakdownButton videoUrl={current.videoUrl} />
      {!!current.format && <Text style={styles.heroFormat}>{current.format.toUpperCase()}</Text>}
      {!!current.formatDescription && (
        <TappableMovementText
          style={styles.heroSubtext}
          linkStyle={styles.heroSubtextLink}
          text={current.formatDescription}
          onOpenMovement={(movementId) => openMovementVault(movementId, 'CHALLENGE')}
        />
      )}
      {current.movements.length > 0 && (
        <View style={styles.heroMovements}>
          {current.movements.map((move, i) => (
            <View key={i} style={styles.heroMoveRow}>
              <View style={styles.heroMoveDot} />
              <TappableMovementText
                style={styles.heroMoveText}
                linkStyle={styles.heroSubtextLink}
                text={move}
                onOpenMovement={(movementId) => openMovementVault(movementId, 'CHALLENGE')}
              />
            </View>
          ))}
        </View>
      )}
      <View style={styles.heroDivider} />
      <Text style={styles.daysLeftLabel}>DAYS LEFT</Text>
      <Text style={styles.daysLeft}>{current.daysLeft}</Text>
    </View>
  );
}

function EntryForm({
  scoringType,
  onSubmit,
}: {
  scoringType: ContentCowScoringType | null;
  onSubmit: (entry: Omit<Entry, 'rank' | 'tag'>) => void;
}) {
  const displayName = useDisplayName();
  const { recordCowKillerScore } = useBadges();
  const [time, setTime] = useState('');
  const [rounds, setRounds] = useState('');
  const [reps, setReps] = useState('');
  const [kettlebell, setKettlebell] = useState('');

  // null (the built-in fallback challenge) shows both TIME and ROUNDS, same
  // as this screen always has — a real Content Library Challenge narrows
  // to just the field(s) its own scoring type calls for.
  const showTime = scoringType === null || scoringType === 'time';
  const showRounds = scoringType === null || scoringType === 'rounds' || scoringType === 'rounds_reps';
  const showReps = scoringType === 'rounds_reps';

  const canSubmit = showRounds && !showTime ? rounds.trim().length > 0 : time.trim().length > 0;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit({
      name: displayName,
      kettlebell: kettlebell.trim() || '—',
      rounds: rounds.trim() || '—',
      reps: showReps ? reps.trim() || '—' : undefined,
      time: showTime ? time.trim() || '—' : '—',
    });
    recordCowKillerScore();
    setTime('');
    setRounds('');
    setReps('');
    setKettlebell('');
  };

  return (
    <View style={styles.formCard}>
      <Text style={styles.formTitle}>POST YOUR SCORE</Text>

      <View style={styles.formRow}>
        {showTime && (
          <View style={styles.formField}>
            <Text nativeID="cowkiller-time-label" style={styles.label}>TIME</Text>
            <TextInput
              style={styles.input}
              value={time}
              onChangeText={setTime}
              placeholder="e.g. 9:42"
              placeholderTextColor={colors.textMuted}
              nativeID="cowkiller-time-input"
              aria-label="Time"
            />
          </View>
        )}
        {showRounds && (
          <View style={styles.formField}>
            <Text nativeID="cowkiller-rounds-label" style={styles.label}>ROUNDS</Text>
            <TextInput
              style={styles.input}
              value={rounds}
              onChangeText={setRounds}
              placeholder="e.g. 12"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              nativeID="cowkiller-rounds-input"
              aria-label="Rounds"
            />
          </View>
        )}
        {showReps && (
          <View style={styles.formField}>
            <Text nativeID="cowkiller-reps-label" style={styles.label}>+ REPS</Text>
            <TextInput
              style={styles.input}
              value={reps}
              onChangeText={setReps}
              placeholder="e.g. 8"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              nativeID="cowkiller-reps-input"
              aria-label="Extra reps"
            />
          </View>
        )}
      </View>

      <Text nativeID="cowkiller-kettlebell-label" style={styles.label}>KETTLEBELL SIZE (KG)</Text>
      <TextInput
        style={styles.input}
        value={kettlebell}
        onChangeText={setKettlebell}
        placeholder="e.g. 16 or 2x12"
        placeholderTextColor={colors.textMuted}
        nativeID="cowkiller-kettlebell-input"
        aria-label="Kettlebell size in kilograms"
      />

      <Pressable style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]} disabled={!canSubmit} onPress={submit}>
        <Text style={styles.submitButtonText}>POST SCORE</Text>
      </Pressable>
    </View>
  );
}

// A Challenge's leaderboard shows exactly one of these two displays, driven
// by its own scoring type — never a per-row guess, so it can never mix
// time-scored and rounds-scored rows even by accident.
function LeaderboardRow({ entry, isTimeScoring }: { entry: Entry; isTimeScoring: boolean }) {
  const isFirst = entry.rank === 1;
  const primaryScore = isTimeScoring ? entry.time : `${entry.rounds}${entry.reps ? ` +${entry.reps}` : ''}`;
  return (
    <View style={styles.row}>
      <Text style={[styles.rank, isFirst && styles.rankFirst]}>{entry.rank}</Text>
      <Avatar name={entry.name} size={32} />
      <View style={styles.rowMain}>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{entry.name}</Text>
          {isFirst && (
            <MaterialCommunityIcons
              name="crown"
              size={14}
              color={colors.gold}
              style={styles.crownIcon}
              testID="leaderboard-crown"
            />
          )}
        </View>
        <Text style={styles.rowMeta}>
          {isTimeScoring
            ? `${entry.kettlebell} KG KB · ${entry.tag}`
            : `${entry.rounds} rounds${entry.reps ? ` + ${entry.reps} reps` : ''} · ${entry.kettlebell} KG KB · ${entry.tag}`}
        </Text>
      </View>
      <Text style={styles.score}>{primaryScore}</Text>
    </View>
  );
}

function Leaderboard({ entries, isTimeScoring }: { entries: Entry[]; isTimeScoring: boolean }) {
  return (
    <View>
      <Text style={styles.subtitle}>LIVE LEADERBOARD — THIS WEEK</Text>
      <View style={styles.list}>
        {entries.length === 0 ? (
          <Text style={styles.emptyText}>No scores posted yet this week — be the first.</Text>
        ) : (
          entries.map((entry) => <LeaderboardRow key={`${entry.rank}-${entry.name}`} entry={entry} isTimeScoring={isTimeScoring} />)
        )}
      </View>
    </View>
  );
}

function DocsCowsContent() {
  const { addEntry: addChallengeEntry, error } = useChallenge();
  const current = useCurrentChallenge();
  const entries = useChallengeLeaderboard();

  const addEntry = (entry: Omit<Entry, 'rank' | 'tag'>) => {
    addChallengeEntry({
      challengeTitle: current.title,
      kettlebell: entry.kettlebell,
      rounds: entry.rounds,
      reps: entry.reps,
      time: entry.time,
    });
  };

  return (
    <View>
      <ChallengeHero current={current} />
      {error ? (
        <BackendErrorNotice message={error} />
      ) : (
        <>
          <EntryForm scoringType={current.scoringType} onSubmit={addEntry} />
          <Leaderboard entries={entries} isTimeScoring={current.scoringType === 'time' || current.scoringType === null} />
        </>
      )}
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
  heroFormat: {
    color: colors.goldBright,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 1,
    marginTop: 4,
  },
  heroSubtext: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: fonts.body,
    fontSize: 15,
    marginTop: 8,
    lineHeight: 20,
  },
  heroSubtextLink: {
    color: colors.goldBright,
    fontFamily: fonts.bodySemiBold,
    textDecorationLine: 'underline',
  },
  heroMovements: {
    marginTop: 12,
    gap: 6,
  },
  heroMoveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroMoveDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  heroMoveText: {
    color: 'rgba(255,255,255,0.9)',
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
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
  emptyText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
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
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  crownIcon: {
    marginLeft: 5,
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
