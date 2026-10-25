import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppPressable } from './AppPressable';
import { Ionicons } from '@expo/vector-icons';
import { LogResultsModal } from './LogResultsModal';
import { ScheduleStrip } from './ScheduleStrip';
import { WatchVideoBreakdownButton } from './WatchVideoBreakdownButton';
import { TappableMovementText } from './movement/TappableMovementText';
import { useClassBookingData } from '../context/ClassBookingContext';
import { useMembership } from '../context/MembershipContext';
import { useWorkoutLog } from '../context/WorkoutLogContext';
import {
  formatDateKey,
  formatFullDate,
  parseMoveRow,
  STEADY_STATE_SATURDAY_KEY,
  STEADY_STATE_SATURDAY_NAME,
  SUNDAY_SETUP_NAME,
  WeekDay,
} from '../data/content';
import { LOCATION_NAME, rowsForDate } from '../data/schedule';
import { LOCATION_MAPS_URL } from '../lib/links';
import { ExternalLinkPressable } from './ExternalLinkPressable';
import { openCompletionShareCard } from '../lib/completionShareCard';
import { openMemberships } from '../lib/membershipsModal';
import { openMovementVault } from '../lib/movementVaultModal';
import { useIsDesktop } from '../lib/responsive';
import { openFullSchedule } from '../lib/scheduleModal';
import { useClassBooking } from '../lib/useClassBooking';
import { useSteadyStateSaturday, useSundaySetup, useTomorrowsWorkoutHidden, useWeekdayWod } from '../lib/weekendContent';
import { colors, fonts } from '../theme';

type Props = {
  day: WeekDay;
  wodUnlocked: boolean;
  // Online members train on their own schedule, so the in-person class
  // sign-up card and schedule strip aren't relevant to them up top — this
  // swaps them for one quiet line pointing at the same booking flow, in
  // case an online member is ever near Ventnor and wants to drop in.
  showClassCard: boolean;
};

function TrainingNearVentnorLine() {
  return (
    <AppPressable onPress={openFullSchedule} hitSlop={8} style={styles.ventnorLineWrap} testID="ventnor-book-class-line">
      <Text style={styles.ventnorLineText}>TRAINING NEAR VENTNOR? BOOK A CLASS AT DOC'S</Text>
    </AppPressable>
  );
}

