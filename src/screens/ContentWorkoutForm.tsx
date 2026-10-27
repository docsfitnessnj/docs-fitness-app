import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ModalHeader } from '../components/ModalHeader';
import {
  ContentCowScoringType,
  ContentWorkout,
  ContentWorkoutInput,
  ContentWorkoutStatus,
  ContentWorkoutType,
  KettlebellLevels,
  SCORING_TYPE_LABELS,
  useContentLibrary,
} from '../context/ContentLibraryContext';
import { SUNDAY_SETUP_NAME } from '../data/content';
import { defaultQuoteIndexForSunday, SUNDAY_QUOTES } from '../data/sundayQuotes';
import { parseReleaseAt } from '../lib/contentLibraryParser';
import { findMovementInText } from '../lib/movementMatcher';
import { showAlert } from '../lib/alert';
import { colors, fonts } from '../theme';

type Props = {
  // Present when editing an existing entry; absent when creating a new one.
  workout: ContentWorkout | null;
  // Pre-selects TYPE for a new entry (e.g. whichever tab Doc was on when
  // she tapped NEW WORKOUT). Ignored once `workout` is set — editing always
  // shows that entry's own type.
  defaultType?: ContentWorkoutType;
  onSave: (input: ContentWorkoutInput) => void;
  onDelete?: () => void;
  onBack: () => void;
};

const TYPE_OPTIONS: { value: ContentWorkoutType; label: string }[] = [
  { value: 'wod', label: "DOC'S WOD" },
  { value: 'cow', label: 'CHALLENGE' },
  { value: 'steady_state', label: 'SATURDAY' },
  { value: 'sunday_setup', label: 'SUNDAY' },
];

const STATUS_OPTIONS: { value: ContentWorkoutStatus; label: string }[] = [
  { value: 'draft', label: 'DRAFT' },
  { value: 'scheduled', label: 'SCHEDULED' },
  { value: 'published', label: 'PUBLISHED' },
];

// Exactly two real scoring types — FOR TIME or ROUNDS + REPS — so a
// Challenge's leaderboard never has to guess which display to show (see
// ChallengeContext's useChallengeLeaderboard). Plain "rounds" (no reps) is
// a legacy value some already-saved Challenges may still carry; it's still
// handled everywhere it's read, just no longer offered as a new choice.
const SCORING_TYPE_OPTIONS: { value: ContentCowScoringType; label: string }[] = (
  ['time', 'rounds_reps'] as ContentCowScoringType[]
).map((value) => ({ value, label: SCORING_TYPE_LABELS[value] }));

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function dateStrOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// 12-hour with AM/PM, never military time -- parseReleaseAt() (see
// src/lib/contentLibraryParser.ts) already accepts an optional AM/PM
// meridiem on this same field, so this pre-fill format and what the admin
// types back agree with each other.
function timeStrOf(ms: number): string {
  const d = new Date(ms);
  const hour = d.getHours();
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const ampm = hour < 12 ? 'AM' : 'PM';
  return `${hour12}:${pad2(d.getMinutes())} ${ampm}`;
}

function defaultReleaseAt(): number {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setHours(6, 0, 0, 0);
  return d.getTime();
}

// Same one-week-out default as everything else, but nudged forward to the
// next matching weekday for the two date-locked weekend types, so a fresh
// STEADY STATE SATURDAY or SUNDAY SETUP form doesn't start on the wrong
// day of the week.
function defaultReleaseAtForType(type: ContentWorkoutType): number {
  const base = defaultReleaseAt();
  const targetDow = type === 'steady_state' ? 6 : type === 'sunday_setup' ? 0 : null;
  if (targetDow === null) return base;
  const d = new Date(base);
  d.setDate(d.getDate() + ((targetDow - d.getDay() + 7) % 7));
  return d.getTime();
}

// Round 39: one "Rx / Scaled / Modified" line round-trips a whole
// KettlebellLevels group — "32kg / 28kg / 24kg" in, {rx:'32kg',
// scaled:'28kg', modified:'24kg'} out. Blank (or fewer than 3 parts)
// means the admin hasn't filled this group in at all, matching every
// other optional COW field's own "nothing typed = undefined" convention.
function formatLevelsLine(levels: KettlebellLevels | undefined): string {
  return levels ? `${levels.rx} / ${levels.scaled} / ${levels.modified}` : '';
}

