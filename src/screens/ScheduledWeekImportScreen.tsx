import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ModalHeader } from '../components/ModalHeader';
import { useScheduledContent } from '../context/ScheduledContentContext';
import { buildImportPreview, ParsedWeekPreview } from '../lib/scheduledWeekParser';
import { colors, fonts } from '../theme';

type Props = {
  onBack: () => void;
  onImported: () => void;
};

const DAY_LABEL: Record<string, string> = { mon: 'MON', tue: 'TUE', thu: 'THU', fri: 'FRI' };

function pickSpreadsheetFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv';
    input.style.display = 'none';
    input.setAttribute('data-testid', 'scheduled-import-file-input');
    document.body.appendChild(input);
    const finish = (file: File | null) => {
      input.remove();
      resolve(file);
    };
    input.addEventListener('change', () => finish(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => finish(null), { once: true });
    input.click();
  });
}

function weekLabel(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

export function ScheduledWeekImportScreen({ onBack, onImported }: Props) {
  const { weeks: existingWeeks, importWeeks } = useScheduledContent();
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ weeks: ParsedWeekPreview[]; globalProblems: string[] } | null>(null);
  const [modes, setModes] = useState<Record<number, 'replace' | 'skip'>>({});
  const [importing, setImporting] = useState(false);

  const existingDates = new Set(existingWeeks.map((w) => w.weekStartDate));

  const handleChooseFile = async () => {
    const file = await pickSpreadsheetFile();
    if (!file) return;
    setFileName(file.name);
    const bytes = await file.arrayBuffer();
    const result = buildImportPreview(bytes);
    setPreview(result);
    const nextModes: Record<number, 'replace' | 'skip'> = {};
    for (const w of result.weeks) {
      if (existingDates.has(w.weekStartDate)) nextModes[w.weekStartDate] = 'skip';
    }
    setModes(nextModes);
  };

  const handleImport = async () => {
    if (!preview) return;
    setImporting(true);
    try {
      await importWeeks(
        preview.weeks.map((w) => ({
          weekStartDate: w.weekStartDate,
          wods: w.wods,
          cow: w.cow,
          mode: modes[w.weekStartDate] ?? 'replace',
        }))
      );
      onImported();
    } finally {
      setImporting(false);
    }
  };

  return (
    <View style={styles.container}>
      <ModalHeader title="IMPORT SCHEDULED WEEKS" onBack={onBack} backTestID="scheduled-import-back" />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          Upload an .xlsx or .csv with a WODs sheet (Release date, Day, Workout name, Format, Format description,
          Movements, Video URL, Notes) and/or a COWs sheet (Week of, Challenge name, Video URL, Scoring type,
          Prescribed kettlebells, The Work, The Catch, Finish note). Nothing is saved until you review the preview
          below and confirm.
        </Text>

        <Pressable style={styles.chooseButton} onPress={handleChooseFile} testID="scheduled-import-choose-file">
          <Ionicons name="document-attach-outline" size={16} color={colors.green} />
          <Text style={styles.chooseButtonText}>{fileName ?? 'CHOOSE FILE'}</Text>
        </Pressable>

        {preview && (
          <View style={styles.results}>
            {preview.globalProblems.length > 0 && (
              <View style={styles.globalProblemsBox} testID="scheduled-import-global-problems">
                {preview.globalProblems.map((p, i) => (
                  <Text key={i} style={styles.problemText}>
                    {p}
                  </Text>
                ))}
              </View>
            )}

            <Text style={styles.summary}>
              {preview.weeks.length} week{preview.weeks.length === 1 ? '' : 's'} found
            </Text>

            {preview.weeks.map((w) => {
              const collides = existingDates.has(w.weekStartDate);
              const mode = modes[w.weekStartDate] ?? 'replace';
              return (
                <View key={w.weekStartDate} style={styles.weekCard} testID={`scheduled-import-week-${w.weekStartDate}`}>
                  <Text style={styles.weekTitle}>WEEK OF {weekLabel(w.weekStartDate).toUpperCase()}</Text>

                  {w.wods.map((wod) => (
                    <Text key={wod.dayOfWeek} style={styles.wodLine}>
                      {DAY_LABEL[wod.dayOfWeek]} · {wod.name}
                    </Text>
                  ))}
                  <Text style={styles.cowLine}>{w.cow ? `COW · ${w.cow.name}` : 'No COW given for this week.'}</Text>

                  {w.problems.map((p, i) => (
                    <View key={i} style={styles.problemRow}>
                      <Ionicons name="warning-outline" size={13} color={colors.scoreboardRed} />
                      <Text style={styles.problemText}>{p}</Text>
                    </View>
                  ))}

                  {collides && (
                    <View style={styles.collisionRow}>
                      <Text style={styles.collisionText}>A week is already scheduled for this date.</Text>
                      <View style={styles.modeRow}>
                        <Pressable
                          style={[styles.modePill, mode === 'skip' && styles.modePillActive]}
                          onPress={() => setModes((m) => ({ ...m, [w.weekStartDate]: 'skip' }))}
                          testID={`scheduled-import-skip-${w.weekStartDate}`}
                        >
                          <Text style={[styles.modePillText, mode === 'skip' && styles.modePillTextActive]}>SKIP</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.modePill, mode === 'replace' && styles.modePillActive]}
                          onPress={() => setModes((m) => ({ ...m, [w.weekStartDate]: 'replace' }))}
                          testID={`scheduled-import-replace-${w.weekStartDate}`}
                        >
                          <Text style={[styles.modePillText, mode === 'replace' && styles.modePillTextActive]}>REPLACE</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}

            <Pressable
              style={[styles.importButton, (importing || preview.weeks.length === 0) && styles.importButtonDisabled]}
              disabled={importing || preview.weeks.length === 0}
              onPress={handleImport}
              testID="scheduled-import-confirm"
            >
              <Text style={styles.importButtonText}>{importing ? 'IMPORTING…' : `IMPORT ${preview.weeks.length} WEEK${preview.weeks.length === 1 ? '' : 'S'}`}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  body: {
    paddingHorizontal: 20,
    paddingBottom: 48,
  },
  intro: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 16,
  },
  chooseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: colors.green,
    borderRadius: 10,
    paddingVertical: 14,
  },
  chooseButtonText: {
    color: colors.green,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 1,
  },
  results: {
    marginTop: 20,
  },
  globalProblemsBox: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.scoreboardRed,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  summary: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    marginBottom: 12,
  },
  weekCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  weekTitle: {
    color: colors.green,
    fontFamily: fonts.labelBold,
    fontSize: 12,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  wodLine: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    marginBottom: 3,
  },
  cowLine: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13,
    marginTop: 4,
  },
  problemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 6,
  },
  problemText: {
    color: colors.scoreboardRed,
    fontFamily: fonts.body,
    fontSize: 12,
    flex: 1,
  },
  collisionRow: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  collisionText: {
    color: colors.gold,
    fontFamily: fonts.labelSemiBold,
    fontSize: 12,
    marginBottom: 8,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modePill: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  modePillActive: {
    backgroundColor: colors.greenDeep,
    borderColor: colors.greenDeep,
  },
  modePillText: {
    color: colors.textMuted,
    fontFamily: fonts.labelBold,
    fontSize: 11,
    letterSpacing: 0.8,
  },
  modePillTextActive: {
    color: colors.goldBright,
  },
  importButton: {
    backgroundColor: colors.green,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  importButtonDisabled: {
    opacity: 0.4,
  },
  importButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 1,
  },
});
