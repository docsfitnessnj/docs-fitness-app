import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppModal } from './AppModal';
import { LogResultsModal } from './LogResultsModal';
import { useClassSignUp } from '../context/ClassSignUpContext';
import { useWorkoutLog } from '../context/WorkoutLogContext';
import { formatFullDate, parseMoveRow, WeekDay } from '../data/content';
import { LOCATION_NAME, rowsForWeekdayIndex } from '../data/schedule';
import { colors, fonts } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  day: WeekDay | null;
  weekdayIndex: number;
  isUnlocked: boolean;
};

export function DayViewModal({ visible, onClose, day, weekdayIndex, isUnlocked }: Props) {
  const { isCompleted, toggleCompleted } = useWorkoutLog();
  const { isSignedUp, toggleSignUp } = useClassSignUp();
  const [logOpen, setLogOpen] = useState(false);

  if (!day) return null;

  const wod = day.wod;
  const dayKey = wod?.key ?? `rest-${weekdayIndex}`;
  const isComplete = wod ? isCompleted(dayKey) : false;
  const scheduleRows = rowsForWeekdayIndex(weekdayIndex);
  const dateLabel = formatFullDate(day.date);

  const toggleComplete = () => {
    if (!wod) return;
    toggleCompleted(dayKey, wod.title, dateLabel, day.date.getTime());
  };

  return (
    <>
      <AppModal visible={visible} animationType="slide" onRequestClose={onClose}>
        <View style={styles.container}>
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <View style={styles.hero}>
              <Text style={styles.ghostWatermark}>{day.label}</Text>
              <Pressable onPress={onClose} hitSlop={8} style={styles.closeButton} testID="close-day-view">
                <Ionicons name="close" size={22} color={colors.white} />
              </Pressable>
              <Text style={styles.eyebrow}>
                {wod ? `WORKOUT OF THE DAY · ${weekdayIndex + 1} OF 5` : 'REST DAY'}
              </Text>
              <Text style={styles.heroTitle}>{wod ? wod.title : 'RECOVER UP'}</Text>
              <Text style={styles.heroSubtitle}>{dateLabel.toUpperCase()}</Text>
            </View>

            {wod && isUnlocked ? (
              <View style={styles.card}>
                <Text style={styles.cardHeading}>THE WORK</Text>
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
                    testID="day-view-complete"
                  >
                    <Text style={[styles.completeButtonText, isComplete && styles.completeButtonTextDone]}>
                      {isComplete ? 'COMPLETED ✓' : 'MARK COMPLETE'}
                    </Text>
                  </Pressable>
                  <Pressable style={styles.logButton} onPress={() => setLogOpen(true)} testID="day-view-log">
                    <Text style={styles.logButtonText}>LOG RESULTS</Text>
                  </Pressable>
                </View>
              </View>
            ) : wod && !isUnlocked ? (
              <View style={styles.lockedCard}>
                <Ionicons name="lock-closed" size={26} color={colors.textMuted} />
                <Text style={styles.lockedText}>Join to unlock this workout</Text>
              </View>
            ) : (
              <View style={styles.lockedCard}>
                <Ionicons name="moon-outline" size={26} color={colors.textMuted} />
                <Text style={styles.lockedText}>Rest day. Recover up — you'll need it.</Text>
              </View>
            )}

            {scheduleRows.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardHeading}>CLASS SIGN UP · {day.label}</Text>
                {scheduleRows.map((row) => {
                  const signedUp = isSignedUp(dayKey, row.id);
                  return (
                    <View key={row.id} style={styles.classRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.classTime}>{row.time}</Text>
                        <Text style={styles.classMeta}>
                          {row.label} · {LOCATION_NAME}
                        </Text>
                      </View>
                      <Pressable
                        style={[styles.signUpPill, signedUp && styles.signUpPillActive]}
                        onPress={() => toggleSignUp(dayKey, row.id)}
                        testID={`sign-up-${row.id}`}
                      >
                        <Text style={[styles.signUpPillText, signedUp && styles.signUpPillTextActive]}>
                          {signedUp ? "YOU'RE IN" : 'SIGN UP'}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </View>
      </AppModal>

      {wod && (
        <LogResultsModal
          visible={logOpen}
          onClose={() => setLogOpen(false)}
          dayKey={dayKey}
          workoutTitle={wod.title}
          dateLabel={dateLabel}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    paddingBottom: 40,
  },
  hero: {
    backgroundColor: colors.green,
    paddingTop: 64,
    paddingBottom: 28,
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
  ghostWatermark: {
    position: 'absolute',
    top: -10,
    right: -6,
    color: 'rgba(255,255,255,0.08)',
    fontFamily: fonts.headline,
    fontSize: 110,
    letterSpacing: 2,
  },
  closeButton: {
    position: 'absolute',
    top: 20,
    right: 20,
  },
  eyebrow: {
    color: colors.goldBright,
    fontFamily: fonts.labelSemiBold,
    fontSize: 12,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  heroTitle: {
    color: colors.white,
    fontFamily: fonts.headline,
    fontSize: 38,
    letterSpacing: 0.5,
    maxWidth: '85%',
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontFamily: fonts.labelSemiBold,
    fontSize: 12,
    letterSpacing: 1,
    marginTop: 6,
  },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    padding: 18,
    marginHorizontal: 20,
    marginTop: 18,
  },
  cardHeading: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 18,
    letterSpacing: 1,
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
    marginHorizontal: 20,
    marginTop: 18,
    paddingVertical: 40,
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
    paddingVertical: 10,
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
  signUpPill: {
    backgroundColor: colors.green,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  signUpPillActive: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.gold,
  },
  signUpPillText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 11,
    letterSpacing: 0.8,
  },
  signUpPillTextActive: {
    color: colors.gold,
  },
});
