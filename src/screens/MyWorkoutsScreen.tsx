import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ModalHeader } from '../components/ModalHeader';
import { formatLogSummary, useWorkoutLog } from '../context/WorkoutLogContext';
import { colors, fonts } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function MyWorkoutsScreen({ visible, onClose }: Props) {
  const { completedWorkouts } = useWorkoutLog();

  if (!visible) return null;

  return (
    <View style={styles.container}>
      <ModalHeader title="MY WORKOUTS" onBack={onClose} backTestID="close-my-workouts" />

      <ScrollView contentContainerStyle={styles.list}>
        {completedWorkouts.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="barbell-outline" size={30} color={colors.textMuted} />
            <Text style={styles.emptyText}>Complete a workout on Doc's WODs to see it here.</Text>
          </View>
        ) : (
          completedWorkouts.map((workout) => {
            const summary = formatLogSummary(workout.log);
            return (
              <View key={workout.dayKey} style={styles.card}>
                <Text style={styles.date}>{workout.dateLabel.toUpperCase()}</Text>
                <Text style={styles.title}>{workout.workoutTitle}</Text>
                <Text style={styles.results}>{summary || 'No results logged.'}</Text>
              </View>
            );
          })
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
  date: {
    color: colors.green,
    fontFamily: fonts.labelSemiBold,
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 2,
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
