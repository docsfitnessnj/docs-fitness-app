import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ModalHeader } from '../components/ModalHeader';
import { BackendErrorNotice } from '../components/BackendErrorNotice';
import { useChallenge } from '../context/ChallengeContext';
import { useDeckProgress } from '../context/DeckProgressContext';
import { useDisplayName } from '../context/ProfileContext';
import { formatLogSummary, useWorkoutLog } from '../context/WorkoutLogContext';
import { DECK_CARDS, deckCardLabel } from '../data/deckCards';
import { movementWeightLabel, MovementWeights } from '../lib/movementWeights';
import { colors, fonts } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

type Entry = {
  key: string;
  kind: 'WOD' | 'DECK' | 'CHALLENGE';
  date: string;
  timestamp: number;
  title: string;
  results: string;
  // Round 44 — a gold tag, computed and persisted once at save/post time
  // (see WorkoutLogContext/DeckProgressContext/ChallengeContext's own
  // is_pb writes). No popup, no card — the tag itself is the celebration.
  isPb: boolean;
  // Round 44 — per-movement weights logged for this entry, if any. Older
  // entries (predating this round, or simply never filled in) carry no
  // weights at all and render exactly as they always did.
  movementWeights?: MovementWeights;
};

// Round 44 — "Swings: 24kg, Goblet Squats: 16kg" under a WOD/deck entry's
// own summary line. Returns '' (nothing rendered) when every weight was
// left blank, same as every other optional field in this app.
function formatMovementWeights(weights: MovementWeights | undefined): string {
  if (!weights) return '';
  const parts = Object.entries(weights)
    .filter(([, value]) => value && value.trim())
    .map(([key, value]) => `${movementWeightLabel(key)}: ${value.trim()}`);
  return parts.join(', ');
}

function formatEntryDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
}

export function MyWorkoutsScreen({ visible, onClose }: Props) {
  const { completedWorkouts, error: wodError } = useWorkoutLog();
  const { completedAt: deckCompletedAt, pbCardIds, getLog: getDeckLog, error: deckError } = useDeckProgress();
  const { entries: challengeEntries, error: challengeError } = useChallenge();
  const displayName = useDisplayName();

  if (!visible) return null;

  const error = wodError || deckError || challengeError;
  if (error) {
    return (
      <View style={styles.container}>
        <ModalHeader title="MY COMPLETED WORKOUTS" onBack={onClose} backTestID="close-my-workouts" />
        <BackendErrorNotice message={error} />
      </View>
    );
  }

  const wodEntries: Entry[] = completedWorkouts.map((w) => ({
    key: `wod-${w.dayKey}`,
    kind: 'WOD',
    date: w.dateLabel.toUpperCase(),
    timestamp: w.completedAt,
    title: w.workoutTitle,
    results: formatLogSummary(w.log) || 'No results logged.',
    isPb: w.isPb,
    movementWeights: w.log.movementWeights,
  }));

  const deckEntries: Entry[] = Object.entries(deckCompletedAt).map(([cardId, ts]) => {
    const card = DECK_CARDS.find((c) => c.id === cardId);
    // Round 44 — a deck card's own logged results (if any were ever
    // entered via LOG RESULTS); falls back to the card's own format line
    // exactly as before when nothing's been logged, so an older
    // MARK-COMPLETE-only card renders exactly as it always did.
    const log = getDeckLog(cardId);
    const summary = formatLogSummary(log);
    return {
      key: `deck-${cardId}`,
      kind: 'DECK',
      date: formatEntryDate(ts),
      timestamp: ts,
      title: card ? `${deckCardLabel(card)} — ${card.title}` : cardId,
      results: summary || (card?.format ?? ''),
      isPb: !!pbCardIds[cardId],
      movementWeights: log.movementWeights,
    };
  });

  const challengeEntriesForMe: Entry[] = challengeEntries
    .filter((e) => e.author === displayName)
    .map((e) => ({
      key: `challenge-${e.id}`,
      kind: 'CHALLENGE',
      date: formatEntryDate(e.createdAt),
      timestamp: e.createdAt,
      title: e.challengeTitle,
      results: `${e.time} · ${e.rounds} rounds · ${e.kettlebell} KB`,
      isPb: e.isPb,
    }));

  const allEntries = [...wodEntries, ...deckEntries, ...challengeEntriesForMe].sort(
    (a, b) => b.timestamp - a.timestamp
  );

  return (
    <View style={styles.container}>
      <ModalHeader title="MY COMPLETED WORKOUTS" onBack={onClose} backTestID="close-my-workouts" />

      <ScrollView contentContainerStyle={styles.list}>
        {allEntries.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="barbell-outline" size={30} color={colors.textMuted} />
            <Text style={styles.emptyText}>
              Complete a WOD, a Deck card, or post a Challenge score to see it here.
            </Text>
          </View>
        ) : (
          allEntries.map((entry) => {
            const weightsLine = formatMovementWeights(entry.movementWeights);
            return (
              <View key={entry.key} style={styles.card} testID={`my-workout-${entry.key}`}>
                <View style={styles.cardTopRow}>
                  <Text style={styles.date}>{entry.date}</Text>
                  <View style={styles.cardTopRowRight}>
                    {/* Round 44 — no popup, no card, the tag itself is the
                        celebration. */}
                    {entry.isPb && (
                      <View style={styles.pbTag} testID={`my-workout-pb-${entry.key}`}>
                        <Text style={styles.pbTagText}>PB</Text>
                      </View>
                    )}
                    <View style={styles.kindTag}>
                      <Text style={styles.kindTagText}>{entry.kind}</Text>
                    </View>
                  </View>
                </View>
                <Text style={styles.title}>{entry.title}</Text>
                {!!entry.results && <Text style={styles.results}>{entry.results}</Text>}
                {!!weightsLine && (
                  <Text style={styles.weightsLine} testID={`my-workout-weights-${entry.key}`}>
                    {weightsLine}
                  </Text>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // No paddingTop here -- ScreenOverlay's own fill (topBasePadding={60})
  // provides it as a single additive source with the real top inset. See
  // AGENTS.md's "Web safe-area insets always report zero" writeup.
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 24,
  },
  emptyText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 15,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 20,
  },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  cardTopRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  date: {
    color: colors.green,
    fontFamily: fonts.labelSemiBold,
    fontSize: 12,
    letterSpacing: 1,
  },
  // Round 44 — no popup, no card: the tag is the celebration.
  pbTag: {
    backgroundColor: colors.gold,
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  pbTagText: {
    color: colors.text,
    fontFamily: fonts.labelBold,
    fontSize: 10,
    letterSpacing: 0.8,
  },
  kindTag: {
    backgroundColor: colors.background,
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  kindTagText: {
    color: colors.textMuted,
    fontFamily: fonts.labelBold,
    fontSize: 10,
    letterSpacing: 0.8,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 24,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  results: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    lineHeight: 20,
  },
  // Round 44 — "Swings: 24kg, Goblet Squats: 16kg," one quiet line under
  // the results summary. Absent entirely for an entry with no weights
  // logged, same as every other optional field in this app.
  weightsLine: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
});
