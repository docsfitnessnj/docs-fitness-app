import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SaveConfirmation } from '../components/SaveConfirmation';
import { SCORING_TYPE_LABELS, ContentCowScoringType } from '../context/ContentLibraryContext';
import {
  ScheduledCow,
  ScheduledDayOfWeek,
  ScheduledWeek,
  ScheduledWod,
  dateForScheduledDay,
  useScheduledContent,
} from '../context/ScheduledContentContext';
import { showAlert } from '../lib/alert';
import { useSaveConfirmation } from '../lib/useSaveConfirmation';
import { colors, fonts } from '../theme';

const DAY_LABEL: Record<ScheduledDayOfWeek, string> = { mon: 'MONDAY', tue: 'TUESDAY', thu: 'THURSDAY', fri: 'FRIDAY' };
const SCORING_OPTIONS: ContentCowScoringType[] = ['time', 'rounds_reps', 'emom'];

function weekLabel(week: ScheduledWeek): string {
  const monday = new Date(week.weekStartDate);
  const friday = new Date(week.weekStartDate);
  friday.setDate(friday.getDate() + 4);
  return `${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${friday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`.toUpperCase();
}

function WodEditor({ week, wod, onClose }: { week: ScheduledWeek; wod: ScheduledWod; onClose: () => void }) {
  const { updateWod, removeWod } = useScheduledContent();
  const [name, setName] = useState(wod.name);
  const [format, setFormat] = useState(wod.format);
  const [formatDescription, setFormatDescription] = useState(wod.formatDescription);
  const [movements, setMovements] = useState(wod.movements.join('\n'));
  const [videoUrl, setVideoUrl] = useState(wod.videoUrl);
  const [notes, setNotes] = useState(wod.notes);
  const { state, start, succeed, fail } = useSaveConfirmation();

  const handleSave = async () => {
    start();
    try {
      await updateWod(wod.id, {
        name,
        format,
        formatDescription,
        movements: movements.split('\n').map((l) => l.trim()).filter(Boolean),
        videoUrl,
        notes,
      });
      succeed();
    } catch (e) {
      fail((e as Error)?.message);
    }
  };

  const handleRemove = () => {
    showAlert(`Remove ${DAY_LABEL[wod.dayOfWeek]}'s WOD?`, 'This deletes the workout from this scheduled week.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await removeWod(wod.id);
          onClose();
        },
      },
    ]);
  };

  return (
    <View style={styles.editPanel} testID={`scheduled-wod-editor-${wod.id}`}>
      <Text style={styles.fieldLabel}>WORKOUT NAME</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} testID="scheduled-wod-name" />
      <Text style={styles.fieldLabel}>FORMAT</Text>
      <TextInput style={styles.input} value={format} onChangeText={setFormat} testID="scheduled-wod-format" />
      <Text style={styles.fieldLabel}>FORMAT DESCRIPTION</Text>
      <TextInput style={styles.input} value={formatDescription} onChangeText={setFormatDescription} />
      <Text style={styles.fieldLabel}>MOVEMENTS (ONE PER LINE)</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={movements}
        onChangeText={setMovements}
        multiline
        testID="scheduled-wod-movements"
      />
      <Text style={styles.fieldLabel}>VIDEO URL</Text>
      <TextInput style={styles.input} value={videoUrl} onChangeText={setVideoUrl} autoCapitalize="none" />
      <Text style={styles.fieldLabel}>NOTES</Text>
      <TextInput style={[styles.input, styles.textArea]} value={notes} onChangeText={setNotes} multiline />

      <View style={styles.editButtonRow}>
        <Pressable style={styles.saveButton} onPress={handleSave} testID="scheduled-wod-save">
          <Text style={styles.saveButtonText}>SAVE</Text>
        </Pressable>
        <Pressable style={styles.removeButton} onPress={handleRemove} testID="scheduled-wod-remove">
          <Text style={styles.removeButtonText}>REMOVE</Text>
        </Pressable>
      </View>
      <SaveConfirmation state={state} />
    </View>
  );
}

function AddWodForm({ week, dayOfWeek, onDone }: { week: ScheduledWeek; dayOfWeek: ScheduledDayOfWeek; onDone: () => void }) {
  const { addWod } = useScheduledContent();
  const [name, setName] = useState('');
  const [format, setFormat] = useState('');
  const [movements, setMovements] = useState('');
  const [videoUrl, setVideoUrl] = useState('');

  const handleAdd = async () => {
    if (!name.trim()) return;
    await addWod(week.id, {
      dayOfWeek,
      name: name.trim(),
      format,
      formatDescription: '',
      movements: movements.split('\n').map((l) => l.trim()).filter(Boolean),
      videoUrl,
      notes: '',
    });
    onDone();
  };

  return (
    <View style={styles.editPanel} testID={`scheduled-add-wod-${dayOfWeek}`}>
      <Text style={styles.fieldLabel}>WORKOUT NAME</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} testID="scheduled-add-wod-name" />
      <Text style={styles.fieldLabel}>FORMAT</Text>
      <TextInput style={styles.input} value={format} onChangeText={setFormat} />
      <Text style={styles.fieldLabel}>MOVEMENTS (ONE PER LINE)</Text>
      <TextInput style={[styles.input, styles.textArea]} value={movements} onChangeText={setMovements} multiline />
      <Text style={styles.fieldLabel}>VIDEO URL</Text>
      <TextInput style={styles.input} value={videoUrl} onChangeText={setVideoUrl} autoCapitalize="none" />
      <Pressable style={styles.saveButton} onPress={handleAdd} testID="scheduled-add-wod-save">
        <Text style={styles.saveButtonText}>ADD {DAY_LABEL[dayOfWeek]} WORKOUT</Text>
      </Pressable>
    </View>
  );
}

