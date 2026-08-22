import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ModalHeader } from '../components/ModalHeader';
import { useChallenge } from '../context/ChallengeContext';
import { useDeckProgress } from '../context/DeckProgressContext';
import { useDisplayName } from '../context/ProfileContext';
import { formatLogSummary, useWorkoutLog } from '../context/WorkoutLogContext';
import { DECK_CARDS, deckCardLabel } from '../data/deckCards';
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
};

function formatEntryDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
}

export function MyWorkoutsScreen({ visible, onClose }: Props) {
  const { completedWorkouts } = useWorkoutLog();
  const { completedAt: deckCompletedAt } = useDeckProgress();
  const { entries: challengeEntries } = useChallenge();
  const displayName = useDisplayName();

  if (!visible) return null;

  const wodEntries: Entry[] = completedWorkouts.map((w) => ({
    key: `wod-${w.dayKey}`,
    kind: 'WOD',
    date: w.dateLabel.toUpperCase(),
    timestamp: w.completedAt,
    title: w.workoutTitle,
    results: formatLogSummary(w.log) || 'No results logged.',
  }));

  const deckEntries: Entry[] = Object.entries(deckCompletedAt).map(([cardId, ts]) => {
    const card = DECK_CARDS.find((c) => c.id === cardId);
    return {
      key: `deck-${cardId}`,
      kind: 'DECK',
      date: formatEntryDate(ts),
      timestamp: ts,
      title: card ? `${deckCardLabel(card)} — ${card.title}` : cardId,
      results: card?.format ?? '',
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
      results: `${e.time} · ${e.rounds} rounds · ${e.kettlebell} KG KB`,
    }));

  const allEntries = [...wodEntries, ...deckEntries, ...challengeEntriesForMe].sort(
    (a, b) => b.timestamp - a.timestamp
  );

  return (
    <View style={styles.container}>
      <ModalHeader title="MY WORKOUTS" onBack={onClose} backTestID="close-my-workouts" />

      <ScrollView contentContainerStyle={styles.list}>
        {allEntries.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="barbell-outline" size={30} color={colors.textMuted} />
            <Text style={styles.emptyText}>
              Complete a WOD, a Deck card, or post a Challenge score to see it here.
            </Text>
          </View>
        ) : (
          allEntries.map((entry) => (
            <View key={entry.key} style={styles.card} testID={`my-workout-${entry.key}`}>
              <View style={styles.cardTopRow}>
                <Text style={styles.date}>{entry.date}</Text>
                <View style={styles.kindTag}>
                  <Text style={styles.kindTagText}>{entry.kind}</Text>
                </View>
              </View>
              <Text style={styles.title}>{entry.title}</Text>
              {!!entry.results && <Text style={styles.results}>{entry.results}</Text>}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 60,
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
  date: {
    color: colors.green,
    fontFamily: fonts.labelSemiBold,
    fontSize: 12,
    letterSpacing: 1,
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
});
