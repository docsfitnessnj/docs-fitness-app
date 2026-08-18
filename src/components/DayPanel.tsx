import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LogResultsModal } from './LogResultsModal';
import { ScheduleStrip } from './ScheduleStrip';
import { useClassSignUp } from '../context/ClassSignUpContext';
import { planLabel, useMembership } from '../context/MembershipContext';
import { useDisplayName } from '../context/ProfileContext';
import { useWorkoutLog } from '../context/WorkoutLogContext';
import { formatDateKey, formatFullDate, parseMoveRow, WeekDay } from '../data/content';
import { LOCATION_NAME, rowsForDate } from '../data/schedule';
import { openLocationMaps } from '../lib/links';
import { showAlert } from '../lib/alert';
import { colors, fonts } from '../theme';

// Tiers that book a class instantly, no payment gate — Doc's own account
// and the unlimited in-person plan.
const INSTANT_BOOK_TIERS = ['admin', 'in_person_unlimited'];
// Tiers that see the "want unlimited classes?" upsell line inside the $30
// drop-in paywall — online-only members who don't already have an
// in-person plan.
const ONLINE_ONLY_TIERS = ['trial', 'online_paid', 'online_free'];
const DROP_IN_PRICE = 30;

type Props = {
  day: WeekDay;
  wodUnlocked: boolean;
};

// Inline day content shown below the (always-visible) date strip — replaces the old
// pop-up modal so the strip stays on screen and switching dates feels like one view,
// not a stack of screens.
export function DayPanel({ day, wodUnlocked }: Props) {
  const { isCompleted, toggleCompleted } = useWorkoutLog();
  const { isSignedUp, signUp, cancelSignUp } = useClassSignUp();
  const membership = useMembership();
  const displayName = useDisplayName();
  const [logOpen, setLogOpen] = useState(false);
  const [wodExpanded, setWodExpanded] = useState(false);

  const wod = day.wod;
  const dayKey = wod?.key ?? `rest-${day.label}`;
  const isComplete = wod ? isCompleted(dayKey) : false;
  const dateKey = formatDateKey(day.date);
  const dateLabel = formatFullDate(day.date);
  const weekdayName = day.date.toLocaleDateString('en-US', { weekday: 'long' });
  const scheduleRows = rowsForDate(day.date);

  const toggleComplete = () => {
    if (!wod) return;
    toggleCompleted(dayKey, wod.title, dateLabel, day.date.getTime());
  };

  const bookClass = (row: (typeof scheduleRows)[number]) => {
    signUp({
      dateKey,
      classId: row.id,
      className: row.className,
      classType: row.classType,
      time: row.time,
      dayLabel: weekdayName,
      memberName: displayName,
      planType: planLabel(membership.tier),
    });
  };

  const handleSignUp = (row: (typeof scheduleRows)[number]) => {
    if (INSTANT_BOOK_TIERS.includes(membership.tier)) {
      bookClass(row);
      showAlert("YOU'RE IN", `${row.className} · ${weekdayName} · ${row.time}`);
      return;
    }

    if (membership.tier === 'ten_pack') {
      const remaining = membership.tenPackClassesRemaining ?? 0;
      if (remaining <= 0) {
        showAlert('No Classes Left', 'Your 10 Class Pack is used up. Grab a new pack or switch plans in Memberships.');
        return;
      }
      bookClass(row);
      membership.useTenPackClass();
      showAlert("YOU'RE IN", `${row.className} · ${weekdayName} · ${row.time}\n${remaining - 1} classes left`);
      return;
    }

    const upsell = ONLINE_ONLY_TIERS.includes(membership.tier)
      ? '\n\nWant unlimited classes? See Monthly Unlimited in Memberships.'
      : '';
    showAlert(`Class Drop In Is $${DROP_IN_PRICE}`, `${row.className} · ${weekdayName} · ${row.time}${upsell}`, [
      { text: 'Not Now', style: 'cancel' },
      {
        text: `Pay $${DROP_IN_PRICE} and Book`,
        onPress: () => {
          bookClass(row);
          showAlert("YOU'RE IN", `Payment simulated — ${row.className} · ${weekdayName} · ${row.time}`);
        },
      },
    ]);
  };

  const handleCancel = (row: (typeof scheduleRows)[number]) => {
    showAlert('Cancel This Class?', `${row.className} · ${weekdayName} · ${row.time}`, [
      { text: 'Keep My Spot', style: 'cancel' },
      {
        text: 'Cancel Class',
        style: 'destructive',
        onPress: () => {
          cancelSignUp(dateKey, row.id);
          if (membership.tier === 'ten_pack') membership.refundTenPackClass();
        },
      },
    ]);
  };

  return (
    <View>
      <Text style={styles.dateHeading}>{dateLabel.toUpperCase()}</Text>

      {scheduleRows.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardHeading}>DOC'S FITNESS GROUP TRAINING (IN PERSON)</Text>
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

      <Pressable
        style={styles.wodBar}
        onPress={() => setWodExpanded((v) => !v)}
        testID="wod-bar-toggle"
      >
        <Text style={styles.wodBarLabel}>DOC'S WORKOUT OF THE DAY</Text>
        <View style={styles.wodBarRight}>
          {isComplete && (
            <Ionicons
              name="checkmark-circle"
              size={16}
              color={colors.green}
              style={styles.wodBarCheck}
              testID="wod-bar-complete-check"
            />
          )}
          <Ionicons name={wodExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
        </View>
      </Pressable>

      {wodExpanded &&
        (wod && wodUnlocked ? (
          <View style={styles.card}>
            <Text style={styles.cardHeading}>{wod.title}</Text>
            {wod.moves.map((move, index) => {
              const parsed = parseMoveRow(move);
              return (
                <View key={index} style={styles.moveRow}>
                  <Text style={styles.moveName}>{parsed.name}</Text>
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
        ) : wod && !wodUnlocked ? (
          <View style={styles.lockedCard}>
            <Ionicons name="lock-closed" size={24} color={colors.textMuted} />
            <Text style={styles.lockedText}>Join to unlock this workout</Text>
          </View>
        ) : (
          <View style={styles.lockedCard}>
            <Ionicons name="moon-outline" size={24} color={colors.textMuted} />
            <Text style={styles.lockedText}>Rest day. Recover up — you'll need it.</Text>
          </View>
        ))}

      {wod && (
        <LogResultsModal
          visible={logOpen}
          onClose={() => setLogOpen(false)}
          dayKey={dayKey}
          workoutTitle={wod.title}
          dateLabel={dateLabel}
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
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    padding: 18,
    marginBottom: 18,
  },
  wodBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 14,
  },
  wodBarLabel: {
    color: colors.text,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 0.8,
  },
  wodBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  wodBarCheck: {
    marginRight: 8,
  },
  cardHeading: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 22,
    letterSpacing: 0.5,
    marginBottom: 12,
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