function CowEditor({ week, cow }: { week: ScheduledWeek; cow: ScheduledCow | null }) {
  const { updateCow } = useScheduledContent();
  const [name, setName] = useState(cow?.name ?? '');
  const [videoUrl, setVideoUrl] = useState(cow?.videoUrl ?? '');
  const [scoringType, setScoringType] = useState<ContentCowScoringType>(cow?.scoringType ?? 'time');
  const [kettlebells, setKettlebells] = useState(cow?.kettlebells ?? '');
  const [theWork, setTheWork] = useState(cow?.theWork ?? '');
  const [theCatch, setTheCatch] = useState(cow?.theCatch ?? '');
  const [finishNote, setFinishNote] = useState(cow?.finishNote ?? '');
  const { state, start, succeed, fail } = useSaveConfirmation();

  const handleSave = async () => {
    if (!name.trim()) return;
    start();
    try {
      await updateCow(week.id, {
        name: name.trim(),
        videoUrl,
        scoringType,
        kettlebells: kettlebells || undefined,
        theWork: theWork || undefined,
        theCatch: theCatch || undefined,
        finishNote: finishNote || undefined,
      });
      succeed();
    } catch (e) {
      fail((e as Error)?.message);
    }
  };

  return (
    <View style={styles.editPanel} testID="scheduled-cow-editor">
      <Text style={styles.fieldLabel}>CHALLENGE NAME</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} testID="scheduled-cow-name" />
      <Text style={styles.fieldLabel}>VIDEO URL</Text>
      <TextInput style={styles.input} value={videoUrl} onChangeText={setVideoUrl} autoCapitalize="none" />
      <Text style={styles.fieldLabel}>SCORING TYPE</Text>
      <View style={styles.scoringRow}>
        {SCORING_OPTIONS.map((opt) => (
          <Pressable
            key={opt}
            style={[styles.scoringPill, scoringType === opt && styles.scoringPillActive]}
            onPress={() => setScoringType(opt)}
            testID={`scheduled-cow-scoring-${opt}`}
          >
            <Text style={[styles.scoringPillText, scoringType === opt && styles.scoringPillTextActive]}>
              {SCORING_TYPE_LABELS[opt]}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.fieldLabel}>PRESCRIBED KETTLEBELLS</Text>
      <TextInput style={styles.input} value={kettlebells} onChangeText={setKettlebells} />
      <Text style={styles.fieldLabel}>THE WORK</Text>
      <TextInput style={[styles.input, styles.textArea]} value={theWork} onChangeText={setTheWork} multiline />
      <Text style={styles.fieldLabel}>THE CATCH</Text>
      <TextInput style={[styles.input, styles.textArea]} value={theCatch} onChangeText={setTheCatch} multiline />
      <Text style={styles.fieldLabel}>FINISH NOTE</Text>
      <TextInput style={[styles.input, styles.textArea]} value={finishNote} onChangeText={setFinishNote} multiline />
      <Pressable style={styles.saveButton} onPress={handleSave} testID="scheduled-cow-save">
        <Text style={styles.saveButtonText}>SAVE</Text>
      </Pressable>
      <SaveConfirmation state={state} />
    </View>
  );
}

function WeekCard({ week }: { week: ScheduledWeek }) {
  const { deleteWeek } = useScheduledContent();
  const [expanded, setExpanded] = useState(false);
  const [editingWodId, setEditingWodId] = useState<string | null>(null);
  const [addingDay, setAddingDay] = useState<ScheduledDayOfWeek | null>(null);
  const [editingCow, setEditingCow] = useState(false);
  const missingDays = (['mon', 'tue', 'thu', 'fri'] as ScheduledDayOfWeek[]).filter(
    (d) => !week.wods.some((w) => w.dayOfWeek === d)
  );

  const handleDelete = () => {
    showAlert(`Delete the week of ${weekLabel(week)}?`, 'This permanently deletes every WOD and the COW scheduled for this week. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteWeek(week.id) },
    ]);
  };

  return (
    <View style={styles.weekCard} testID={`scheduled-week-${week.id}`}>
      <Pressable style={styles.weekHeader} onPress={() => setExpanded((v) => !v)} testID={`scheduled-week-toggle-${week.id}`}>
        <View style={{ flex: 1 }}>
          <Text style={styles.weekTitle}>{weekLabel(week)}</Text>
          <Text style={styles.weekMeta}>
            {week.releasedAt ? 'RELEASED' : 'SCHEDULED'} · {new Date(week.releaseAt).toLocaleString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
      </Pressable>

      {expanded && (
        <View style={styles.weekBody}>
          {week.wods.map((wod) => (
            <View key={wod.id}>
              <Pressable
                style={styles.wodRow}
                onPress={() => setEditingWodId(editingWodId === wod.id ? null : wod.id)}
                testID={`scheduled-wod-row-${wod.id}`}
              >
                <Text style={styles.wodRowDay}>{DAY_LABEL[wod.dayOfWeek]}</Text>
                <Text style={styles.wodRowName}>{wod.name}</Text>
                <Ionicons name="pencil" size={14} color={colors.textMuted} />
              </Pressable>
              {editingWodId === wod.id && <WodEditor week={week} wod={wod} onClose={() => setEditingWodId(null)} />}
            </View>
          ))}

          {missingDays.map((d) => (
            <View key={d}>
              <Pressable
                style={styles.addDayRow}
                onPress={() => setAddingDay(addingDay === d ? null : d)}
                testID={`scheduled-add-day-${d}`}
              >
                <Ionicons name="add-circle-outline" size={16} color={colors.green} />
                <Text style={styles.addDayText}>ADD {DAY_LABEL[d]} WORKOUT</Text>
              </Pressable>
              {addingDay === d && <AddWodForm week={week} dayOfWeek={d} onDone={() => setAddingDay(null)} />}
            </View>
          ))}

          <Pressable
            style={styles.wodRow}
            onPress={() => setEditingCow((v) => !v)}
            testID="scheduled-cow-row"
          >
            <Text style={styles.wodRowDay}>COW</Text>
            <Text style={styles.wodRowName}>{week.cow ? week.cow.name : 'Not set'}</Text>
            <Ionicons name="pencil" size={14} color={colors.textMuted} />
          </Pressable>
          {editingCow && <CowEditor week={week} cow={week.cow} />}

          <Pressable style={styles.deleteWeekButton} onPress={handleDelete} testID={`scheduled-week-delete-${week.id}`}>
            <Text style={styles.deleteWeekButtonText}>DELETE THIS WEEK</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export function ScheduledWeeksScreen({ onImport }: { onImport: () => void }) {
  const { weeks, loading } = useScheduledContent();

  return (
    <View>
      <Pressable style={styles.importButton} onPress={onImport} testID="scheduled-weeks-open-import">
        <Ionicons name="cloud-upload-outline" size={16} color={colors.green} />
        <Text style={styles.importButtonText}>IMPORT FROM .XLSX / .CSV</Text>
      </Pressable>

      {loading ? (
        <Text style={styles.emptyText}>Loading…</Text>
      ) : weeks.length === 0 ? (
        <Text style={styles.emptyText}>No scheduled weeks yet.</Text>
      ) : (
        [...weeks].sort((a, b) => a.weekStartDate - b.weekStartDate).map((week) => <WeekCard key={week.id} week={week} />)
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: colors.green,
    borderRadius: 10,
    paddingVertical: 14,
    marginBottom: 16,
  },
  importButtonText: {
    color: colors.green,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 1,
  },
  emptyText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 24,
  },
  weekCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 12,
    marginBottom: 10,
    overflow: 'hidden',
  },
  weekHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  weekTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
  },
  weekMeta: {
    color: colors.textMuted,
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 0.4,
    marginTop: 2,
  },
  weekBody: {
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    padding: 14,
  },
  wodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.background,
  },
  wodRowDay: {
    color: colors.green,
    fontFamily: fonts.labelBold,
    fontSize: 11,
    letterSpacing: 0.5,
    width: 56,
  },
  wodRowName: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
  },
  addDayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  addDayText: {
    color: colors.green,
    fontFamily: fonts.labelSemiBold,
    fontSize: 12,
    letterSpacing: 0.5,
  },
  editPanel: {
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  fieldLabel: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 11,
    letterSpacing: 0.6,
    marginBottom: 4,
    marginTop: 8,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 16,
  },
  textArea: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  editButtonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  saveButton: {
    flex: 1,
    backgroundColor: colors.green,
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 12,
  },
  saveButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 12,
    letterSpacing: 0.8,
  },
  removeButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.scoreboardRed,
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
  },
  removeButtonText: {
    color: colors.scoreboardRed,
    fontFamily: fonts.labelBold,
    fontSize: 12,
    letterSpacing: 0.8,
  },
  scoringRow: {
    flexDirection: 'row',
    gap: 8,
  },
  scoringPill: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  scoringPillActive: {
    backgroundColor: colors.greenDeep,
    borderColor: colors.greenDeep,
  },
  scoringPillText: {
    color: colors.textMuted,
    fontFamily: fonts.labelBold,
    fontSize: 11,
  },
  scoringPillTextActive: {
    color: colors.goldBright,
  },
  deleteWeekButton: {
    borderWidth: 1,
    borderColor: colors.scoreboardRed,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 14,
  },
  deleteWeekButtonText: {
    color: colors.scoreboardRed,
    fontFamily: fonts.labelBold,
    fontSize: 12,
    letterSpacing: 0.8,
  },
});
