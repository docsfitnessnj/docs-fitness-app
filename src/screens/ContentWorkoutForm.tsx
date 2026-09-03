import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ModalHeader } from '../components/ModalHeader';
import {
  ContentWorkout,
  ContentWorkoutInput,
  ContentWorkoutStatus,
  ContentWorkoutType,
} from '../context/ContentLibraryContext';
import { parseReleaseAt } from '../lib/contentLibraryParser';
import { findMovementInText } from '../lib/movementMatcher';
import { showAlert } from '../lib/alert';
import { colors, fonts } from '../theme';

type Props = {
  // Present when editing an existing entry; absent when creating a new one.
  workout: ContentWorkout | null;
  onSave: (input: ContentWorkoutInput) => void;
  onDelete?: () => void;
  onBack: () => void;
};

const TYPE_OPTIONS: { value: ContentWorkoutType; label: string }[] = [
  { value: 'wod', label: "DOC'S WOD" },
  { value: 'cow', label: 'CHALLENGE OF THE WEEK' },
];

const STATUS_OPTIONS: { value: ContentWorkoutStatus; label: string }[] = [
  { value: 'draft', label: 'DRAFT' },
  { value: 'scheduled', label: 'SCHEDULED' },
  { value: 'released', label: 'RELEASED' },
];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function dateStrOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function timeStrOf(ms: number): string {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function defaultReleaseAt(): number {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setHours(6, 0, 0, 0);
  return d.getTime();
}

// Create/edit form for a single content-library entry. Kept as one flat
// form (no wizard steps) since every field is short and Doc is filling
// these in from notes she already has, not discovering the shape as she
// goes.
export function ContentWorkoutForm({ workout, onSave, onDelete, onBack }: Props) {
  const [name, setName] = useState(workout?.name ?? '');
  const [type, setType] = useState<ContentWorkoutType>(workout?.type ?? 'wod');
  const [format, setFormat] = useState(workout?.format ?? '');
  const [formatDescription, setFormatDescription] = useState(workout?.formatDescription ?? '');
  const [movementsText, setMovementsText] = useState(workout?.movements.join('\n') ?? '');
  const [videoUrl, setVideoUrl] = useState(workout?.videoUrl ?? '');
  const [notes, setNotes] = useState(workout?.notes ?? '');
  const [dateStr, setDateStr] = useState(dateStrOf(workout?.releaseAt ?? defaultReleaseAt()));
  const [timeStr, setTimeStr] = useState(timeStrOf(workout?.releaseAt ?? defaultReleaseAt()));
  const [status, setStatus] = useState<ContentWorkoutStatus>(workout?.status ?? 'draft');
  const [dateError, setDateError] = useState<string | null>(null);

  const movementLines = movementsText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

  const canSave = name.trim().length > 0 && movementLines.length > 0;

  const handleSave = () => {
    const releaseAt = parseReleaseAt(`${dateStr.trim()} ${timeStr.trim()}`);
    if (releaseAt === null) {
      setDateError('Enter the date as YYYY-MM-DD and time as HH:MM (24h).');
      return;
    }
    setDateError(null);
    onSave({
      name: name.trim(),
      type,
      format: format.trim(),
      formatDescription: formatDescription.trim(),
      movements: movementLines,
      videoUrl: videoUrl.trim(),
      notes: notes.trim(),
      releaseAt,
      status,
    });
  };

  const handleDelete = () => {
    if (!onDelete) return;
    showAlert(`Delete "${name || 'this workout'}"?`, 'This can\'t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
    ]);
  };

  return (
    <View style={styles.container}>
      <ModalHeader
        title={workout ? 'EDIT WORKOUT' : 'NEW WORKOUT'}
        onBack={onBack}
        backTestID="content-form-back"
      />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.label}>WORKOUT NAME</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. THE GAUNTLET"
          placeholderTextColor={colors.textMuted}
          aria-label="Workout name"
          testID="content-form-name"
        />

        <Text style={styles.label}>TYPE</Text>
        <View style={styles.segmentRow}>
          {TYPE_OPTIONS.map((opt) => (
            <Pressable
              key={opt.value}
              style={[styles.segment, type === opt.value && styles.segmentActive]}
              onPress={() => setType(opt.value)}
              testID={`content-form-type-${opt.value}`}
            >
              <Text style={[styles.segmentText, type === opt.value && styles.segmentTextActive]}>{opt.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>FORMAT</Text>
        <TextInput
          style={styles.input}
          value={format}
          onChangeText={setFormat}
          placeholder="e.g. 30min AMRAP, 5 Rounds, EMOM 12"
          placeholderTextColor={colors.textMuted}
          aria-label="Format"
          testID="content-form-format"
        />

        <Text style={styles.label}>FORMAT DESCRIPTION</Text>
        <TextInput
          style={[styles.input, styles.multilineInput]}
          value={formatDescription}
          onChangeText={setFormatDescription}
          placeholder="How the format is run — rounds, rest, scoring."
          placeholderTextColor={colors.textMuted}
          multiline
          aria-label="Format description"
          testID="content-form-format-description"
        />

        <Text style={styles.label}>MOVEMENTS (ONE PER LINE)</Text>
        <TextInput
          style={[styles.input, styles.multilineInput]}
          value={movementsText}
          onChangeText={setMovementsText}
          placeholder={'Kettlebell Swings\nGoblet Squats\nPush-Ups'}
          placeholderTextColor={colors.textMuted}
          multiline
          aria-label="Movements, one per line"
          testID="content-form-movements"
        />
        {movementLines.length > 0 && (
          <View style={styles.movementCheckList}>
            {movementLines.map((line, i) => {
              const matched = findMovementInText(line);
              return (
                <View key={i} style={styles.movementCheckRow}>
                  <Ionicons
                    name={matched ? 'checkmark-circle' : 'alert-circle-outline'}
                    size={14}
                    color={matched ? colors.green : colors.textMuted}
                  />
                  <Text style={styles.movementCheckText} numberOfLines={1}>
                    {matched ? `${line} — matches "${matched.name}"` : `${line} — no Movement Vault match`}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        <Text style={styles.label}>YOUTUBE BREAKDOWN VIDEO URL</Text>
        <TextInput
          style={styles.input}
          value={videoUrl}
          onChangeText={setVideoUrl}
          placeholder="https://youtube.com/watch?v=..."
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          aria-label="YouTube breakdown video URL"
          testID="content-form-video-url"
        />

        <Text style={styles.label}>NOTES</Text>
        <TextInput
          style={[styles.input, styles.multilineInput]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Anything else for whoever preps this."
          placeholderTextColor={colors.textMuted}
          multiline
          aria-label="Notes"
          testID="content-form-notes"
        />

        <Text style={styles.label}>RELEASE DATE &amp; TIME</Text>
        <View style={styles.dateRow}>
          <View style={styles.dateField}>
            <TextInput
              style={styles.input}
              value={dateStr}
              onChangeText={setDateStr}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              aria-label="Release date"
              testID="content-form-release-date"
            />
          </View>
          <View style={styles.dateField}>
            <TextInput
              style={styles.input}
              value={timeStr}
              onChangeText={setTimeStr}
              placeholder="HH:MM"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              aria-label="Release time, 24 hour"
              testID="content-form-release-time"
            />
          </View>
        </View>
        <Text style={styles.hint}>24-hour time, e.g. 06:00 or 18:00.</Text>
        {dateError && <Text style={styles.errorText}>{dateError}</Text>}

        <Text style={styles.label}>STATUS</Text>
        <View style={styles.segmentRow}>
          {STATUS_OPTIONS.map((opt) => (
            <Pressable
              key={opt.value}
              style={[styles.segment, status === opt.value && styles.segmentActive]}
              onPress={() => setStatus(opt.value)}
              testID={`content-form-status-${opt.value}`}
            >
              <Text style={[styles.segmentText, status === opt.value && styles.segmentTextActive]}>{opt.label}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
          disabled={!canSave}
          onPress={handleSave}
          testID="content-form-save"
        >
          <Text style={styles.saveButtonText}>{workout ? 'SAVE CHANGES' : 'ADD WORKOUT'}</Text>
        </Pressable>

        {onDelete && (
          <Pressable style={styles.deleteButton} onPress={handleDelete} testID="content-form-delete">
            <Text style={styles.deleteButtonText}>DELETE WORKOUT</Text>
          </Pressable>
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
  body: {
    paddingHorizontal: 20,
    paddingBottom: 48,
  },
  label: {
    color: colors.green,
    fontFamily: fonts.labelSemiBold,
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 18,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
  },
  multilineInput: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  movementCheckList: {
    marginTop: 8,
    gap: 4,
  },
  movementCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  movementCheckText: {
    flex: 1,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
  },
  dateRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dateField: {
    flex: 1,
  },
  hint: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 11,
    marginTop: 6,
  },
  errorText: {
    color: colors.scoreboardRed,
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    marginTop: 6,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
  },
  segment: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: colors.card,
  },
  segmentActive: {
    backgroundColor: colors.green,
    borderColor: colors.green,
  },
  segmentText: {
    color: colors.textMuted,
    fontFamily: fonts.labelBold,
    fontSize: 11,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  segmentTextActive: {
    color: colors.white,
  },
  saveButton: {
    backgroundColor: colors.green,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 28,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 14,
    letterSpacing: 1,
  },
  deleteButton: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  deleteButtonText: {
    color: colors.scoreboardRed,
    fontFamily: fonts.labelBold,
    fontSize: 12,
    letterSpacing: 1,
  },
});
