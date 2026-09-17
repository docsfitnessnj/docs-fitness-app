import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CreatePostModal } from '../components/CreatePostModal';
import { ScreenContainer } from '../components/ScreenContainer';
import { DateStrip } from '../components/DateStrip';
import { LogResultsModal } from '../components/LogResultsModal';
import { UpgradeBanner } from '../components/UpgradeBanner';
import { TappableMovementText } from '../components/movement/TappableMovementText';
import { useMembership } from '../context/MembershipContext';
import { useWorkoutLog } from '../context/WorkoutLogContext';
import {
  formatFullDate,
  formatShortDate,
  getCurrentWeek,
  isDayWodUnlocked,
  parseMoveRow,
  STEADY_STATE_SATURDAY_KEY,
  STEADY_STATE_SATURDAY_NAME,
  SUNDAY_SETUP_NAME,
} from '../data/content';
import { openMemberships } from '../lib/membershipsModal';
import { openMovementVault } from '../lib/movementVaultModal';
import { useSteadyStateSaturday, useSundaySetup } from '../lib/weekendContent';
import { colors, fonts } from '../theme';

function LockedDay() {
  return (
    <Pressable style={styles.lockedCard} onPress={() => openMemberships('unlock')} testID="wods-locked-day-unlock">
      <Ionicons name="lock-closed" size={26} color={colors.textMuted} />
      <View style={styles.lockedLinkRow}>
        <Text style={styles.lockedLinkText}>Join to unlock this workout</Text>
        <Ionicons name="chevron-forward" size={14} color={colors.green} />
      </View>
    </Pressable>
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
  const { wodAccessLevel } = useMembership();
  const { isCompleted, toggleCompleted } = useWorkoutLog();
  const [logOpen, setLogOpen] = useState(false);
  const [setupComposerOpen, setSetupComposerOpen] = useState(false);

  const week = useMemo(() => getCurrentWeek(), []);
  const todayIndex = week.findIndex((d) => d.isToday);
  const defaultIndex = todayIndex >= 0 && isDayWodUnlocked(week[todayIndex], wodAccessLevel) ? todayIndex : 0;

  const [selectedIndex, setSelectedIndex] = useState(defaultIndex);

  const isUnlocked = (index: number) => isDayWodUnlocked(week[index], wodAccessLevel);

  const selectedDay = week[selectedIndex];
  const wod = selectedDay.wod;
  const isSaturday = selectedDay.weekendKind === 'saturday';
  const isSunday = selectedDay.weekendKind === 'sunday';
  const saturdayContent = useSteadyStateSaturday(selectedDay.date);
  const sundaySetup = useSundaySetup(selectedDay.date);
  const dayKey = wod?.key ?? (isSaturday ? STEADY_STATE_SATURDAY_KEY : `rest-${selectedIndex}`);
  const isComplete = wod ? isCompleted(dayKey) : isSaturday ? isCompleted(STEADY_STATE_SATURDAY_KEY) : false;

  const toggleComplete = () => {
    if (wod) {
      toggleCompleted(dayKey, wod.title, formatFullDate(selectedDay.date), selectedDay.date.getTime());
    } else if (isSaturday) {
      toggleCompleted(dayKey, STEADY_STATE_SATURDAY_NAME, formatFullDate(selectedDay.date), selectedDay.date.getTime());
    }
  };

  return (
    <ScreenContainer>
      <DateStrip
        week={week}
        selectedIndex={selectedIndex}
        onSelect={setSelectedIndex}
        isUnlocked={isUnlocked}
        isCompleted={(index) => {
          const d = week[index];
          if (d.wod) return isCompleted(d.wod.key);
          if (d.weekendKind === 'saturday') return isCompleted(STEADY_STATE_SATURDAY_KEY);
          return false;
        }}
      />

      {!wod && !isSaturday && !isSunday ? (
        <RestDay />
      ) : !isUnlocked(selectedIndex) ? (
        <>
          {wodAccessLevel === 'partial' && <UpgradeBanner message="Unlock all 5 kettlebell workouts a week" />}
          <LockedDay />
        </>
      ) : wod ? (
        <View style={styles.card}>
          <View style={styles.cardBody}>
            <Text style={styles.cardLabel}>{formatFullDate(selectedDay.date).toUpperCase()}</Text>
            <Text style={styles.cardHeadline}>{wod.title}</Text>

            <View style={styles.divider} />

            {wod.moves.map((move, index) => {
              const parsed = parseMoveRow(move);
              return (
                <View key={index} style={styles.wodRow}>
                  <TappableMovementText
                    style={styles.wodRowText}
                    text={parsed.name}
                    onOpenMovement={(movementId) => openMovementVault(movementId, 'WORKOUT')}
                  />
                  {parsed.reps ? <Text style={styles.wodRowReps}>{parsed.reps}</Text> : null}
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

            <Pressable
              style={styles.lookupButton}
              onPress={() => openMovementVault()}
              testID="lookup-movement"
            >
              <Ionicons name="play-circle-outline" size={16} color={colors.textMuted} />
              <Text style={styles.lookupButtonText}>LOOK UP A MOVEMENT</Text>
            </Pressable>
          </View>
        </View>
      ) : isSaturday ? (
        <View style={styles.card}>
          <View style={styles.cardBody}>
            <Text style={styles.cardLabel}>{STEADY_STATE_SATURDAY_NAME}</Text>
            {saturdayContent ? (
              <>
                <Text style={styles.cardHeadline}>{saturdayContent.title}</Text>
                <View style={styles.divider} />
                <Text style={styles.weekendDescription}>{saturdayContent.description}</Text>
                {saturdayContent.movements.map((move, index) => {
                  const parsed = parseMoveRow(move);
                  return (
                    <View key={index} style={styles.wodRow}>
                      <TappableMovementText
                        style={styles.wodRowText}
                        text={parsed.name}
                        onOpenMovement={(movementId) => openMovementVault(movementId, 'WORKOUT')}
                      />
                      {parsed.reps ? <Text style={styles.wodRowReps}>{parsed.reps}</Text> : null}
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
              </>
            ) : (
              <>
                <View style={styles.divider} />
                <Text style={styles.comingSoonText}>Coming this week.</Text>
              </>
            )}
          </View>
        </View>
      ) : (
        <View style={styles.card}>
          <View style={styles.cardBody}>
            <Text style={styles.cardLabel}>{SUNDAY_SETUP_NAME}</Text>
            <View style={styles.divider} />
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
              testID="wods-post-setup"
            >
              <Text style={styles.postSetupButtonText}>POST YOUR SETUP</Text>
            </Pressable>
          </View>
        </View>
      )}

      {(wod || (isSaturday && saturdayContent)) && (
        <LogResultsModal
          visible={logOpen}
          onClose={() => setLogOpen(false)}
          dayKey={dayKey}
          workoutTitle={wod ? wod.title : STEADY_STATE_SATURDAY_NAME}
          dateLabel={formatFullDate(selectedDay.date)}
          date={selectedDay.date}
          movements={wod ? wod.moves : saturdayContent!.movements}
        />
      )}

      {isSunday && (
        <CreatePostModal
          visible={setupComposerOpen}
          onClose={() => setSetupComposerOpen(false)}
          editingPost={null}
          initialTitle={`${SUNDAY_SETUP_NAME} · ${formatShortDate(selectedDay.date)}`}
          category="Setup"
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
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 24,
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
  weekendDescription: {
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 14,
  },
  comingSoonText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 16,
  },
  quoteBlock: {
    backgroundColor: colors.background,
    borderLeftWidth: 3,
    borderLeftColor: colors.gold,
    borderRadius: 8,
    padding: 16,
    marginTop: 16,
    marginBottom: 18,
  },
  quoteText: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 16,
    lineHeight: 22,
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
  lookupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 10,
  },
  lookupButtonText: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 12,
    letterSpacing: 1,
  },
});
