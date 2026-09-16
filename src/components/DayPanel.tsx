import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CreatePostModal } from './CreatePostModal';
import { LogResultsModal } from './LogResultsModal';
import { ScheduleStrip } from './ScheduleStrip';
import { TappableMovementText } from './movement/TappableMovementText';
import { useWorkoutLog } from '../context/WorkoutLogContext';
import {
  formatDateKey,
  formatFullDate,
  formatShortDate,
  parseMoveRow,
  STEADY_STATE_SATURDAY_KEY,
  STEADY_STATE_SATURDAY_NAME,
  SUNDAY_SETUP_NAME,
  WeekDay,
} from '../data/content';
import { LOCATION_NAME, rowsForDate } from '../data/schedule';
import { openLocationMaps } from '../lib/links';
import { openMemberships } from '../lib/membershipsModal';
import { openMovementVault } from '../lib/movementVaultModal';
import { useIsDesktop } from '../lib/responsive';
import { useClassBooking } from '../lib/useClassBooking';
import { useSteadyStateSaturday, useSundaySetup } from '../lib/weekendContent';
import { colors, fonts } from '../theme';

type Props = {
  day: WeekDay;
  wodUnlocked: boolean;
};

// Inline day content shown below the (always-visible) date strip — replaces the old
// pop-up modal so the strip stays on screen and switching dates feels like one view,
// not a stack of screens.
export function DayPanel({ day, wodUnlocked }: Props) {
  const { isCompleted, toggleCompleted } = useWorkoutLog();
  const { isSignedUp, handleSignUp: signUpForClass, handleCancel: cancelClass } = useClassBooking();
  const isDesktop = useIsDesktop();
  const [logOpen, setLogOpen] = useState(false);
  const [wodExpanded, setWodExpanded] = useState(false);
  const [setupComposerOpen, setSetupComposerOpen] = useState(false);

  // Always called (never conditionally) even though only one of these ever
  // applies to a given day — day.weekendKind picks which result actually
  // gets used below.
  const saturdayContent = useSteadyStateSaturday(day.date);
  const sundaySetup = useSundaySetup(day.date);

  const wod = day.wod;
  const isSaturday = day.weekendKind === 'saturday';
  const isSunday = day.weekendKind === 'sunday';
  const dayKey = wod?.key ?? (isSaturday ? STEADY_STATE_SATURDAY_KEY : `rest-${day.label}`);
  const isComplete = wod ? isCompleted(dayKey) : isSaturday ? isCompleted(STEADY_STATE_SATURDAY_KEY) : false;
  const dateKey = formatDateKey(day.date);
  const dateLabel = formatFullDate(day.date);
  const weekdayName = day.date.toLocaleDateString('en-US', { weekday: 'long' });
  const scheduleRows = rowsForDate(day.date);
  const barLabel = isSaturday ? STEADY_STATE_SATURDAY_NAME : isSunday ? SUNDAY_SETUP_NAME : "DOC'S WORKOUT OF THE DAY";

  const toggleComplete = () => {
    if (wod) {
      toggleCompleted(dayKey, wod.title, dateLabel, day.date.getTime());
    } else if (isSaturday) {
      toggleCompleted(dayKey, STEADY_STATE_SATURDAY_NAME, dateLabel, day.date.getTime());
    }
  };

  const handleSignUp = (row: (typeof scheduleRows)[number]) => signUpForClass(row, dateKey, weekdayName);
  const handleCancel = (row: (typeof scheduleRows)[number]) => cancelClass(row, dateKey, weekdayName);

  return (
    <View>
      <Text style={[styles.dateHeading, isDesktop && styles.dateHeadingDesktop]}>{dateLabel.toUpperCase()}</Text>

      {scheduleRows.length > 0 && (
        <View style={styles.card}>
          <Text style={[styles.cardHeading, isDesktop && styles.cardHeadingDesktop]}>
            DOC'S FITNESS GROUP TRAINING (IN PERSON)
          </Text>
          {scheduleRows.map((row) => {
            const signedUp = isSignedUp(dateKey, row.id);
            return (
              <View key={row.id} style={styles.classRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.classTime}>
                    {row.time} · {row.className}
                  </Text>
                  <Text style={styles.classMeta}>{row.classType}</Text>
                  <Pressable onPress={openLocationMaps} hitSlop={4}>
                    <Text style={styles.classLocation}>{LOCATION_NAME}</Text>
                  </Pressable>
                </View>
                {signedUp ? (
                  <View style={styles.signedUpWrap}>
                    <View style={styles.signedUpBadge}>
                      <Ionicons name="checkmark-circle" size={13} color={colors.green} />
                      <Text style={styles.signedUpBadgeText}>YOU'RE IN</Text>
                    </View>
                    <Pressable
                      style={styles.cancelPill}
                      onPress={() => handleCancel(row)}
                      testID={`cancel-class-${row.id}`}
                    >
                      <Text style={styles.cancelPillText}>CANCEL CLASS</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable style={styles.signUpPill} onPress={() => handleSignUp(row)} testID={`sign-up-${row.id}`}>
                    <Text style={styles.signUpPillText}>SIGN UP</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
      )}

      <ScheduleStrip />

      <View style={styles.sectionDivider} />

      <Pressable
        style={styles.wodBar}
        onPress={() => setWodExpanded((v) => !v)}
        testID="wod-bar-toggle"
      >
        <Text style={[styles.wodBarLabel, isDesktop && styles.wodBarLabelDesktop]}>{barLabel}</Text>
        <View style={styles.wodBarRight}>
          {isComplete && (
            <Ionicons
              name="checkmark-circle"
              size={20}
              color={colors.green}
              style={styles.wodBarCheck}
              testID="wod-bar-complete-check"
            />
          )}
          <Ionicons name={wodExpanded ? 'chevron-up' : 'chevron-down'} size={22} color={colors.textMuted} />
        </View>
      </Pressable>

      {wodExpanded &&
        (wod || isSaturday || isSunday ? (
          wodUnlocked ? (
            wod ? (
              <View style={styles.card}>
                <Text style={[styles.cardHeading, isDesktop && styles.cardHeadingDesktop]}>{wod.title}</Text>
                {wod.moves.map((move, index) => {
                  const parsed = parseMoveRow(move);
                  return (
                    <View key={index} style={styles.moveRow}>
                      <TappableMovementText
                        style={styles.moveName}
                        text={parsed.name}
                        onOpenMovement={(movementId) => openMovementVault(movementId, 'WORKOUT')}
                      />
                      {parsed.reps ? <Text style={styles.moveReps}>{parsed.reps}</Text> : null}
                    </View>
                  );
                })}

                <View style={styles.watchChip}>
                  <Ionicons name="play-circle-outline" size={16} color={colors.green} />
                  <Text style={styles.watchChipText}>WATCH BREAKDOWN</Text>
                </View>

                <View style={styles.buttonRow}>
                  <Pressable
                    style={[styles.completeButton, isComplete && styles.completeButtonDone]}
                    onPress={toggleComplete}
                    testID="day-panel-complete"
                  >
                    <Text style={[styles.completeButtonText, isComplete && styles.completeButtonTextDone]}>
                      {isComplete ? 'COMPLETED ✓' : 'MARK COMPLETE'}
                    </Text>
                  </Pressable>
                  <Pressable style={styles.logButton} onPress={() => setLogOpen(true)} testID="day-panel-log">
                    <Text style={styles.logButtonText}>LOG RESULTS</Text>
                  </Pressable>
                </View>
              </View>
            ) : isSaturday ? (
              <View style={styles.card}>
                <Text style={styles.weekendFixedLabel}>{STEADY_STATE_SATURDAY_NAME}</Text>
                {saturdayContent ? (
                  <>
                    <Text style={[styles.cardHeading, isDesktop && styles.cardHeadingDesktop]}>
                      {saturdayContent.title}
                    </Text>
                    <Text style={styles.weekendDescription}>{saturdayContent.description}</Text>
                    {saturdayContent.movements.map((move, index) => {
                      const parsed = parseMoveRow(move);
                      return (
                        <View key={index} style={styles.moveRow}>
                          <TappableMovementText
                            style={styles.moveName}
                            text={parsed.name}
                            onOpenMovement={(movementId) => openMovementVault(movementId, 'WORKOUT')}
                          />
                          {parsed.reps ? <Text style={styles.moveReps}>{parsed.reps}</Text> : null}
                        </View>
                      );
                    })}
                    {!!saturdayContent.videoUrl && (
                      <View style={styles.watchChip}>
                        <Ionicons name="play-circle-outline" size={16} color={colors.green} />
                        <Text style={styles.watchChipText}>WATCH BREAKDOWN</Text>
                      </View>
                    )}
                    <View style={styles.buttonRow}>
                      <Pressable
                        style={[styles.completeButton, isComplete && styles.completeButtonDone]}
                        onPress={toggleComplete}
                        testID="day-panel-complete"
                      >
                        <Text style={[styles.completeButtonText, isComplete && styles.completeButtonTextDone]}>
                          {isComplete ? 'COMPLETED ✓' : 'MARK COMPLETE'}
                        </Text>
                      </Pressable>
                      <Pressable style={styles.logButton} onPress={() => setLogOpen(true)} testID="day-panel-log">
                        <Text style={styles.logButtonText}>LOG RESULTS</Text>
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <Text style={styles.comingSoonText}>Coming this week.</Text>
                )}
              </View>
            ) : (
              <View style={styles.card}>
                <Text style={styles.weekendFixedLabel}>{SUNDAY_SETUP_NAME}</Text>
                {sundaySetup.prepFocus ? (
                  <Text style={styles.weekendDescription}>{sundaySetup.prepFocus}</Text>
                ) : (
                  <Text style={styles.comingSoonText}>Coming this week.</Text>
                )}
                <View style={styles.quoteBlock}>
                  <Text style={styles.quoteText}>"{sundaySetup.quote.text}"</Text>
                  <Text style={styles.quoteAttribution}>— {sundaySetup.quote.attribution}</Text>
                </View>
                <Pressable
                  style={styles.postSetupButton}
                  onPress={() => setSetupComposerOpen(true)}
                  testID="day-panel-post-setup"
                >
                  <Text style={styles.postSetupButtonText}>POST YOUR SETUP</Text>
                </Pressable>
              </View>
            )
          ) : (
            <Pressable style={styles.lockedCard} onPress={() => openMemberships('unlock')} testID="day-panel-locked-unlock">
              <Ionicons name="lock-closed" size={24} color={colors.textMuted} />
              <View style={styles.lockedLinkRow}>
                <Text style={styles.lockedLinkText}>Join to unlock this workout</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.green} />
              </View>
            </Pressable>
          )
        ) : (
          <View style={styles.lockedCard}>
            <Ionicons name="moon-outline" size={24} color={colors.textMuted} />
            <Text style={styles.lockedText}>Rest day. Recover up — you'll need it.</Text>
          </View>
        ))}

      {(wod || (isSaturday && saturdayContent)) && (
        <LogResultsModal
          visible={logOpen}
          onClose={() => setLogOpen(false)}
          dayKey={dayKey}
          workoutTitle={wod ? wod.title : STEADY_STATE_SATURDAY_NAME}
          dateLabel={dateLabel}
          date={day.date}
          movements={wod ? wod.moves : saturdayContent!.movements}
        />
      )}

      {isSunday && (
        <CreatePostModal
          visible={setupComposerOpen}
          onClose={() => setSetupComposerOpen(false)}
          editingPost={null}
          initialTitle={`${SUNDAY_SETUP_NAME} · ${formatShortDate(day.date)}`}
          category="Setup"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dateHeading: {
    color: colors.green,
    fontFamily: fonts.labelSemiBold,
    fontSize: 12,
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  dateHeadingDesktop: {
    fontSize: 14,
  },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    padding: 18,
    marginBottom: 18,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: colors.hairline,
    marginBottom: 18,
  },
  wodBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 20,
    marginBottom: 14,
  },
  wodBarLabel: {
    color: colors.text,
    fontFamily: fonts.labelBold,
    fontSize: 17,
    letterSpacing: 0.8,
  },
  wodBarLabelDesktop: {
    fontSize: 20,
  },
  wodBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  wodBarCheck: {
    marginRight: 10,
  },
  cardHeading: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 22,
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  cardHeadingDesktop: {
    fontSize: 26,
  },
  weekendFixedLabel: {
    color: colors.green,
    fontFamily: fonts.labelSemiBold,
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 6,
  },
  weekendDescription: {
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 14,
  },
  comingSoonText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 15,
  },
  quoteBlock: {
    backgroundColor: colors.background,
    borderLeftWidth: 3,
    borderLeftColor: colors.gold,
    borderRadius: 8,
    padding: 14,
    marginTop: 14,
    marginBottom: 16,
  },
  quoteText: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    lineHeight: 21,
    fontStyle: 'italic',
  },
  quoteAttribution: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 12,
    letterSpacing: 0.3,
    marginTop: 8,
  },
  postSetupButton: {
    backgroundColor: colors.green,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
  },
  postSetupButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 1,
  },
  moveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.background,
  },
  moveName: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
  },
  moveReps: {
    color: colors.green,
    fontFamily: fonts.labelBold,
    fontSize: 14,
    letterSpacing: 0.5,
    marginLeft: 12,
  },
  watchChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: colors.background,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 14,
  },
  watchChipText: {
    color: colors.green,
    fontFamily: fonts.labelSemiBold,
    fontSize: 11,
    letterSpacing: 1,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  completeButton: {
    flex: 1,
    backgroundColor: colors.green,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  completeButtonDone: {
    backgroundColor: colors.greenDeep,
  },
  completeButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 1,
  },
  completeButtonTextDone: {
    color: colors.goldBright,
  },
  logButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.green,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  logButtonText: {
    color: colors.green,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 1,
  },
  lockedCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    marginBottom: 18,
    paddingVertical: 36,
    alignItems: 'center',
  },
  lockedText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 15,
    marginTop: 10,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  lockedLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  lockedLinkText: {
    color: colors.green,
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    textDecorationLine: 'underline',
    marginRight: 4,
  },
  classRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.background,
  },
  classTime: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
  },
  classMeta: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    marginTop: 2,
  },
  classLocation: {
    color: colors.green,
    fontFamily: fonts.labelSemiBold,
    fontSize: 11,
    letterSpacing: 0.3,
    textDecorationLine: 'underline',
    marginTop: 3,
  },
  signUpPill: {
    backgroundColor: colors.green,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  signUpPillText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 11,
    letterSpacing: 0.8,
  },
  signedUpWrap: {
    alignItems: 'flex-end',
    gap: 6,
  },
  signedUpBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  signedUpBadgeText: {
    color: colors.green,
    fontFamily: fonts.labelBold,
    fontSize: 11,
    letterSpacing: 0.8,
  },
  cancelPill: {
    borderWidth: 1,
    borderColor: colors.scoreboardRed,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  cancelPillText: {
    color: colors.scoreboardRed,
    fontFamily: fonts.labelBold,
    fontSize: 10,
    letterSpacing: 0.5,
  },
});
