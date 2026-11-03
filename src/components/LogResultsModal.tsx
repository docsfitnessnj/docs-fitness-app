import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppPressable } from './AppPressable';
import { AppModal } from './AppModal';
import { MediaAttachmentPicker } from './MediaAttachmentPicker';
import { ModalHeader } from './ModalHeader';
import { TappableMovementText } from './movement/TappableMovementText';
import { useCommunity } from '../context/CommunityContext';
import { useDeckProgress } from '../context/DeckProgressContext';
import { useDisplayName } from '../context/ProfileContext';
import { formatResultsLine, useWorkoutLog, WorkoutLog } from '../context/WorkoutLogContext';
import { formatShortDate, parseMoveRow } from '../data/content';
import { showAlert } from '../lib/alert';
import { findLastWeight, movementWeightKey } from '../lib/movementWeights';
import { openMovementVault } from '../lib/movementVaultModal';
import { useActionCompletion } from '../lib/useActionCompletion';
import { colors, fonts } from '../theme';

// Free text ("2x24", "16/20 kg", pounds) — no format validation, just a
// sane ceiling.
const KETTLEBELL_SIZE_MAX_LENGTH = 40;
// Free text ("24kg", "16/20", "2x16") — same convention as the overall
// kettlebell field, just scoped to one movement.
const MOVEMENT_WEIGHT_MAX_LENGTH = 24;

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
  // Round 44 — which context actually owns this log. 'deck' reuses this
  // exact same form for a deck card's Log Results (see DeckCardDetailModal)
  // — deck cards had no results-logging flow of any kind before this
  // round, only a binary MARK COMPLETE; this is the first time they get
  // the richer form the WOD path already had.
  logSource?: 'wod' | 'deck';
};

