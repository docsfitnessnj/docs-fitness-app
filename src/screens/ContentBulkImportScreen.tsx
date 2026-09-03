import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ModalHeader } from '../components/ModalHeader';
import { ContentWorkoutInput } from '../context/ContentLibraryContext';
import { BULK_IMPORT_EXAMPLE, ParsedEntry, parseBulkImport } from '../lib/contentLibraryParser';
import { colors, fonts } from '../theme';

type Props = {
  onImport: (inputs: ContentWorkoutInput[]) => void;
  onBack: () => void;
};

export function ContentBulkImportScreen({ onImport, onBack }: Props) {
  const [text, setText] = useState('');
  const [showExample, setShowExample] = useState(false);
  const [parsed, setParsed] = useState<ParsedEntry[] | null>(null);

  const handlePreview = () => {
    setParsed(parseBulkImport(text));
  };

  const okEntries = useMemo(() => (parsed ?? []).filter((e): e is Extract<ParsedEntry, { ok: true }> => e.ok), [parsed]);
  const errorEntries = useMemo(() => (parsed ?? []).filter((e): e is Extract<ParsedEntry, { ok: false }> => !e.ok), [parsed]);

  const handleImport = () => {
    if (okEntries.length === 0) return;
    onImport(okEntries.map((e) => e.input));
    setText('');
    setParsed(null);
  };

  return (
    <View style={styles.container}>
      <ModalHeader title="BULK PASTE IMPORT" onBack={onBack} backTestID="content-bulk-back" />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          Paste multiple workouts at once. Separate each one with a line of three dashes ("---"). Each workout is a
          set of "Label: value" lines — Movements is the one field that spans multiple lines.
        </Text>

        <Pressable style={styles.exampleToggle} onPress={() => setShowExample((v) => !v)} testID="content-bulk-toggle-example">
          <Ionicons name={showExample ? 'chevron-down' : 'chevron-forward'} size={14} color={colors.green} />
          <Text style={styles.exampleToggleText}>{showExample ? 'HIDE EXAMPLE FORMAT' : 'SHOW EXAMPLE FORMAT'}</Text>
        </Pressable>
        {showExample && (
          <View style={styles.exampleBox}>
            <Text style={styles.exampleText}>{BULK_IMPORT_EXAMPLE}</Text>
            <Pressable
              style={styles.useExampleButton}
              onPress={() => setText(BULK_IMPORT_EXAMPLE)}
              testID="content-bulk-use-example"
            >
              <Text style={styles.useExampleButtonText}>USE THIS AS A STARTING POINT</Text>
            </Pressable>
          </View>
        )}

        <Text style={styles.label}>PASTE WORKOUTS</Text>
        <TextInput
          style={styles.textArea}
          value={text}
          onChangeText={(v) => {
            setText(v);
            setParsed(null);
          }}
          placeholder="Paste your workouts here…"
          placeholderTextColor={colors.textMuted}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          aria-label="Bulk workout paste"
          testID="content-bulk-textarea"
        />

        <Pressable
          style={[styles.previewButton, text.trim().length === 0 && styles.previewButtonDisabled]}
          disabled={text.trim().length === 0}
          onPress={handlePreview}
          testID="content-bulk-preview"
        >
          <Text style={styles.previewButtonText}>PREVIEW</Text>
        </Pressable>

        {parsed && (
          <View style={styles.results}>
            <Text style={styles.resultsSummary}>
              {okEntries.length} ready to import{errorEntries.length > 0 ? `, ${errorEntries.length} with problems` : ''}
            </Text>

            {okEntries.map((e) => (
              <View key={e.blockIndex} style={styles.resultRowOk} testID={`content-bulk-ok-${e.blockIndex}`}>
                <Ionicons name="checkmark-circle" size={16} color={colors.green} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultName}>{e.input.name}</Text>
                  <Text style={styles.resultMeta}>
                    {e.input.type === 'wod' ? "DOC'S WOD" : 'CHALLENGE OF THE WEEK'} · {e.input.movements.length}{' '}
                    movement{e.input.movements.length === 1 ? '' : 's'}
                  </Text>
                </View>
              </View>
            ))}

            {errorEntries.map((e) => (
              <View key={e.blockIndex} style={styles.resultRowError} testID={`content-bulk-error-${e.blockIndex}`}>
                <Ionicons name="close-circle" size={16} color={colors.scoreboardRed} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultName}>{e.name}</Text>
                  <Text style={styles.resultErrorText}>{e.error}</Text>
                </View>
              </View>
            ))}

            <Pressable
              style={[styles.importButton, okEntries.length === 0 && styles.previewButtonDisabled]}
              disabled={okEntries.length === 0}
              onPress={handleImport}
              testID="content-bulk-import"
            >
              <Text style={styles.importButtonText}>
                IMPORT {okEntries.length} WORKOUT{okEntries.length === 1 ? '' : 'S'} AS DRAFTS
              </Text>
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
    paddingTop: 60,
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
    marginBottom: 14,
  },
  exampleToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  exampleToggleText: {
    color: colors.green,
    fontFamily: fonts.labelBold,
    fontSize: 12,
    letterSpacing: 0.5,
  },
  exampleBox: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  exampleText: {
    color: colors.text,
    fontFamily: 'PublicSans_400Regular',
    fontSize: 12,
    lineHeight: 18,
  },
  useExampleButton: {
    alignSelf: 'flex-start',
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.green,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  useExampleButtonText: {
    color: colors.green,
    fontFamily: fonts.labelBold,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  label: {
    color: colors.green,
    fontFamily: fonts.labelSemiBold,
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 8,
  },
  textArea: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 13,
    minHeight: 220,
    textAlignVertical: 'top',
  },
  previewButton: {
    borderWidth: 1.5,
    borderColor: colors.green,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 14,
  },
  previewButtonDisabled: {
    opacity: 0.4,
  },
  previewButtonText: {
    color: colors.green,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 1,
  },
  results: {
    marginTop: 20,
  },
  resultsSummary: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    marginBottom: 12,
  },
  resultRowOk: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  resultRowError: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.scoreboardRed,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  resultName: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
  },
  resultMeta: {
    color: colors.textMuted,
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 0.3,
    marginTop: 2,
  },
  resultErrorText: {
    color: colors.scoreboardRed,
    fontFamily: fonts.body,
    fontSize: 12,
    marginTop: 2,
  },
  importButton: {
    backgroundColor: colors.green,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  importButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 1,
  },
});