// Inline day content shown below the (always-visible) date strip — replaces the old
// pop-up modal so the strip stays on screen and switching dates feels like one view,
// not a stack of screens.
export function DayPanel({ day, wodUnlocked, showClassCard }: Props) {
  const { isCompleted, toggleCompleted } = useWorkoutLog();
  const { handleSignUp: signUpForClass, handleCancel: cancelClass, isFull } = useClassBooking();
  const { sessions, getSession, getMyBooking } = useClassBookingData();
  const { hasActivePack, tenPackClassesRemaining } = useMembership();
  const isDesktop = useIsDesktop();
  const [logOpen, setLogOpen] = useState(false);
  const [wodExpanded, setWodExpanded] = useState(false);

  // Always called (never conditionally) even though only one of these ever
  // applies to a given day — day.weekendKind picks which result actually
  // gets used below.
  const saturdayContent = useSteadyStateSaturday(day.date);
  const sundaySetup = useSundaySetup(day.date);

  const wod = useWeekdayWod(day);
  const revealedTomorrow = useTomorrowsWorkoutHidden(day);
  const isSaturday = day.weekendKind === 'saturday';
  const isSunday = day.weekendKind === 'sunday';
  const dayKey = wod?.key ?? (isSaturday ? STEADY_STATE_SATURDAY_KEY : `rest-${day.label}`);
  const isComplete = wod ? isCompleted(dayKey) : isSaturday ? isCompleted(STEADY_STATE_SATURDAY_KEY) : false;
  const dateKey = formatDateKey(day.date);
  const dateLabel = formatFullDate(day.date);
  const weekdayName = day.date.toLocaleDateString('en-US', { weekday: 'long' });
  const scheduleRows = rowsForDate(day.date);
  // Downbeach Pilates isn't in the static schedule.ts template at all (it's
  // generated purely from class_templates/class_sessions, migration_023) —
  // pulled in here as whichever live session on this date has
  // isGuestClass, so it renders alongside the regular classes without
  // schedule.ts needing to know about it.
  const pilatesSession = useMemo(
    () => sessions.find((s) => s.isGuestClass && s.dateKey === formatDateKey(day.date)),
    [sessions, day.date]
  );
  const barLabel = isSaturday ? STEADY_STATE_SATURDAY_NAME : isSunday ? SUNDAY_SETUP_NAME : "DOC'S WORKOUT OF THE DAY";

  const toggleComplete = () => {
    // Round 33: THE COMPLETION SHARE CARD opens only on the incomplete ->
    // complete transition, never on un-completing -- `isComplete` above
    // already reflects the PRE-toggle state.
    const wasComplete = isComplete;
    if (wod) {
      toggleCompleted(dayKey, wod.title, dateLabel, day.date.getTime());
      if (!wasComplete) openCompletionShareCard({ kind: 'wod', title: wod.title, date: day.date });
    } else if (isSaturday) {
      toggleCompleted(dayKey, STEADY_STATE_SATURDAY_NAME, dateLabel, day.date.getTime());
      if (!wasComplete) openCompletionShareCard({ kind: 'wod', title: STEADY_STATE_SATURDAY_NAME, date: day.date });
    }
  };

  return (
    <View>
      <Text style={[styles.dateHeading, isDesktop && styles.dateHeadingDesktop]}>{dateLabel.toUpperCase()}</Text>

      {showClassCard && scheduleRows.length > 0 && (
        <View style={styles.card}>
          <Text style={[styles.cardHeading, isDesktop && styles.cardHeadingDesktop]}>
            DOC'S FITNESS GROUP TRAINING (IN PERSON)
          </Text>
          {hasActivePack && (
            <Text style={styles.packClassesLeft} testID="pack-classes-left">
              <Text style={styles.packClassesLeftNumber}>{tenPackClassesRemaining ?? 0}</Text>
              <Text style={styles.packClassesLeftRest}> OF 10 CLASSES LEFT</Text>
            </Text>
          )}
          {scheduleRows.map((row) => {
            const session = getSession(row.id, dateKey);
            if (!session) return null;
            const label = `${row.className} · ${weekdayName} · ${row.time}`;
            const myBooking = getMyBooking(session.id);
            const full = isFull(session);
            return (
              <View key={row.id} style={styles.classRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.classTime}>
                    {row.time} · {row.className}
                  </Text>
                  <Text style={styles.classMeta}>{row.classType}</Text>
                  <ExternalLinkPressable href={LOCATION_MAPS_URL} hitSlop={4}>
                    <Text style={styles.classLocation}>{LOCATION_NAME}</Text>
                  </ExternalLinkPressable>
                </View>
                {myBooking ? (
                  <View style={styles.signedUpWrap}>
                    <View style={styles.signedUpBadge}>
                      <Ionicons name="checkmark-circle" size={13} color={colors.green} />
                      <Text style={styles.signedUpBadgeText}>YOU'RE IN</Text>
                    </View>
                    <AppPressable
                      style={styles.cancelPill}
                      onPress={() => cancelClass(session, label)}
                      testID={`cancel-class-${row.id}`}
                    >
                      <Text style={styles.cancelPillText}>CANCEL CLASS</Text>
                    </AppPressable>
                  </View>
                ) : (
                  // Full is a dead end, not a flow — no waitlist, no tap at
                  // all once a session is at capacity. `disabled` is the
                  // real enforcement (RN Pressable never fires onPress nor
                  // shows a pressed state while disabled); the grayed style
                  // is just what makes that legible at a glance.
                  <AppPressable
                    style={[styles.signUpPill, full && styles.signUpPillFull]}
                    pressedStyle={styles.signUpPillPressed}
                    onPress={() => signUpForClass(session, label)}
                    disabled={full}
                    testID={`sign-up-${row.id}`}
                  >
                    <Text style={[styles.signUpPillText, full && styles.signUpPillTextFull]}>
                      {full ? 'CLASS FULL' : 'SIGN UP'}
                    </Text>
                  </AppPressable>
                )}
              </View>
            );
          })}

          {pilatesSession && (
            <View style={styles.pilatesCard} testID="pilates-class-row">
              <View style={{ flex: 1 }}>
                <Text style={styles.pilatesTag}>SEPARATE CLASS · NOT INCLUDED IN ANY DOC'S MEMBERSHIP</Text>
                <Text style={styles.classTime}>
                  {new Date(pilatesSession.startAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}{' '}
                  · {pilatesSession.className}
                </Text>
                <Text style={styles.classMeta}>{pilatesSession.classType}</Text>
                <ExternalLinkPressable href={LOCATION_MAPS_URL} hitSlop={4}>
                  <Text style={styles.classLocation}>{LOCATION_NAME}</Text>
                </ExternalLinkPressable>
              </View>
              {getMyBooking(pilatesSession.id) ? (
                <View style={styles.signedUpWrap}>
                  <View style={styles.signedUpBadge}>
                    <Ionicons name="checkmark-circle" size={13} color={colors.green} />
                    <Text style={styles.signedUpBadgeText}>YOU'RE IN</Text>
                  </View>
                  <AppPressable
                    style={styles.cancelPill}
                    onPress={() =>
                      cancelClass(
                        pilatesSession,
                        `${pilatesSession.className} · ${weekdayName} · ${new Date(pilatesSession.startAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`
                      )
                    }
                    testID="cancel-class-pilates"
                  >
                    <Text style={styles.cancelPillText}>CANCEL CLASS</Text>
                  </AppPressable>
                </View>
              ) : (
                <AppPressable
                  style={styles.signUpPill}
                  pressedStyle={styles.signUpPillPressed}
                  onPress={() =>
                    signUpForClass(
                      pilatesSession,
                      `${pilatesSession.className} · ${weekdayName} · ${new Date(pilatesSession.startAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`
                    )
                  }
                  testID="sign-up-pilates"
                >
                  <Text style={styles.signUpPillText}>BOOK · ${((pilatesSession.priceCents ?? 2000) / 100).toFixed(0)}</Text>
                </AppPressable>
              )}
            </View>
          )}
        </View>
      )}

      {showClassCard && (
        <>
          <ScheduleStrip />
          <View style={styles.sectionDivider} />
        </>
      )}

      <AppPressable
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
      </AppPressable>

      {!showClassCard && <TrainingNearVentnorLine />}

      {wodExpanded &&
        (wod || isSaturday || isSunday ? (
          wodUnlocked ? (
            wod ? (
              revealedTomorrow ? (
                <View style={styles.card}>
                  <Text style={[styles.cardHeading, isDesktop && styles.cardHeadingDesktop]}>
                    {dateLabel.toUpperCase()}
                  </Text>
                  <Text style={styles.comingSoonText}>Revealed tomorrow.</Text>
                </View>
              ) : (
              <View style={styles.card}>
                <Text style={[styles.cardHeading, isDesktop && styles.cardHeadingDesktop]} testID="day-panel-wod-title">
                  {wod.title}
                </Text>
                <WatchVideoBreakdownButton videoUrl={wod.videoUrl} />
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

                <View style={styles.buttonRow}>
                  <AppPressable
                    style={[styles.completeButton, isComplete && styles.completeButtonDone]}
                    onPress={toggleComplete}
                    testID="day-panel-complete"
                  >
                    <Text style={[styles.completeButtonText, isComplete && styles.completeButtonTextDone]}>
                      {isComplete ? 'COMPLETED ✓' : 'MARK COMPLETE'}
                    </Text>
                  </AppPressable>
                  <AppPressable style={styles.logButton} onPress={() => setLogOpen(true)} testID="day-panel-log">
                    <Text style={styles.logButtonText}>LOG RESULTS</Text>
                  </AppPressable>
                </View>
              </View>
              )
            ) : isSaturday ? (
              <View style={styles.card}>
                <Text style={styles.weekendFixedLabel}>{STEADY_STATE_SATURDAY_NAME}</Text>
                {revealedTomorrow ? (
                  <>
                    <Text style={[styles.cardHeading, isDesktop && styles.cardHeadingDesktop]}>
                      {dateLabel.toUpperCase()}
                    </Text>
                    <Text style={styles.comingSoonText}>Revealed tomorrow.</Text>
                  </>
                ) : saturdayContent ? (
                  <>
                    <Text style={[styles.cardHeading, isDesktop && styles.cardHeadingDesktop]}>
                      {saturdayContent.title}
                    </Text>
                    <WatchVideoBreakdownButton videoUrl={saturdayContent.videoUrl} />
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
                    <View style={styles.buttonRow}>
                      <AppPressable
                        style={[styles.completeButton, isComplete && styles.completeButtonDone]}
                        onPress={toggleComplete}
                        testID="day-panel-complete"
                      >
                        <Text style={[styles.completeButtonText, isComplete && styles.completeButtonTextDone]}>
                          {isComplete ? 'COMPLETED ✓' : 'MARK COMPLETE'}
                        </Text>
                      </AppPressable>
                      <AppPressable style={styles.logButton} onPress={() => setLogOpen(true)} testID="day-panel-log">
                        <Text style={styles.logButtonText}>LOG RESULTS</Text>
                      </AppPressable>
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
              </View>
            )
          ) : (
            <AppPressable style={styles.lockedCard} onPress={() => openMemberships('unlock')} testID="day-panel-locked-unlock">
              <Ionicons name="lock-closed" size={24} color={colors.textMuted} />
              <View style={styles.lockedLinkRow}>
                <Text style={styles.lockedLinkText}>Join to unlock this workout</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.green} />
              </View>
            </AppPressable>
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
  // Quiet, condensed-caps line under the card heading — only the number is
  // gold, so it reads at a glance without competing with the heading above
  // it or the SIGN UP pills below.
  packClassesLeft: {
    marginBottom: 10,
  },
  packClassesLeftNumber: {
    color: colors.gold,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 0.8,
  },
  packClassesLeftRest: {
    color: colors.textMuted,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 0.8,
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
  signUpPillPressed: {
    backgroundColor: colors.greenDeep,
  },
  signUpPillText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 11,
    letterSpacing: 0.8,
  },
  // Inert dead-end state — grayed, no press feedback (the `disabled` prop
  // itself is what actually blocks the tap; this is just what makes that
  // legible at a glance).
  signUpPillFull: {
    backgroundColor: colors.hairline,
  },
  signUpPillTextFull: {
    color: colors.textMuted,
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
  pilatesCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.gold,
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
  },
  pilatesTag: {
    color: colors.gold,
    fontFamily: fonts.labelBold,
    fontSize: 9,
    letterSpacing: 0.4,
    marginBottom: 4,
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
  ventnorLineWrap: {
    alignItems: 'center',
    marginBottom: 14,
  },
  ventnorLineText: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 11,
    letterSpacing: 1,
    textDecorationLine: 'underline',
  },
});
