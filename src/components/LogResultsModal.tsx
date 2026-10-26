import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppPressable } from './AppPressable';
import { AppModal } from './AppModal';
import { MediaAttachmentPicker } from './MediaAttachmentPicker';
import { ModalHeader } from './ModalHeader';
import { TappableMovementText } from './movement/TappableMovementText';
import { useCommunity } from '../context/CommunityContext';
import { useDisplayName } from '../context/ProfileContext';
import { formatResultsLine, useWorkoutLog } from '../context/WorkoutLogContext';
import { formatShortDate, parseMoveRow } from '../data/content';
import { openCompletionShareCard } from '../lib/completionShareCard';
import { openMovementVault } from '../lib/movementVaultModal';
import { useActionCompletion } from '../lib/useActionCompletion';
import { colors, fonts } from '../theme';

// Free text ("2x24", "16/20 kg", pounds) — no format validation, just a
// sane ceiling.
const KETTLEBELL_SIZE_MAX_LENGTH = 40;

type Props = {
  visible: boolean;
  onClose: () => void;
  dayKey: string;
  workoutTitle: string;
  dateLabel: string;
  date: Date;
  // The workout's movement list, shown read-only above the entry fields so
  // the member never has to leave this screen to remember what it was.
  movements: string[];
};

export function LogResultsModal({ visible, onClose, dayKey, workoutTitle, dateLabel, date, movements }: Props) {
  const displayName = useDisplayName();
  const { addWodResultPost } = useCommunity();
  const { getLog, updateLog: updateLogEntry, setLogMedia, isCompleted, toggleCompleted } = useWorkoutLog();

  const log = getLog(dayKey);

  // Auto-fills as "WORKOUT NAME · DATE" but stays fully editable so the
  // member can append their own note before posting to the community.
  const defaultTitle = `${workoutTitle} · ${formatShortDate(date)}`;
  const [title, setTitle] = useState(defaultTitle);

  // Round 35: SAVE RESULTS/POST TO COMMUNITY are now IN-PLACE
  // confirmations -- the button itself transforms to SAVED/POSTED and the
  // member stays on this screen (no onClose(), no navigation), exactly
  // the house's own COMPLETED button pattern (DayPanel.tsx's
  // completeButtonDone/completeButtonTextDone). These are plain local
  // state, not persisted anywhere, and reset the instant any field
  // changes (including switching to a different day's log while this
  // same modal instance stays mounted) -- the member re-saves/re-posts
  // the same way they always have, there's just no longer a forced exit.
  const [saved, setSaved] = useState(false);
  const [posted, setPosted] = useState(false);

  useEffect(() => {
    setTitle(defaultTitle);
    setSaved(false);
    setPosted(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayKey]);

  const handleTitleChange = (value: string) => {
    setTitle(value);
    setSaved(false);
    setPosted(false);
  };

  const updateLog = (field: 'rounds' | 'time' | 'kettlebell' | 'notes', value: string) => {
    updateLogEntry(dayKey, field, value);
    setSaved(false);
    setPosted(false);
  };

  const handleMediaChange = (media: Parameters<typeof setLogMedia>[1]) => {
    setLogMedia(dayKey, media);
    setSaved(false);
    setPosted(false);
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

  const { status: saveStatus, run: runSave } = useActionCompletion();
  const { status: postStatus, run: runPost } = useActionCompletion();

  // Round 34: THE COMPLETION SHARE CARD must fire only on the real
  // not-complete -> complete TRANSITION, never on every save/post of an
  // already-complete day -- the real bug this round fixes (saving results
  // a second time for the same already-complete workout was re-opening the
  // card, with a fresh random colorway each time). `wasComplete` is
  // captured at the moment the action STARTS, before markCompleteIfNeeded()
  // can flip it, so a day that was already complete when SAVE/POST was
  // tapped never opens the card, regardless of how many times results get
  // re-saved -- the completion itself (and therefore the one-time card) is
  // already recorded in the database from whichever action completed it
  // first, so this holds across app restarts and sign-outs for free.
  const openShareCard = () => openCompletionShareCard({ kind: 'logged', title: workoutTitle, date });

  // Round 35: no more onClose() here -- SAVE RESULTS/POST TO COMMUNITY are
  // in-place confirmations now, the owner's own explicit decision. The
  // share card (a separate, global overlay) still opens on a genuine
  // first completion and layers on top of this still-open screen; closing
  // the card reveals this screen again, already showing the transformed
  // SAVED/POSTED button underneath, since it was never actually closed.
  const handleSaveResults = () => {
    const wasComplete = isCompleted(dayKey);
    runSave(() => {
      markCompleteIfNeeded();
    }, () => {
      setSaved(true);
      if (!wasComplete) openShareCard();
    });
  };

  // The pre-post "Post to Community?" confirmation dialog is gone, by
  // owner decision -- one tap, POSTED, the button itself says so.
  const handlePostToCommunity = () => {
    const wasComplete = isCompleted(dayKey);
    runPost(() => {
      markCompleteIfNeeded();
      // Awaited by useActionCompletion's own run() -- see
      // CommunityContext.tsx's addWodResultPost, which now uploads a
      // locally-picked photo/video to real Storage before writing the
      // post, so POSTED waits for that to actually finish.
      return addWodResultPost(
        displayName,
        title,
        { workoutTitle, dateLabel, notes: log.notes.trim(), resultsLine: formatResultsLine(log) },
        log.media
      );
    }, () => {
      setPosted(true);
      if (!wasComplete) openShareCard();
    });
  };

  return (
    <AppModal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container} nativeID="log-results-safe-top">
        <ModalHeader title="LOG RESULTS" onBack={onClose} backTestID="close-log-results" />

        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.workoutTitle}>{workoutTitle}</Text>
          <Text style={styles.dateLabel}>{dateLabel}</Text>

          {movements.length > 0 && (
            <View style={styles.movementsBlock} testID="log-results-movements">
              {movements.map((move, index) => {
                const parsed = parseMoveRow(move);
                return (
                  <View key={index} style={styles.movementRow}>
                    <TappableMovementText
                      style={styles.movementName}
                      text={parsed.name}
                      onOpenMovement={(movementId) => openMovementVault(movementId, 'WORKOUT')}
                    />
                    {parsed.reps ? <Text style={styles.movementReps}>{parsed.reps}</Text> : null}
                  </View>
                );
              })}
            </View>
          )}

          <Text nativeID="log-results-title-label" style={styles.label}>POST TITLE</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={handleTitleChange}
            placeholder="Post title"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="sentences"
            autoCorrect
            spellCheck
            nativeID="log-results-title-input"
            aria-label="Post title"
            testID="log-results-title"
          />

          <View style={styles.logRow}>
            <View style={styles.logField}>
              <Text nativeID="log-results-rounds-label" style={styles.label}>ROUNDS</Text>
              <TextInput
                style={styles.input}
                value={log.rounds}
                onChangeText={(v) => updateLog('rounds', v)}
                placeholder="e.g. 5"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                nativeID="log-results-rounds-input"
                aria-label="Rounds"
              />
            </View>
            <View style={styles.logField}>
              <Text nativeID="log-results-time-label" style={styles.label}>TIME</Text>
              <TextInput
                style={styles.input}
                value={log.time}
                onChangeText={(v) => updateLog('time', v)}
                placeholder="e.g. 9:42"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                nativeID="log-results-time-input"
                aria-label="Time"
              />
            </View>
          </View>

          <Text nativeID="log-results-kettlebell-label" style={styles.label}>KETTLEBELL SIZE</Text>
          <TextInput
            style={styles.input}
            value={log.kettlebell}
            onChangeText={(v) => updateLog('kettlebell', v)}
            placeholder="e.g. 16 or 2x12"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            maxLength={KETTLEBELL_SIZE_MAX_LENGTH}
            nativeID="log-results-kettlebell-input"
            aria-label="Kettlebell size"
          />

          <Text nativeID="log-results-notes-label" style={styles.label}>NOTES</Text>
          <TextInput
            style={[styles.input, styles.notesInput]}
            value={log.notes}
            onChangeText={(v) => updateLog('notes', v)}
            placeholder="How did it feel?"
            placeholderTextColor={colors.textMuted}
            multiline
            autoCapitalize="sentences"
            autoCorrect
            spellCheck
            nativeID="log-results-notes-input"
            aria-label="Notes"
          />

          <Text style={styles.label}>PHOTO / VIDEO</Text>
          <View style={styles.mediaWrap}>
            <MediaAttachmentPicker media={log.media} onChange={handleMediaChange} />
          </View>

          <View style={styles.actionRow}>
            <AppPressable
              style={[styles.saveButton, (saveStatus === 'completed' || saved) && styles.saveButtonDone]}
              pressedStyle={styles.saveButtonPressed}
              onPress={handleSaveResults}
              testID="save-results"
            >
              <Text style={[styles.saveButtonText, (saveStatus === 'completed' || saved) && styles.saveButtonTextDone]}>
                {saveStatus === 'completed' || saved ? 'SAVED ✓' : 'SAVE RESULTS'}
              </Text>
            </AppPressable>
            <AppPressable
              style={[styles.postButton, (postStatus === 'completed' || posted) && styles.postButtonDone]}
              pressedStyle={styles.postButtonPressed}
              onPress={handlePostToCommunity}
              testID="post-to-community"
            >
              <Text style={[styles.postButtonText, (postStatus === 'completed' || posted) && styles.postButtonTextDone]}>
                {postStatus === 'completed' || posted ? 'POSTED ✓' : 'POST TO COMMUNITY'}
              </Text>
            </AppPressable>
          </View>
        </ScrollView>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  // paddingTop here is the ordinary-browser-chrome value; index.html's
  // #log-results-safe-top rule adds the real env(safe-area-inset-top) on
  // top of it in standalone mode -- a single additive source. See
  // AGENTS.md's "Web safe-area insets always report zero" writeup.
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
  movementsBlock: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginBottom: 20,
  },
  movementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  movementName: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
  },
  movementReps: {
    color: colors.green,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 0.5,
    marginLeft: 12,
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
    fontSize: 16,
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
  saveButtonPressed: {
    backgroundColor: 'rgba(7,102,82,0.1)',
  },
  saveButtonText: {
    color: colors.green,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 1,
  },
  // Round 35: the in-place SAVED confirmation -- a filled gold button,
  // deliberately a different fill color from POSTED's own filled deep
  // green (postButtonDone below), so the two confirmations read as
  // distinct at a glance per the owner's own instruction. The same
  // "mirrors the house COMPLETED pattern" structure (filled button + a
  // past-tense label + a checkmark glyph) as DayPanel.tsx's own
  // completeButtonDone/completeButtonTextDone, just its own color.
  saveButtonDone: {
    backgroundColor: colors.gold,
    borderColor: colors.gold,
  },
  saveButtonTextDone: {
    color: colors.greenDeep,
  },
  postButton: {
    flex: 1,
    backgroundColor: colors.green,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
  },
  postButtonPressed: {
    backgroundColor: colors.greenDeep,
  },
  postButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 1,
  },
  // The in-place POSTED confirmation -- the exact same filled-deep-green
  // + gold-text combination DayPanel.tsx's own completeButtonDone/
  // completeButtonTextDone already uses for COMPLETED, reused verbatim
  // rather than invented fresh, since this is the same "a result is now
  // permanently recorded" moment.
  postButtonDone: {
    backgroundColor: colors.greenDeep,
  },
  postButtonTextDone: {
    color: colors.goldBright,
  },
});
