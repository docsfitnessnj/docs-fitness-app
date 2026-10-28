import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { ScreenContainer } from '../components/ScreenContainer';
import { BackendErrorNotice } from '../components/BackendErrorNotice';
import { MembershipGate } from '../components/MembershipGate';
import { Avatar } from '../components/Avatar';
import { ChallengeVideoCover } from '../components/cows/ChallengeVideoCover';
import { TappableMovementText } from '../components/movement/TappableMovementText';
import { useAuth } from '../context/AuthContext';
import { useBadges } from '../context/BadgeContext';
import { ContentCowScoringType, KettlebellLevels } from '../context/ContentLibraryContext';
import {
  ChallengeScoreLevel,
  CurrentChallenge,
  LeaderboardEntry,
  useChallenge,
  useChallengeLeaderboard,
  useCurrentChallenge,
} from '../context/ChallengeContext';
import { useDisplayName } from '../context/ProfileContext';
import { formatEtTime } from '../lib/challengeSchedule';
import { openMovementVault } from '../lib/movementVaultModal';
import { colors, fonts } from '../theme';

// Free text ("2x24", "16/20 kg", pounds) — no format validation, just a
// sane ceiling so the leaderboard row never has to wrap onto a second line.
const KETTLEBELL_SIZE_MAX_LENGTH = 40;

type Entry = LeaderboardEntry;

const LEVEL_OPTIONS: ChallengeScoreLevel[] = ['Rx', 'Scaled', 'Modified'];

// "SATURDAY 12 PM ET" (formatEtTime's own output) -> "SCORES CLOSE
// SATURDAY · 12 PM ET" — reuses the one shared, real-data-derived
// formatter rather than hardcoding a weekday/time, inserting the
// mockup's own "·" separator after the weekday word.
function scoresCloseLine(closeAtMs: number): string {
  const formatted = formatEtTime(closeAtMs);
  const firstSpace = formatted.indexOf(' ');
  if (firstSpace === -1) return `SCORES CLOSE ${formatted}`;
  return `SCORES CLOSE ${formatted.slice(0, firstSpace)} · ${formatted.slice(firstSpace + 1)}`;
}

// "Rx 32kg · Scaled 28kg · Modified 24kg" with only the weights bold.
function KettlebellLine({ levels }: { levels: KettlebellLevels }) {
  return (
    <Text style={styles.kettlebellLine}>
      <Text>Rx </Text>
      <Text style={styles.kettlebellWeight}>{levels.rx}</Text>
      <Text> · Scaled </Text>
      <Text style={styles.kettlebellWeight}>{levels.scaled}</Text>
      <Text> · Modified </Text>
      <Text style={styles.kettlebellWeight}>{levels.modified}</Text>
    </Text>
  );
}

// THE WORK's own first line bold, every following line (if any) regular —
// a plain structural rule, not markup embedded in the stored copy.
function FirstLineBoldText({ text, style, boldStyle }: { text: string; style: object; boldStyle: object }) {
  const lines = text.split('\n');
  return (
    <Text style={style}>
      <Text style={boldStyle}>{lines[0]}</Text>
      {lines.length > 1 ? `\n${lines.slice(1).join('\n')}` : ''}
    </Text>
  );
}

// The finish note's own key phrase (its first sentence) bold, the rest
// regular — same structural rule as FirstLineBoldText, just split on the
// first sentence boundary instead of the first line break.
function FirstSentenceBoldText({ text, style, boldStyle }: { text: string; style: object; boldStyle: object }) {
  const boundary = text.indexOf('. ');
  if (boundary === -1) {
    return (
      <Text style={style}>
        <Text style={boldStyle}>{text}</Text>
      </Text>
    );
  }
  const firstSentence = text.slice(0, boundary + 1);
  const rest = text.slice(boundary + 1);
  return (
    <Text style={style}>
      <Text style={boldStyle}>{firstSentence}</Text>
      {rest}
    </Text>
  );
}

