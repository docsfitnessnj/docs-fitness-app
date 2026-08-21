import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppModal } from './AppModal';
import { MediaAttachmentPicker } from './MediaAttachmentPicker';
import { ModalHeader } from './ModalHeader';
import { useCommunity } from '../context/CommunityContext';
import { useDisplayName } from '../context/ProfileContext';
import { formatResultsLine, useWorkoutLog } from '../context/WorkoutLogContext';
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
  const { getLog, updateLog: updateLogEntry, setLogMedia, isCompleted, toggleCompleted } = useWorkoutLog();

  const log = getLog(dayKey);

  const updateLog = (field: 'rounds' | 'time' | 'kettlebell' | 'notes', value: string) => {
    updateLogEntry(dayKey, field, value);
  };

  // The Trophy Case counts a workout the moment it's logged, not only when
  // MARK COMPLETE is tapped separately — so logging results for a day that
  // isn't already marked complete quietly marks it complete too (toggle is
  // a flip, so this only ever fires when it's not already done).
  const markCompleteIfNeeded = () => {
    if (!isCompleted(dayKey)) {
      toggleCompleted(dayKey, workoutTitle, dateLabel, Date.now());
    }
  };

  const handleSaveResults = () => {
    markCompleteIfNeeded();
    showAlert('Saved', 'Your result is saved privately to My Workouts.');
    onClose();
  };

  const handlePostToCommunity = () => {
    showAlert('Post to Community?', 'Your result will be visible to everyone in the community.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Post',
        onPress: () => {
          markCompleteIfNeeded();
          addWodResultPost(
            displayName,
            { workoutTitle, dateLabel, notes: log.notes.trim(), resultsLine: formatResultsLine(log) },
            log.media
          );
          showAlert('Posted!', 'Your result is live on the Community board.');
          onClose();
        },
      },
    ]);
  };

  return (
    <AppModal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <ModalHeader title="LOG RESULTS" onBack={onClose} backTestID="close-log-results" />

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

          <Text style={styles.label}>PHOTO / VIDEO</Text>
          <View style={styles.mediaWrap}>
            <MediaAttachmentPicker media={log.media} onChange={(media) => setLogMedia(dayKey, media)} />
          </View>

          <View style={styles.actionRow}>
            <Pressable style={styles.saveButton} onPress={handleSaveResults} testID="save-results">
              <Text style={styles.saveButtonText}>SAVE RESULTS</Text>
            </Pressable>
            <Pressable style={styles.postButton} onPress={handlePostToCommunity} testID="post-to-community">
              <Text style={styles.postButtonText}>POST TO COMMUNITY</Text>
            </Pressable>
          </View>
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
  mediaWrap: {
    marginBottom: 8,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  saveButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.green,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
  },
  saveButtonText: {
    color: colors.green,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 1,
  },
  postButton: {
    flex: 1,
    backgroundColor: colors.green,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
  },
  postButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 1,
  },
});
