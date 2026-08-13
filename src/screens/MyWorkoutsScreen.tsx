import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppModal } from '../components/AppModal';
import { formatLogSummary, useWorkoutLog } from '../context/WorkoutLogContext';
import { colors, fonts } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function MyWorkoutsScreen({ visible, onClose }: Props) {
  const { completedWorkouts } = useWorkoutLog();

  return (
    <AppModal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>MY WORKOUTS</Text>
          <Pressable onPress={onClose} hitSlop={8} testID="close-my-workouts">
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.list}>
          {completedWorkouts.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="barbell-outline" size={32} color={colors.textMuted} />
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
    </AppModal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  headerTitle: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 24,
    letterSpacing: 1,
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
    backgroundColor: colors.backgroundLight,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  date: {
    color: colors.accent,
    fontFamily: fonts.bodySemiBold,
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