function ChallengeHero({ current }: { current: CurrentChallenge }) {
  // A Challenge authored with the new structured body (any one of these
  // set) gets the full DOC'S PRESCRIBED KETTLEBELLS / THE WORK / THE CATCH
  // / finish note treatment; an older or simpler Challenge (none of this
  // set) falls back to the plain format description + movements list this
  // screen always had, never a half-rendered new section with nothing in
  // it.
  const hasRichBody = !!(current.theWork || current.catchIntro || current.kettlebellsDudes || current.kettlebellsFemales);

  return (
    <View style={styles.hero} testID="cow-hero">
      <Text style={styles.ghostWatermark} testID="cow-ghost-watermark">COW</Text>
      <View style={styles.badge} testID="cow-badge">
        <Ionicons name="flame" size={14} color={colors.text} />
        <Text style={styles.badgeText}>COW = CHALLENGE OF THE WEEK</Text>
      </View>
      <Text style={styles.heroTitle}>{current.title}</Text>
      <ChallengeVideoCover videoUrl={current.videoUrl} title={current.title} />
      {!!current.format && <Text style={styles.heroFormat}>{current.format.toUpperCase()}</Text>}
      <Text style={styles.scoresCloseLine}>{scoresCloseLine(current.closeAt)}</Text>

      {hasRichBody ? (
        <>
          {(current.kettlebellsDudes || current.kettlebellsFemales) && (
            <View style={styles.kettlebellBox} testID="cow-kettlebells-box">
              <Text style={styles.sectionHeading}>DOC'S PRESCRIBED KETTLEBELLS</Text>
              {current.kettlebellsDudes && (
                <View style={styles.kettlebellRow}>
                  <Text style={styles.kettlebellLevelLabel}>DUDES: </Text>
                  <KettlebellLine levels={current.kettlebellsDudes} />
                </View>
              )}
              {current.kettlebellsFemales && (
                <View style={styles.kettlebellRow}>
                  <Text style={styles.kettlebellLevelLabel}>FEMALES: </Text>
                  <KettlebellLine levels={current.kettlebellsFemales} />
                </View>
              )}
            </View>
          )}

          {!!current.theWork && (
            <View style={styles.bodySection}>
              <Text style={styles.sectionHeading}>THE WORK</Text>
              <FirstLineBoldText
                text={current.theWork}
                style={styles.bodyText}
                boldStyle={styles.bodyTextBold}
              />
            </View>
          )}

          {!!current.catchIntro && (
            <View style={styles.bodySection}>
              <Text style={styles.sectionHeading}>THE CATCH</Text>
              <Text style={styles.bodyText}>{current.catchIntro}</Text>
              {current.catchPenalties && current.catchPenalties.length > 0 && (
                <View style={styles.catchBox} testID="cow-catch-box">
                  {current.catchPenalties.map((line, i) => (
                    <TappableMovementText
                      key={i}
                      style={styles.catchLine}
                      linkStyle={styles.catchLineLink}
                      text={line}
                      onOpenMovement={(movementId) => openMovementVault(movementId, 'CHALLENGE')}
                    />
                  ))}
                </View>
              )}
              {!!current.catchFollowUp && <Text style={styles.followUpLine}>{current.catchFollowUp}</Text>}
            </View>
          )}

          {!!current.finishNote && (
            <View style={styles.finishNoteBox} testID="cow-finish-note">
              <FirstSentenceBoldText
                text={current.finishNote}
                style={styles.finishNoteText}
                boldStyle={styles.finishNoteTextBold}
              />
            </View>
          )}
        </>
      ) : (
        <>
          {!!current.formatDescription && (
            <TappableMovementText
              style={styles.heroSubtext}
              linkStyle={styles.heroSubtextLink}
              text={current.formatDescription}
              onOpenMovement={(movementId) => openMovementVault(movementId, 'CHALLENGE')}
            />
          )}
          {current.movements.length > 0 && (
            <View style={styles.heroMovements}>
              {current.movements.map((move, i) => (
                <View key={i} style={styles.heroMoveRow}>
                  <View style={styles.heroMoveDot} />
                  <TappableMovementText
                    style={styles.heroMoveText}
                    linkStyle={styles.heroSubtextLink}
                    text={move}
                    onOpenMovement={(movementId) => openMovementVault(movementId, 'CHALLENGE')}
                  />
                </View>
              ))}
            </View>
          )}
        </>
      )}

      <View style={styles.heroDivider} />
      {current.isClosed ? (
        <>
          <Text style={styles.daysLeftLabel}>CLOSED</Text>
          <Text style={styles.closedTiming} testID="challenge-closed-timing">
            NEW CHALLENGE DROPS {formatEtTime(current.nextRevealAt)}
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.daysLeftLabel}>CLOSES</Text>
          <Text style={styles.closedTiming} testID="challenge-open-timing">
            {formatEtTime(current.closeAt)}
          </Text>
        </>
      )}
    </View>
  );
}

