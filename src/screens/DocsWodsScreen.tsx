import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../components/ScreenContainer';
import { DateStrip } from '../components/DateStrip';
import { LogResultsModal } from '../components/LogResultsModal';
import { useMembership } from '../context/MembershipContext';
import { useWorkoutLog } from '../context/WorkoutLogContext';
import { formatFullDate, getCurrentWeek, parseMoveRow } from '../data/content';
import { colors, fonts } from '../theme';

const FREE_WEEKDAYS_UNLOCKED = 2;

function LockedDay() {
  return (
    <View style={styles.lockedCard}>
      <Ionicons name="lock-closed" size={26} color={colors.textMuted} />
      <Text style={styles.lockedText}>Join to unlock this workout</Text>
    </View>
  );
}

function RestDay() {
  return (
    <View style={styles.lockedCard}>
      <Ionicons name="moon-outline" size={26} color={colors.textMuted} />
      <Text style={styles.lockedText}>Rest day. Recover up — you'll need it.</Text>
    </View>
  );
}

export default function DocsWodsScreen() {
  const { hasFullAccess } = useMembership();
  const { isCompleted, toggleCompleted } = useWorkoutLog();
  const [logOpen, setLogOpen] = useState(false);

  const week = useMemo(() => getCurrentWeek(), []);
  const todayIndex = week.findIndex((d) => d.isToday);
  const defaultIndex = todayIndex >= 0 && (hasFullAccess || todayIndex < FREE_WEEKDAYS_UNLOCKED) ? todayIndex : 0;

  const [selectedIndex, setSelectedIndex] = useState(defaultIndex);

  const isUnlocked = (index: number) => hasFullAccess || index < FREE_WEEKDAYS_UNLOCKED;

  const selectedDay = week[selectedIndex];
  const wod = selectedDay.wod;
  const dayKey = wod?.key ?? `rest-${selectedIndex}`;
  const isComplete = wod ? isCompleted(dayKey) : false;

  const toggleComplete = () => {
    if (!wod) return;
    toggleCompleted(dayKey, wod.title, formatFullDate(selectedDay.date), selectedDay.date.getTime());
  };

  return (
    <ScreenContainer>
      <DateStrip
        week={week}
        selectedIndex={selectedIndex}
        onSelect={setSelectedIndex}
        isUnlocked={isUnlocked}
        isCompleted={(index) => {
          const w = week[index].wod;
          return w ? isCompleted(w.key) : false;
        }}
      />

      {selectedDay.isRestDay ? (
        <RestDay />
      ) : !isUnlocked(selectedIndex) ? (
        <LockedDay />
      ) : (
        <View style={styles.card}>
          <View style={styles.mediaBand}>
            <View style={styles.playCircle}>
              <Ionicons name="play" size={20} color={colors.green} />
            </View>
            <Text style={styles.mediaKicker}>WATCH DOC'S BREAKDOWN</Text>
          </View>

          <View style={styles.cardBody}>
            <Text style={styles.cardLabel}>{formatFullDate(selectedDay.date).toUpperCase()}</Text>
            <Text style={styles.cardHeadline}>{wod!.title}</Text>

            <View style={styles.divider} />

            {wod!.moves.map((move, index) => {
              const parsed = parseMoveRow(move);
              return (
                <View key={index} style={styles.wodRow}>
                  <Text style={styles.wodRowText}>{parsed.name}</Text>
                  {parsed.reps ? <Text style={styles.wodRowReps}>{parsed.reps}</Text> : null}
                </View>
              );
            })}

            <View style={styles.buttonRow}>
              <Pressable
                style={[styles.completeButton, isComplete && styles.completeButtonDone]}
                onPress={toggleComplete}
                testID="complete-circle"
              >
                <Text style={[styles.completeButtonText, isComplete && styles.completeButtonTextDone]}>
                  {isComplete ? 'COMPLETED ✓' : 'MARK COMPLETE'}
                </Text>
              </Pressable>
              <Pressable style={styles.logButton} onPress={() => setLogOpen(true)}>
                <Text style={styles.logButtonText}>LOG RESULTS</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {wod && (
        <LogResultsModal
          visible={logOpen}
          onClose={() => setLogOpen(false)}
          dayKey={dayKey}
          workoutTitle={wod.title}
          dateLabel={formatFullDate(selectedDay.date)}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  lockedCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    paddingVertical: 48,
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
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 24,
  },
  mediaBand: {
    backgroundColor: colors.green,
    paddingVertical: 26,
    alignItems: 'center',
  },
  playCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  mediaKicker: {
    color: colors.goldBright,
    fontFamily: fonts.labelSemiBold,
    fontSize: 12,
    letterSpacing: 1.5,
  },
  cardBody: {
    padding: 20,
  },
  cardLabel: {
    color: colors.green,
    fontFamily: fonts.labelSemiBold,
    fontSize: 13,
    letterSpacing: 1,
  },
  cardHeadline: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 34,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.hairline,
    marginVertical: 14,
  },
  wodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.background,
  },
  wodRowText: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 17,
  },
  wodRowReps: {
    color: colors.green,
    fontFamily: fonts.labelBold,
    fontSize: 15,
    marginLeft: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  completeButton: {
    flex: 1,
    backgroundColor: colors.green,
    borderRadius: 10,
    paddingVertical: 14,
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
    paddingVertical: 14,
    alignItems: 'center',
  },
  logButtonText: {
    color: colors.green,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 1,
  },
});
