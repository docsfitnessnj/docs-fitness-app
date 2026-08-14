import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppModal } from './AppModal';
import { useCommunity } from '../context/CommunityContext';
import { useDisplayName } from '../context/ProfileContext';
import { useWorkoutLog } from '../context/WorkoutLogContext';
import { showAlert } from '../lib/alert';
import { colors, fonts } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  dayKey: string;
  workoutTitle: string;
  dateLabel: string;
};

export function LogResultsModal({ visible, onClose, dayKey, workoutTitle, dateLabel }: Props) {
  const displayName = useDisplayName();
  const { addWodResultPost } = useCommunity();
  const { getLog, updateLog: updateLogEntry } = useWorkoutLog();

  const log = getLog(dayKey);

  const updateLog = (field: 'rounds' | 'time' | 'kettlebell' | 'notes', value: string) => {
    updateLogEntry(dayKey, field, value);
  };

  const handlePostToCommunity = () => {
    const hasResults = log.rounds.trim() || log.time.trim() || log.kettlebell.trim();
    if (!hasResults) {
      showAlert('Log Your Results First', 'Add rounds, time, or kettlebell size before posting.');
      return;
    }
    const parts = [
      log.rounds.trim() && `Rounds: ${log.rounds.trim()}`,
      log.time.trim() && `Time: ${log.time.trim()}`,
      log.kettlebell.trim() && `KB: ${log.kettlebell.trim()}`,
    ].filter(Boolean);
    const results = parts.join(' · ') + (log.notes.trim() ? `\n${log.notes.trim()}` : '');
    addWodResultPost(displayName, { workoutTitle, dateLabel, results });
    showAlert('Posted!', 'Your result is live on the Community board.');
    onClose();
  };

  return (
    <AppModal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>LOG RESULTS</Text>
          <Pressable onPress={onClose} hitSlop={8} testID="close-log-results">
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.workoutTitle}>{workoutTitle}</Text>
          <Text style={styles.dateLabel}>{dateLabel}</Text>

          <View style={styles.logRow}>
            <View style={styles.logField}>
              <Text style={styles.label}>ROUNDS</Text>
              <TextInput
                style={styles.input}
                value={log.rounds}
                onChangeText={(v) => updateLog('rounds', v)}
                placeholder="e.g. 5"
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <View style={styles.logField}>
              <Text style={styles.label}>TIME</Text>
              <TextInput
                style={styles.input}
                value={log.time}
                onChangeText={(v) => updateLog('time', v)}
                placeholder="e.g. 9:42"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>

          <Text style={styles.label}>KETTLEBELL SIZE</Text>
          <TextInput
            style={styles.input}
            value={log.kettlebell}
            onChangeText={(v) => updateLog('kettlebell', v)}
            placeholder="e.g. 35lb"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.label}>NOTES</Text>
          <TextInput
            style={[styles.input, styles.notesInput]}
            value={log.notes}
            onChangeText={(v) => updateLog('notes', v)}
            placeholder="How did it feel?"
            placeholderTextColor={colors.textMuted}
            multiline
          />

          <Pressable style={styles.postButton} onPress={handlePostToCommunity}>
            <Text style={styles.postButtonText}>POST TO COMMUNITY</Text>
          </Pressable>
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
    fontSize: 22,
    letterSpacing: 1,
  },
  body: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  workoutTitle: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 28,
    letterSpacing: 0.5,
  },
  dateLabel: {
    color: colors.green,
    fontFamily: fonts.labelSemiBold,
    fontSize: 13,
    letterSpacing: 1,
    marginTop: 2,
    marginBottom: 20,
  },
  logRow: {
    flexDirection: 'row',
    gap: 12,
  },
  logField: {
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
    backgroundColor: colors.card,
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
  notesInput: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  postButton: {
    backgroundColor: colors.green,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  postButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 14,
    letterSpacing: 1,
  },
});