function LevelPicker({ value, onChange }: { value: ChallengeScoreLevel | null; onChange: (v: ChallengeScoreLevel | null) => void }) {
  return (
    <>
      <Text nativeID="cowkiller-level-label" style={styles.label}>LEVEL (OPTIONAL)</Text>
      <View style={styles.levelRow}>
        {LEVEL_OPTIONS.map((level) => {
          const active = value === level;
          return (
            <Pressable
              key={level}
              style={[styles.levelPill, active && styles.levelPillActive]}
              onPress={() => onChange(active ? null : level)}
              testID={`cowkiller-level-${level.toLowerCase()}`}
            >
              <Text style={[styles.levelPillText, active && styles.levelPillTextActive]}>{level.toUpperCase()}</Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

function EntryForm({
  scoringType,
  onSubmit,
}: {
  scoringType: ContentCowScoringType | null;
  onSubmit: (entry: Omit<Entry, 'rank' | 'tag' | 'userId'>) => void;
}) {
  const displayName = useDisplayName();
  const { recordCowKillerScore } = useBadges();
  const [time, setTime] = useState('');
  const [rounds, setRounds] = useState('');
  const [reps, setReps] = useState('');
  const [kettlebell, setKettlebell] = useState('');
  const [level, setLevel] = useState<ChallengeScoreLevel | null>(null);

  // null (the built-in fallback challenge) shows both TIME and ROUNDS, same
  // as this screen always has — a real Content Library Challenge narrows
  // to just the field(s) its own scoring type calls for.
  const showTime = scoringType === null || scoringType === 'time';
  const showRounds = scoringType === null || scoringType === 'rounds' || scoringType === 'rounds_reps';
  const showReps = scoringType === 'rounds_reps';

  const canSubmit = showRounds && !showTime ? rounds.trim().length > 0 : time.trim().length > 0;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit({
      name: displayName,
      kettlebell: kettlebell.trim() || '—',
      rounds: rounds.trim() || '—',
      reps: showReps ? reps.trim() || '—' : undefined,
      time: showTime ? time.trim() || '—' : '—',
      level: level ?? undefined,
    });
    recordCowKillerScore();
    setTime('');
    setRounds('');
    setReps('');
    setKettlebell('');
    setLevel(null);
  };

  return (
    <View testID="cow-entry-form">
      <View style={styles.formRow}>
        {showTime && (
          <View style={styles.formField}>
            <Text nativeID="cowkiller-time-label" style={styles.label}>TIME</Text>
            <TextInput
              style={styles.input}
              value={time}
              onChangeText={setTime}
              placeholder="e.g. 9:42"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              nativeID="cowkiller-time-input"
              aria-label="Time"
            />
          </View>
        )}
        {showRounds && (
          <View style={styles.formField}>
            <Text nativeID="cowkiller-rounds-label" style={styles.label}>ROUNDS</Text>
            <TextInput
              style={styles.input}
              value={rounds}
              onChangeText={setRounds}
              placeholder="e.g. 12"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              nativeID="cowkiller-rounds-input"
              aria-label="Rounds"
            />
          </View>
        )}
        {showReps && (
          <View style={styles.formField}>
            <Text nativeID="cowkiller-reps-label" style={styles.label}>+ REPS</Text>
            <TextInput
              style={styles.input}
              value={reps}
              onChangeText={setReps}
              placeholder="e.g. 8"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              nativeID="cowkiller-reps-input"
              aria-label="Extra reps"
            />
          </View>
        )}
      </View>

      <Text nativeID="cowkiller-kettlebell-label" style={styles.label}>KETTLEBELL SIZE</Text>
      <TextInput
        style={styles.input}
        value={kettlebell}
        onChangeText={setKettlebell}
        placeholder="e.g. 16 or 2x12"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        maxLength={KETTLEBELL_SIZE_MAX_LENGTH}
        nativeID="cowkiller-kettlebell-input"
        aria-label="Kettlebell size"
      />

      <LevelPicker value={level} onChange={setLevel} />

      <Pressable style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]} disabled={!canSubmit} onPress={submit} testID="cow-submit-score">
        <Text style={styles.submitButtonText}>POST SCORE</Text>
      </Pressable>
    </View>
  );
}

// Round 39, Part 5: a gold-bordered teaser card holding just the full
// width POST YOUR SCORE button and the owner's own reassurance line —
// tapping it reveals the real entry form (TIME/ROUNDS/KETTLEBELL/LEVEL)
// directly below, inside the same card. The entry form's own mechanism
// (what happens on submit) is completely unchanged — this only changes
// what's visible before a member decides to post.
function PostScoreCard({
  scoringType,
  onSubmit,
}: {
  scoringType: ContentCowScoringType | null;
  onSubmit: (entry: Omit<Entry, 'rank' | 'tag' | 'userId'>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={styles.formCard}>
      {!expanded ? (
        <>
          <Pressable style={styles.postScoreButton} onPress={() => setExpanded(true)} testID="cow-post-score-button">
            <Text style={styles.postScoreButtonText}>POST YOUR SCORE</Text>
          </Pressable>
          <Text style={styles.postScoreHint}>
            Done? Drop your time and bell below. Posting is optional, but the board is a lot more fun with you on it.
          </Text>
        </>
      ) : (
        <EntryForm scoringType={scoringType} onSubmit={onSubmit} />
      )}
    </View>
  );
}

// A Challenge's leaderboard shows exactly one of these two displays, driven
// by its own scoring type — never a per-row guess, so it can never mix
// time-scored and rounds-scored rows even by accident.
function LeaderboardRow({ entry, isTimeScoring, isMine }: { entry: Entry; isTimeScoring: boolean; isMine: boolean }) {
  const isFirst = entry.rank === 1;
  const primaryScore = isTimeScoring ? entry.time : `${entry.rounds}${entry.reps ? ` +${entry.reps}` : ''}`;
  // "RX · 24KG" — level omitted entirely if not picked, never a blank
  // "· 24KG" with a dangling separator.
  const metaLine = `${entry.level ? `${entry.level.toUpperCase()} · ` : ''}${entry.kettlebell}KG`;
  return (
    <View style={[styles.row, isMine && styles.rowMine]} testID={isMine ? 'cow-leaderboard-own-row' : undefined}>
      <Text style={[styles.rank, isFirst && styles.rankFirst]}>{entry.rank}</Text>
      <Avatar name={entry.name} size={32} />
      <View style={styles.rowMain}>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{entry.name}</Text>
          {isFirst && (
            <MaterialCommunityIcons
              name="crown"
              size={14}
              color={colors.gold}
              style={styles.crownIcon}
              testID="leaderboard-crown"
            />
          )}
        </View>
        <Text style={styles.rowMeta}>{metaLine}</Text>
      </View>
      <View style={styles.scoreBadge}>
        <Text style={styles.scoreBadgeText}>{primaryScore}</Text>
      </View>
    </View>
  );
}

function Leaderboard({ entries, isTimeScoring, closed, myUserId }: { entries: Entry[]; isTimeScoring: boolean; closed: boolean; myUserId?: string }) {
  return (
    <View>
      <Text style={styles.subtitle}>{closed ? 'FINAL LEADERBOARD' : 'LIVE LEADERBOARD — THIS WEEK'}</Text>
      <View style={styles.list}>
        {entries.length === 0 ? (
          <Text style={styles.emptyText}>{closed ? 'No scores posted this week.' : 'No scores posted yet. Be the first.'}</Text>
        ) : (
          entries.map((entry) => (
            <LeaderboardRow key={`${entry.rank}-${entry.name}`} entry={entry} isTimeScoring={isTimeScoring} isMine={!!myUserId && entry.userId === myUserId} />
          ))
        )}
      </View>
    </View>
  );
}

// The quiet closed-week line replacing POST YOUR SCORE once scores lock —
// same treatment style as every other "nothing here yet" quiet line in the
// app (see e.g. Steady State Saturday's "Coming this week."), not a
// disabled-looking form.
function ClosedNotice() {
  return (
    <View style={styles.closedNoticeCard} testID="cow-score-closed">
      <Text style={styles.closedNoticeText}>THIS WEEK'S COW IS CLOSED</Text>
    </View>
  );
}

// No real Challenge published for the current (OPEN) cycle yet — never
// invented placeholder content, just a quiet line, same as the rest of the
// app's "nothing here yet" states. Only valid while the cycle is still
// open — see the isClosed check where this is used below.
function NoChallengeNotice() {
  return (
    <View style={styles.noChallengeCard} testID="cow-coming-this-week">
      <Text style={styles.noChallengeText}>Coming this week.</Text>
    </View>
  );
}

// The rare case where the cycle that just closed never had a real Challenge
// published for it at all — still the celebration window (Saturday noon to
// Sunday 6pm), so this must read as CLOSED, never as "Coming this week"
// (that line is reserved for an OPEN cycle awaiting content — showing it
// here would misreport the week as still running with nothing planned).
// No title/movements exist to show, so this skips the full green hero card
// and just states the timing, same quiet-card treatment as every other
// "nothing here yet" state.
function ClosedNoChallengeNotice({ current }: { current: CurrentChallenge }) {
  return (
    <View style={styles.closedNoticeCard} testID="cow-closed-no-challenge">
      <Text style={styles.closedNoticeText}>THIS WEEK'S COW IS CLOSED</Text>
      <Text style={styles.closedNoChallengeTiming}>NEW CHALLENGE DROPS {formatEtTime(current.nextRevealAt)}</Text>
    </View>
  );
}

function DocsCowsContent() {
  const { addEntry: addChallengeEntry, error } = useChallenge();
  const current = useCurrentChallenge();
  const entries = useChallengeLeaderboard();
  const { user } = useAuth();

  // Round 36: the completion share card no longer opens from a COW entry
  // at all, by owner decision -- the card is reserved exclusively for a
  // real MARK COMPLETE button press (a Doc's WOD or a deck card), and the
  // COW has no such button. See AGENTS.md's "Round 36" section.
  const addEntry = (entry: Omit<Entry, 'rank' | 'tag' | 'userId'>) => {
    addChallengeEntry({
      challengeTitle: current.title,
      kettlebell: entry.kettlebell,
      rounds: entry.rounds,
      reps: entry.reps,
      time: entry.time,
      level: entry.level,
    });
  };

  // "Coming this week" only ever describes an OPEN cycle with nothing
  // published yet — once the cycle is closed (the Saturday-noon-to-Sunday-
  // 6pm celebration window), the tab must always read as CLOSED, even in
  // the rare case no real Challenge was ever published for the week that
  // just closed. Checking isClosed here is exactly what was missing before:
  // this used to return NoChallengeNotice purely off `!current.sourceId`,
  // with no regard for whether the cycle was open or closed, so a closed
  // cycle with an empty sourceId (nothing published for it) rendered as if
  // the challenge were still upcoming instead of celebrating a finished one.
  if (!current.sourceId && !current.isClosed) {
    return <NoChallengeNotice />;
  }

  return (
    <View>
      {current.sourceId ? <ChallengeHero current={current} /> : <ClosedNoChallengeNotice current={current} />}
      {error ? (
        <BackendErrorNotice message={error} />
      ) : (
        <>
          {current.sourceId &&
            (current.isClosed ? <ClosedNotice /> : <PostScoreCard scoringType={current.scoringType} onSubmit={addEntry} />)}
          <Leaderboard
            entries={entries}
            isTimeScoring={current.scoringType === 'time' || current.scoringType === null}
            closed={current.isClosed}
            myUserId={user?.id}
          />
        </>
      )}
    </View>
  );
}

export default function DocsCowsScreen() {
  return (
    <ScreenContainer>
      <MembershipGate>
        <DocsCowsContent />
      </MembershipGate>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.green,
    borderRadius: 14,
    padding: 20,
    marginBottom: 16,
    overflow: 'hidden',
    // Part 1, item 1: the hero's own gold identity border.
    borderWidth: 1.5,
    borderColor: colors.gold,
  },
  ghostWatermark: {
    position: 'absolute',
    top: -22,
    right: -8,
    // Part 1, item 3: translucent GOLD (~14% opacity), not the old white.
    color: 'rgba(255,213,32,0.14)',
    fontFamily: fonts.headline,
    fontSize: 96,
    letterSpacing: 2,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    // Part 1, item 2: filled gold pill.
    backgroundColor: colors.gold,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 12,
    gap: 5,
  },
  badgeText: {
    // Near-black text on gold.
    color: colors.text,
    fontFamily: fonts.labelBold,
    fontSize: 11,
    letterSpacing: 1,
  },
  heroTitle: {
    color: colors.white,
    fontFamily: fonts.headline,
    fontSize: 40,
    letterSpacing: 1,
  },
  heroFormat: {
    color: colors.goldBright,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 1,
    marginTop: 4,
  },
  // Part 1, item 4: "Scores close Saturday · 12 PM ET" — condensed caps,
  // muted, directly under the format line.
  scoresCloseLine: {
    color: 'rgba(255,255,255,0.55)',
    fontFamily: fonts.labelSemiBold,
    fontSize: 11,
    letterSpacing: 0.8,
    marginTop: 4,
  },
  heroSubtext: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: fonts.body,
    fontSize: 15,
    marginTop: 8,
    lineHeight: 20,
  },
  heroSubtextLink: {
    color: colors.goldBright,
    fontFamily: fonts.bodySemiBold,
    textDecorationLine: 'underline',
  },
  heroMovements: {
    marginTop: 12,
    gap: 6,
  },
  heroMoveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroMoveDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  heroMoveText: {
    color: 'rgba(255,255,255,0.9)',
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
  },
  // Part 3, item 1: DOC'S PRESCRIBED KETTLEBELLS — a soft gray rounded box.
  kettlebellBox: {
    backgroundColor: '#F3F2EE',
    borderRadius: 10,
    padding: 14,
    marginTop: 16,
  },
  sectionHeading: {
    color: colors.greenDeep,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 1,
    marginBottom: 8,
  },
  kettlebellRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  kettlebellLevelLabel: {
    color: colors.text,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 0.6,
  },
  kettlebellLine: {
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 13,
  },
  kettlebellWeight: {
    fontFamily: fonts.bodyBold,
  },
  bodySection: {
    marginTop: 16,
  },
  bodyText: {
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 21,
  },
  bodyTextBold: {
    fontFamily: fonts.bodyBold,
  },
  // Part 3, item 3: THE CATCH's own penalty list — a box with a 3px gold
  // left border on a faint cream background.
  catchBox: {
    backgroundColor: '#FDF8E7',
    borderLeftWidth: 3,
    borderLeftColor: colors.gold,
    borderRadius: 8,
    padding: 12,
    marginTop: 10,
  },
  catchLine: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    lineHeight: 22,
  },
  catchLineLink: {
    color: colors.green,
    fontFamily: fonts.bodySemiBold,
    textDecorationLine: 'underline',
  },
  followUpLine: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
  },
  // Part 3, item 5: the finish note — a soft green box.
  finishNoteBox: {
    backgroundColor: '#EAF3F0',
    borderRadius: 10,
    padding: 14,
    marginTop: 16,
  },
  finishNoteText: {
    color: colors.greenDeep,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 21,
  },
  finishNoteTextBold: {
    fontFamily: fonts.bodyBold,
  },
  heroDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginVertical: 16,
  },
  daysLeftLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontFamily: fonts.labelSemiBold,
    fontSize: 13,
    letterSpacing: 1,
  },
  closedTiming: {
    color: colors.goldBright,
    fontFamily: fonts.headline,
    fontSize: 22,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  // Part 5: the score card gets a 1.5px gold border (replacing the
  // hairline border every other card in this app uses).
  formCard: {
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.gold,
    borderRadius: 14,
    padding: 20,
    marginBottom: 20,
  },
  postScoreButton: {
    backgroundColor: colors.gold,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  postScoreButtonText: {
    color: colors.text,
    fontFamily: fonts.labelBold,
    fontSize: 15,
    letterSpacing: 1,
  },
  postScoreHint: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 10,
  },
  closedNoticeCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    paddingVertical: 24,
    marginBottom: 20,
    alignItems: 'center',
  },
  closedNoticeText: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 13,
    letterSpacing: 1,
  },
  closedNoChallengeTiming: {
    color: colors.green,
    fontFamily: fonts.labelBold,
    fontSize: 12,
    letterSpacing: 0.5,
    marginTop: 6,
  },
  noChallengeCard: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  noChallengeText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 15,
  },
  formRow: {
    flexDirection: 'row',
    gap: 12,
  },
  formField: {
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
    backgroundColor: colors.background,
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
  levelRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  levelPill: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  levelPillActive: {
    backgroundColor: colors.greenDeep,
    borderColor: colors.greenDeep,
  },
  levelPillText: {
    color: colors.textMuted,
    fontFamily: fonts.labelBold,
    fontSize: 12,
    letterSpacing: 0.8,
  },
  levelPillTextActive: {
    color: colors.goldBright,
  },
  submitButton: {
    backgroundColor: colors.gold,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: colors.text,
    fontFamily: fonts.labelBold,
    fontSize: 14,
    letterSpacing: 1,
  },
  subtitle: {
    color: colors.green,
    fontFamily: fonts.labelSemiBold,
    fontSize: 14,
    letterSpacing: 1,
    marginBottom: 12,
  },
  list: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    overflow: 'hidden',
  },
  emptyText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.background,
  },
  // Part 5: the signed-in member's own row, highlighted with a gold
  // border -- a thin inset ring rather than changing the row's background,
  // so it reads clearly without fighting the crown/rank colors.
  rowMine: {
    borderWidth: 1.5,
    borderColor: colors.gold,
    // `row`'s own borderBottomColor (the list divider) is a more specific
    // key than borderColor and doesn't get overridden by it when the two
    // style objects merge — without this, three sides of the ring come
    // out gold and the bottom stays the plain divider shade.
    borderBottomColor: colors.gold,
    borderRadius: 10,
    marginHorizontal: 4,
  },
  rank: {
    width: 20,
    color: colors.textMuted,
    fontFamily: fonts.bodyBold,
    fontSize: 16,
  },
  rankFirst: {
    color: colors.gold,
  },
  rowMain: {
    flex: 1,
  },
  name: {
    color: colors.text,
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  crownIcon: {
    marginLeft: 5,
  },
  rowMeta: {
    color: colors.textMuted,
    fontFamily: fonts.label,
    fontSize: 12,
    marginTop: 1,
    letterSpacing: 0.5,
  },
  // Part 5: the score in "the scoreboard red badge."
  scoreBadge: {
    backgroundColor: colors.scoreboardRed,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  scoreBadgeText: {
    color: colors.white,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
  },
});