function parseLevelsLine(line: string): KettlebellLevels | undefined {
  const parts = line.split('/').map((p) => p.trim()).filter((p) => p.length > 0);
  if (parts.length !== 3) return undefined;
  return { rx: parts[0], scaled: parts[1], modified: parts[2] };
}

function weekdayNameFor(type: ContentWorkoutType): string | null {
  if (type === 'steady_state') return 'Saturday';
  if (type === 'sunday_setup') return 'Sunday';
  return null;
}

// Create/edit form for a single content-library entry. Kept as one flat
// form (no wizard steps) since every field is short and Doc is filling
// these in from notes she already has, not discovering the shape as she
// goes.
export function ContentWorkoutForm({ workout, defaultType, onSave, onDelete, onBack }: Props) {
  const { quoteCycleAnchor } = useContentLibrary();
  const initialType = workout?.type ?? defaultType ?? 'wod';
  const [name, setName] = useState(workout?.name ?? '');
  const [type, setType] = useState<ContentWorkoutType>(initialType);
  const [format, setFormat] = useState(workout?.format ?? '');
  const [formatDescription, setFormatDescription] = useState(workout?.formatDescription ?? '');
  const [movementsText, setMovementsText] = useState(workout?.movements.join('\n') ?? '');
  const [videoUrl, setVideoUrl] = useState(workout?.videoUrl ?? '');
  const [notes, setNotes] = useState(workout?.notes ?? '');
  const [dateStr, setDateStr] = useState(dateStrOf(workout?.releaseAt ?? defaultReleaseAtForType(initialType)));
  const [timeStr, setTimeStr] = useState(timeStrOf(workout?.releaseAt ?? defaultReleaseAtForType(initialType)));
  const [status, setStatus] = useState<ContentWorkoutStatus>(workout?.status ?? 'draft');
  const [scoringType, setScoringType] = useState<ContentCowScoringType | null>(workout?.scoringType ?? null);
  const [quoteOverrideIndex, setQuoteOverrideIndex] = useState<number | null>(workout?.quoteOverrideIndex ?? null);
  const [dateError, setDateError] = useState<string | null>(null);
  // Round 39: THE COW's own structured body — see ContentWorkout's own
  // fields for what each means. Kettlebell levels round-trip through one
  // "Rx / Scaled / Modified" text line per group, same free-text-not-a-
  // number convention as every other kettlebell field in this app.
  const [kettlebellsDudesStr, setKettlebellsDudesStr] = useState(formatLevelsLine(workout?.kettlebellsDudes));
  const [kettlebellsFemalesStr, setKettlebellsFemalesStr] = useState(formatLevelsLine(workout?.kettlebellsFemales));
  const [theWork, setTheWork] = useState(workout?.theWork ?? '');
  const [catchIntro, setCatchIntro] = useState(workout?.catchIntro ?? '');
  const [catchPenaltiesText, setCatchPenaltiesText] = useState(workout?.catchPenalties?.join('\n') ?? '');
  const [catchFollowUp, setCatchFollowUp] = useState(workout?.catchFollowUp ?? '');
  const [finishNote, setFinishNote] = useState(workout?.finishNote ?? '');

  const movementLines = movementsText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const isSaturday = type === 'steady_state';
  const isSunday = type === 'sunday_setup';
  const isWeekendType = isSaturday || isSunday;

  // A Challenge needs a scoring type before it can go anywhere — the
  // leaderboard can't render without knowing which column(s) to show.
  // Steady State Saturday needs a title and description (movements/video
  // are optional); Sunday Setup only needs a real week picked — the prep
  // focus text itself is optional, since Doc may want to save just a quote
  // override for a week before she's written the prep note.
  const canSave =
    isSaturday
      ? name.trim().length > 0 && formatDescription.trim().length > 0
      : isSunday
        ? true
        : name.trim().length > 0 && movementLines.length > 0 && (type !== 'cow' || scoringType !== null);

  // Parsed the same way handleSave parses the real release date, so the
  // preview here never disagrees with what actually gets saved — a plain
  // `new Date(dateStr)` would parse a date-only string as UTC midnight and
  // could land on the wrong local calendar day.
  const previewReleaseAt = parseReleaseAt(`${dateStr.trim()} ${timeStr.trim() || '00:00'}`);
  const upcomingSundayDefaultIndex = defaultQuoteIndexForSunday(
    previewReleaseAt !== null ? new Date(previewReleaseAt) : new Date(),
    new Date(quoteCycleAnchor)
  );

  const handleSave = () => {
    const releaseAt = parseReleaseAt(`${dateStr.trim()} ${timeStr.trim()}`);
    if (releaseAt === null) {
      setDateError('Enter the date as YYYY-MM-DD and time as H:MM AM/PM.');
      return;
    }
    const weekdayName = weekdayNameFor(type);
    if (weekdayName) {
      const targetDow = type === 'steady_state' ? 6 : 0;
      if (new Date(releaseAt).getDay() !== targetDow) {
        setDateError(`This is a ${weekdayName} entry — enter a date that actually falls on a ${weekdayName}.`);
        return;
      }
    }
    setDateError(null);
    onSave({
      name: isSunday ? SUNDAY_SETUP_NAME : name.trim(),
      originalTitle: workout?.originalTitle ?? (isSunday ? SUNDAY_SETUP_NAME : name.trim()),
      type,
      format: isWeekendType ? '' : format.trim(),
      formatDescription: formatDescription.trim(),
      movements: isSunday ? [] : movementLines,
      videoUrl: isSunday ? '' : videoUrl.trim(),
      notes: notes.trim(),
      scoringType: type === 'cow' ? scoringType ?? undefined : undefined,
      kettlebellsDudes: type === 'cow' ? parseLevelsLine(kettlebellsDudesStr) : undefined,
      kettlebellsFemales: type === 'cow' ? parseLevelsLine(kettlebellsFemalesStr) : undefined,
      theWork: type === 'cow' ? theWork.trim() || undefined : undefined,
      catchIntro: type === 'cow' ? catchIntro.trim() || undefined : undefined,
      catchPenalties: type === 'cow' ? catchPenaltiesText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0) : undefined,
      catchFollowUp: type === 'cow' ? catchFollowUp.trim() || undefined : undefined,
      finishNote: type === 'cow' ? finishNote.trim() || undefined : undefined,
      quoteOverrideIndex: isSunday ? quoteOverrideIndex ?? undefined : undefined,
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
        {!isSunday && (
          <>
            <Text style={styles.label}>{isSaturday ? 'SESSION TITLE' : 'WORKOUT NAME'}</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder={isSaturday ? 'e.g. LONG ROW HOME' : 'e.g. THE GAUNTLET'}
              placeholderTextColor={colors.textMuted}
              autoCapitalize="sentences"
              autoCorrect
              spellCheck
              aria-label="Workout name"
              testID="content-form-name"
            />
          </>
        )}

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

        {type === 'cow' && (
          <>
            <Text style={styles.label}>SCORING TYPE</Text>
            <View style={styles.segmentRow}>
              {SCORING_TYPE_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  style={[styles.segment, scoringType === opt.value && styles.segmentActive]}
                  onPress={() => setScoringType(opt.value)}
                  testID={`content-form-scoring-${opt.value}`}
                >
                  <Text style={[styles.segmentText, scoringType === opt.value && styles.segmentTextActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            {scoringType === null && (
              <Text style={styles.hint}>Required for a Challenge — this decides which column(s) the leaderboard shows.</Text>
            )}
          </>
        )}

        {!isSunday && (
          <View style={styles.videoCard} testID="content-form-video-card">
            <View style={styles.videoCardHeader}>
              <Ionicons name="videocam" size={16} color={colors.gold} />
              <Text style={styles.videoCardLabel}>VIDEO URL (OPTIONAL)</Text>
            </View>
            <TextInput
              style={styles.input}
              value={videoUrl}
              onChangeText={setVideoUrl}
              placeholder="https://youtube.com/watch?v=..."
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              aria-label="Breakdown video URL"
              testID="content-form-video-url"
            />
            <Text style={styles.videoCardHint}>
              {videoUrl.trim()
                ? 'Members will see a WATCH VIDEO BREAKDOWN button on this workout.'
                : "Leave blank for no video — members won't see a video button at all. Paste a YouTube link to turn one on."}
            </Text>
          </View>
        )}

        {!isWeekendType && (
          <>
            <Text style={styles.label}>FORMAT</Text>
            <TextInput
              style={styles.input}
              value={format}
              onChangeText={setFormat}
              placeholder="e.g. 30min AMRAP, 5 Rounds, EMOM 12"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="sentences"
              autoCorrect
              spellCheck
              aria-label="Format"
              testID="content-form-format"
            />
          </>
        )}

        <Text style={styles.label}>{isSaturday ? 'DESCRIPTION' : isSunday ? 'PREP FOCUS' : 'FORMAT DESCRIPTION'}</Text>
        <TextInput
          style={[styles.input, styles.multilineInput]}
          value={formatDescription}
          onChangeText={setFormatDescription}
          placeholder={
            isSaturday
              ? 'What this week’s Zone 2 session is — distance, time, effort.'
              : isSunday
                ? 'A short prep note for the week ahead.'
                : 'How the format is run — rounds, rest, scoring.'
          }
          placeholderTextColor={colors.textMuted}
          multiline
          autoCapitalize="sentences"
          autoCorrect
          spellCheck
          aria-label="Format description"
          testID="content-form-format-description"
        />

        {!isSunday && (
          <>
            <Text style={styles.label}>{isSaturday ? 'MOVEMENTS (ONE PER LINE, OPTIONAL)' : 'MOVEMENTS (ONE PER LINE)'}</Text>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={movementsText}
              onChangeText={setMovementsText}
              placeholder={'Kettlebell Swings\nGoblet Squats\nPush-Ups'}
              placeholderTextColor={colors.textMuted}
              multiline
              autoCapitalize="sentences"
              autoCorrect
              spellCheck
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
          </>
        )}

        {isSunday && (
          <>
            <Text style={styles.label}>QUOTE FOR THIS WEEK</Text>
            <Pressable
              style={[styles.quoteDefaultRow, quoteOverrideIndex === null && styles.quoteRowActive]}
              onPress={() => setQuoteOverrideIndex(null)}
              testID="content-form-quote-default"
            >
              <Text style={[styles.quoteDefaultRowText, quoteOverrideIndex === null && styles.quoteRowTextActive]}>
                USE THIS WEEK'S DEFAULT — #{upcomingSundayDefaultIndex + 1}: "{SUNDAY_QUOTES[upcomingSundayDefaultIndex].text}"
              </Text>
            </Pressable>
            <View style={styles.quoteList}>
              {SUNDAY_QUOTES.map((q, i) => (
                <Pressable
                  key={i}
                  style={[styles.quoteRow, quoteOverrideIndex === i && styles.quoteRowActive]}
                  onPress={() => setQuoteOverrideIndex(i)}
                  testID={`content-form-quote-${i}`}
                >
                  <Text style={[styles.quoteRowNumber, quoteOverrideIndex === i && styles.quoteRowTextActive]}>{i + 1}.</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.quoteRowText, quoteOverrideIndex === i && styles.quoteRowTextActive]}>"{q.text}"</Text>
                    <Text style={[styles.quoteRowAttribution, quoteOverrideIndex === i && styles.quoteRowTextActive]}>
                      {q.attribution}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
            <Text style={styles.hint}>
              Overriding here only changes this one week's quote — the cycle keeps its place for every other week.
            </Text>
          </>
        )}

        {type === 'cow' && (
          <>
            <Text style={styles.label}>DOC'S PRESCRIBED KETTLEBELLS — DUDES (RX / SCALED / MODIFIED)</Text>
            <TextInput
              style={styles.input}
              value={kettlebellsDudesStr}
              onChangeText={setKettlebellsDudesStr}
              placeholder="e.g. 32kg / 28kg / 24kg"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              aria-label="Dudes kettlebell levels"
              testID="content-form-kettlebells-dudes"
            />
            <Text style={styles.label}>DOC'S PRESCRIBED KETTLEBELLS — FEMALES (RX / SCALED / MODIFIED)</Text>
            <TextInput
              style={styles.input}
              value={kettlebellsFemalesStr}
              onChangeText={setKettlebellsFemalesStr}
              placeholder="e.g. 24kg / 20kg / 16kg"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              aria-label="Females kettlebell levels"
              testID="content-form-kettlebells-females"
            />

            <Text style={styles.label}>THE WORK</Text>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={theWork}
              onChangeText={setTheWork}
              placeholder={'50 Pull Ups, for time.\nSubs: ...'}
              placeholderTextColor={colors.textMuted}
              multiline
              autoCapitalize="sentences"
              autoCorrect
              spellCheck
              aria-label="The work"
              testID="content-form-the-work"
            />
            <Text style={styles.hint}>Members see the first line bold, exactly as typed.</Text>

            <Text style={styles.label}>THE CATCH — INTRO LINE</Text>
            <TextInput
              style={styles.input}
              value={catchIntro}
              onChangeText={setCatchIntro}
              placeholder="Every time you drop off the bar, pay the toll:"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="sentences"
              autoCorrect
              spellCheck
              aria-label="The catch intro line"
              testID="content-form-catch-intro"
            />
            <Text style={styles.label}>THE CATCH — PENALTY LIST (ONE PER LINE)</Text>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={catchPenaltiesText}
              onChangeText={setCatchPenaltiesText}
              placeholder={'8 Swings\n6 Thrusters\n4/4 Goblet Reverse Lunges\n2 Burpees'}
              placeholderTextColor={colors.textMuted}
              multiline
              autoCapitalize="sentences"
              autoCorrect
              spellCheck
              aria-label="The catch penalty list, one per line"
              testID="content-form-catch-penalties"
            />
            <Text style={styles.label}>THE CATCH — FOLLOW-UP LINE</Text>
            <TextInput
              style={styles.input}
              value={catchFollowUp}
              onChangeText={setCatchFollowUp}
              placeholder="Then get back on the bar right where you left off."
              placeholderTextColor={colors.textMuted}
              autoCapitalize="sentences"
              autoCorrect
              spellCheck
              aria-label="The catch follow-up line"
              testID="content-form-catch-followup"
            />

            <Text style={styles.label}>FINISH NOTE</Text>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={finishNote}
              onChangeText={setFinishNote}
              placeholder="Your time stops when you finish the toll after your final pull up."
              placeholderTextColor={colors.textMuted}
              multiline
              autoCapitalize="sentences"
              autoCorrect
              spellCheck
              aria-label="Finish note"
              testID="content-form-finish-note"
            />
            <Text style={styles.hint}>Members see the first sentence bold, exactly as typed.</Text>
          </>
        )}

        <Text style={styles.label}>NOTES</Text>
        <TextInput
          style={[styles.input, styles.multilineInput]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Anything else for whoever preps this."
          placeholderTextColor={colors.textMuted}
          multiline
          autoCapitalize="sentences"
          autoCorrect
          spellCheck
          aria-label="Notes"
          testID="content-form-notes"
        />

        <Text style={styles.label}>
          {isSaturday ? 'WEEK (THIS SATURDAY’S DATE)' : isSunday ? 'WEEK (THIS SUNDAY’S DATE)' : 'RELEASE DATE & TIME'}
        </Text>
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
              spellCheck={false}
              aria-label="Release date"
              testID="content-form-release-date"
            />
          </View>
          <View style={styles.dateField}>
            <TextInput
              style={styles.input}
              value={timeStr}
              onChangeText={setTimeStr}
              placeholder="H:MM AM/PM"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              aria-label="Release time, 12 hour with AM or PM"
              testID="content-form-release-time"
            />
          </View>
        </View>
        <Text style={styles.hint}>12-hour time, e.g. 6:00 AM or 6:00 PM.</Text>
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
  // No paddingTop here -- ScreenOverlay's own fill (topBasePadding={60})
  // provides it as a single additive source with the real top inset. See
  // AGENTS.md's "Web safe-area insets always report zero" writeup.
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
    fontSize: 16,
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
  videoCard: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.gold,
    borderRadius: 12,
    padding: 14,
    marginTop: 18,
  },
  videoCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  videoCardLabel: {
    color: colors.greenDeep,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 1,
  },
  videoCardHint: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 8,
  },
  quoteDefaultRow: {
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 10,
    padding: 10,
    backgroundColor: colors.card,
    marginBottom: 10,
  },
  quoteDefaultRowText: {
    color: colors.text,
    fontFamily: fonts.labelBold,
    fontSize: 11,
    letterSpacing: 0.3,
    lineHeight: 15,
  },
  quoteList: {
    gap: 8,
  },
  quoteRow: {
    flexDirection: 'row',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 10,
    padding: 10,
    backgroundColor: colors.card,
  },
  quoteRowActive: {
    backgroundColor: colors.green,
    borderColor: colors.green,
  },
  quoteRowNumber: {
    color: colors.textMuted,
    fontFamily: fonts.labelBold,
    fontSize: 12,
    width: 20,
  },
  quoteRowText: {
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 16,
  },
  quoteRowAttribution: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 10,
    letterSpacing: 0.3,
    marginTop: 3,
  },
  quoteRowTextActive: {
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