export function LogResultsModal({ visible, onClose, dayKey, workoutTitle, dateLabel, date, movements, logSource = 'wod' }: Props) {
  const displayName = useDisplayName();
  const { addWodResultPost } = useCommunity();
  const wodSource = useWorkoutLog();
  const deckSource = useDeckProgress();
  const isDeck = logSource === 'deck';

  // Round 44 — WorkoutLogContext and DeckProgressContext expose the same
  // *shape* of log data (getLog/updateLog/setLogMedia/setMovementWeight/
  // movementWeightHistory) but different method names for isCompleted/
  // toggleCompleted (deck's own toggle takes no workoutTitle/dateLabel/
  // timestamp, since a deck completion's identity is just the card id) —
  // this is the one place that difference is bridged, so the rest of this
  // component never has to branch on `isDeck` again below.
  const getLog = isDeck ? deckSource.getLog : wodSource.getLog;
  const updateLogEntry = isDeck ? deckSource.updateLog : wodSource.updateLog;
  const setLogMedia = isDeck ? deckSource.setLogMedia : wodSource.setLogMedia;
  const setMovementWeight = isDeck ? deckSource.setMovementWeight : wodSource.setMovementWeight;
  const seedMovementWeights = isDeck ? deckSource.seedMovementWeights : wodSource.seedMovementWeights;
  const isCompleted = isDeck ? deckSource.isComplete : wodSource.isCompleted;
  const isPbNow = isDeck
    ? !!deckSource.pbCardIds[dayKey]
    : !!wodSource.completedWorkouts.find((w) => w.dayKey === dayKey)?.isPb;
  const toggleCompletedForSource = () => {
    if (isDeck) deckSource.toggleComplete(dayKey);
    else wodSource.toggleCompleted(dayKey, workoutTitle, dateLabel, Date.now());
  };
  // Round 44 — "the last time you logged ANY workout containing it" spans
  // both WOD and deck history, regardless of which one this screen is
  // currently logging into.
  const weightHistory = [...wodSource.movementWeightHistory, ...deckSource.movementWeightHistory];

  const log = getLog(dayKey);

  // Round 44 — "members should never retype a weight that has not
  // changed": prefill is a real starting VALUE, not just a placeholder
  // hint the member still has to type over. Seeds any movement whose
  // weight is still blank with the last time it was logged, the instant
  // this screen opens for a day that isn't already complete (an
  // already-saved entry's own state — even a movement deliberately left
  // blank that time — is never silently overwritten by reopening it).
  // One seed pass per open; SAVE RESULTS still has to be tapped for it to
  // actually persist, same as every other field in this form.
  useEffect(() => {
    if (!visible || isCompleted(dayKey)) return;
    const seeds: Record<string, string> = {};
    for (const move of movements) {
      const key = movementWeightKey(parseMoveRow(move).name);
      if (log.movementWeights[key]) continue;
      const prefill = findLastWeight(key, weightHistory);
      if (prefill) seeds[key] = prefill;
    }
    seedMovementWeights(dayKey, seeds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, dayKey]);

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

  const updateLog = (field: 'rounds' | 'reps' | 'time' | 'kettlebell' | 'notes', value: string) => {
    updateLogEntry(dayKey, field, value);
    setSaved(false);
    setPosted(false);
  };

  const handleMediaChange = (media: Parameters<typeof setLogMedia>[1]) => {
    setLogMedia(dayKey, media);
    setSaved(false);
    setPosted(false);
  };

  // Round 44 — one movement's own weight field. Blank clears the key
  // entirely (see setMovementWeight in both contexts) rather than storing
  // an empty string, so a later prefill scan never finds a "last weight"
  // of nothing.
  const handleMovementWeightChange = (movementKey: string, value: string) => {
    setMovementWeight(dayKey, movementKey, value);
    setSaved(false);
    setPosted(false);
  };

  // The Trophy Case counts a workout the moment it's logged, not only when
  // MARK COMPLETE is tapped separately — so logging results for a day that
  // isn't already marked complete quietly marks it complete too (toggle is
  // a flip, so this only ever fires when it's not already done).
  const markCompleteIfNeeded = () => {
    if (!isCompleted(dayKey)) {
      toggleCompletedForSource();
    }
  };

  const { status: saveStatus, run: runSave } = useActionCompletion();
  const { status: postStatus, run: runPost } = useActionCompletion();

  // Round 36 (owner decision, final, supersedes Round 34's transition
  // rule): THE COMPLETION SHARE CARD fires ONLY from a real MARK COMPLETE
  // button press (a Doc's WOD or a deck card) -- never from SAVE RESULTS,
  // POST TO COMMUNITY, or a COW entry, even on a genuine first completion.
  // markCompleteIfNeeded() below calls WorkoutLogContext's own
  // toggleCompleted() directly, which has never itself opened the card --
  // the card trigger has always lived in DayPanel.tsx's/DocsWodsScreen.tsx's
  // own toggleComplete() wrapper around that same function, not inside it
  // -- so this screen marking a day complete as a side effect of saving/
  // posting results was never going to open the card on its own; the only
  // thing this round removes is the explicit openCompletionShareCard()
  // calls that used to sit alongside markCompleteIfNeeded() here.

  // Round 36: SAVE RESULTS is a toggle, by owner decision -- tapping it a
  // second time (while `saved` is true) UNSAVES: it flips straight back to
  // the editable SAVE RESULTS state with no network call, since nothing
  // server-side needs undoing (the day's own completion status is left
  // alone; only the "saved this exact version" UI flag reverts). The member
  // edits whatever they like (which also resets `saved`, same as any other
  // field edit) and re-saves, and the latest save simply overwrites the
  // previous one -- there is only ever one saved log per workout.
  const handleSaveResults = () => {
    if (saved) {
      setSaved(false);
      return;
    }
    runSave(() => {
      markCompleteIfNeeded();
    }, () => {
      setSaved(true);
    });
  };

  // Round 36: the pre-post confirmation is back, by owner decision -- one
  // more tap than Round 35 shipped, with reassurance copy so nobody feels
  // trapped by a mistaken or unfinished post. Cancel/X leave everything
  // untouched (AlertHost's own standing escape-hatch guarantee -- neither
  // ever calls a button's own onPress); only POST IT actually runs the
  // post and transforms the button to the in-place POSTED confirmation.
  const handlePostToCommunity = () => {
    showAlert(
      'POST TO THE COMMUNITY?',
      'Your results will post to the community board for the crew to see. You can always edit or delete your post later.',
      [
        { text: 'CANCEL', style: 'cancel' },
        {
          text: 'POST IT',
          onPress: () => {
            runPost(() => {
              markCompleteIfNeeded();
              // Round 44 — `isPbNow` (above) already reads whatever is_pb
              // the row currently carries. Every path that can set it
              // (toggleCompleted's own first-completion write, or a field
              // edit's syncCompletedRow write) runs and settles into a
              // fresh render BEFORE this button can be tapped -- a live
              // edit already persists its own correct is_pb the instant it
              // changes (LogResultsModal never holds score fields back
              // until a separate save step), so there is no "stale" value
              // left to recompute here; reading the same flag My Workouts
              // reads is both correct and the simplest answer. A brand-new
              // completion (markCompleteIfNeeded just above) is always
              // is_pb: false by construction, which is exactly what a
              // not-yet-rendered isPbNow already reads too.
              const isPb = isPbNow;
              // Awaited by useActionCompletion's own run() -- see
              // CommunityContext.tsx's addWodResultPost, which now uploads
              // a locally-picked photo/video to real Storage before writing
              // the post, so POSTED waits for that to actually finish.
              return addWodResultPost(
                displayName,
                title,
                { workoutTitle, dateLabel, notes: log.notes.trim(), resultsLine: formatResultsLine(log) },
                log.media,
                isPb
              );
            }, () => {
              setPosted(true);
            });
          },
        },
      ]
    );
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
                // Round 44 — every movement line gets its own optional
                // weight field, keyed by movementWeightKey (a real Movement
                // Vault match's own id when one exists, the raw line
                // otherwise — same key a format-only line like "5 Rounds"
                // falls back to, which is fine: it just never has a real
                // prefill to find). The seeding effect above already fills
                // this in as a real value the instant the screen opens for
                // a not-yet-complete day, so by the time this renders,
                // `currentWeight` already IS the prefill when one exists —
                // the member never has to retype it, just confirm or edit.
                const key = movementWeightKey(parsed.name);
                const currentWeight = log.movementWeights[key] ?? '';
                return (
                  <View key={index} style={styles.movementRow}>
                    <View style={styles.movementNameCol}>
                      <TappableMovementText
                        style={styles.movementName}
                        text={parsed.name}
                        onOpenMovement={(movementId) => openMovementVault(movementId, 'WORKOUT')}
                      />
                      {parsed.reps ? <Text style={styles.movementReps}>{parsed.reps}</Text> : null}
                    </View>
                    <TextInput
                      style={styles.movementWeightInput}
                      value={currentWeight}
                      onChangeText={(v) => handleMovementWeightChange(key, v)}
                      placeholder="kg"
                      placeholderTextColor={colors.textMuted}
                      autoCapitalize="none"
                      autoCorrect={false}
                      spellCheck={false}
                      maxLength={MOVEMENT_WEIGHT_MAX_LENGTH}
                      aria-label={`${parsed.name} weight`}
                      testID={`log-results-movement-weight-${index}`}
                    />
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
            {/* Round 44 — an AMRAP's partial-round reps, alongside Rounds.
                Always shown, same "no WOD/deck scoring-type exists to gate
                on" reasoning the overall ROUNDS/TIME fields already use —
                see AGENTS.md's Round 44 writeup. */}
            <View style={styles.logField}>
              <Text nativeID="log-results-reps-label" style={styles.label}>+ REPS</Text>
              <TextInput
                style={styles.input}
                value={log.reps}
                onChangeText={(v) => updateLog('reps', v)}
                placeholder="e.g. 8"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                nativeID="log-results-reps-input"
                aria-label="Partial-round reps"
                testID="log-results-reps"
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
    gap: 10,
  },
  movementNameCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
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
  // Round 44 — a compact per-movement weight field, small enough to sit on
  // the same row as the movement's own name without crowding it.
  movementWeightInput: {
    width: 70,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    textAlign: 'right',
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
