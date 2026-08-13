import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../components/ScreenContainer';
import { DateStrip } from '../components/DateStrip';
import { useMembership } from '../context/MembershipContext';
import { useCommunity } from '../context/CommunityContext';
import { formatFullDate, getCurrentWeek } from '../data/content';
import { showAlert } from '../lib/alert';
import { colors, fonts, TAGLINE } from '../theme';

const FREE_WEEKDAYS_UNLOCKED = 2;

type LogEntry = { rounds: string; time: string; kettlebell: string; notes: string };

const EMPTY_LOG: LogEntry = { rounds: '', time: '', kettlebell: '', notes: '' };

function VideoPlaceholder() {
  return (
    <View style={styles.videoPlaceholder}>
      <View style={styles.playCircle}>
        <Ionicons name="play" size={22} color={colors.background} />
      </View>
      <Text style={styles.videoLabel}>WATCH DOC'S BREAKDOWN</Text>
    </View>
  );
}

function LockedDay() {
  return (
    <View style={styles.lockedCard}>
      <Ionicons name="lock-closed" size={28} color={colors.textMuted} />
      <Text style={styles.lockedText}>Join to unlock this workout</Text>
    </View>
  );
}

function RestDay() {
  return (
    <View style={styles.lockedCard}>
      <Ionicons name="moon" size={28} color={colors.textMuted} />
      <Text style={styles.lockedText}>Rest day. Recover up — you'll need it.</Text>
    </View>
  );
}

export default function DocsWodsScreen() {
  const { hasFullAccess, displayName } = useMembership();
  const { addWodResultPost } = useCommunity();

  const week = useMemo(() => getCurrentWeek(), []);
  const todayIndex = week.findIndex((d) => d.isToday);
  const defaultIndex = todayIndex >= 0 && (hasFullAccess || todayIndex < FREE_WEEKDAYS_UNLOCKED) ? todayIndex : 0;

  const [selectedIndex, setSelectedIndex] = useState(defaultIndex);
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [logs, setLogs] = useState<Record<string, LogEntry>>({});
  const [savedFlash, setSavedFlash] = useState(false);

  const isUnlocked = (index: number) => hasFullAccess || index < FREE_WEEKDAYS_UNLOCKED;

  const selectedDay = week[selectedIndex];
  const dayKey = selectedDay.wod?.key ?? `rest-${selectedIndex}`;
  const log = logs[dayKey] ?? EMPTY_LOG;
  const isComplete = !!completed[dayKey];

  const updateLog = (field: keyof LogEntry, value: string) => {
    setLogs((prev) => ({ ...prev, [dayKey]: { ...(prev[dayKey] ?? EMPTY_LOG), [field]: value } }));
  };

  const toggleComplete = () => {
    setCompleted((prev) => ({ ...prev, [dayKey]: !prev[dayKey] }));
  };

  const handleSave = () => {
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1800);
  };

  const handlePostToCommunity = () => {
    const hasResults = log.rounds.trim() || log.time.trim() || log.kettlebell.trim();
    if (!hasResults) {
      showAlert('Log Your Results First', 'Add rounds, time, or kettlebell size before posting.');
      return;
    }
    showAlert(
      'Post to Community',
      'Post your name, workout, and results to the community board?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Post',
          onPress: () => {
            const parts = [
              log.rounds.trim() && `Rounds: ${log.rounds.trim()}`,
              log.time.trim() && `Time: ${log.time.trim()}`,
              log.kettlebell.trim() && `KB: ${log.kettlebell.trim()}`,
            ].filter(Boolean);
            const results = parts.join(' · ') + (log.notes.trim() ? `\n${log.notes.trim()}` : '');
            addWodResultPost(displayName, {
              workoutTitle: selectedDay.wod!.title,
              dateLabel: formatFullDate(selectedDay.date),
              results,
            });
            showAlert('Posted!', 'Your result is live on the Community board.');
          },
        },
      ]
    );
  };

  return (
    <ScreenContainer>
      <Text style={styles.tagline}>{TAGLINE}</Text>

      <DateStrip
        week={week}
        selectedIndex={selectedIndex}
        onSelect={setSelectedIndex}
        isUnlocked={isUnlocked}
        isCompleted={(index) => {
          const wod = week[index].wod;
          return wod ? !!completed[wod.key] : false;
        }}
      />

      {selectedDay.isRestDay ? (
        <RestDay />
      ) : !isUnlocked(selectedIndex) ? (
        <LockedDay />
      ) : (
        <View>
          <VideoPlaceholder />

          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardLabel}>{formatFullDate(selectedDay.date).toUpperCase()}</Text>
                <Text style={styles.cardHeadline}>{selectedDay.wod!.title}</Text>
              </View>
              <Pressable
                onPress={toggleComplete}
                style={[styles.completeCircle, isComplete && styles.completeCircleDone]}
                hitSlop={8}
                testID="complete-circle"
              >
                {isComplete && <Ionicons name="checkmark" size={20} color={colors.background} />}
              </Pressable>
            </View>

            <View style={styles.divider} />

            {selectedDay.wod!.moves.map((move) => (
              <View key={move} style={styles.wodRow}>
                <View style={styles.bullet} />
                <Text style={styles.wodRowText}>{move}</Text>
              </View>
            ))}
          </View>

          <View style={styles.logCard}>
            <Text style={styles.logTitle}>LOG YOUR RESULTS</Text>

            <View style={styles.logRow}>
              <View style={styles.logField}>
                <Text style={styles.label}>ROUNDS</Text>
                <TextInput
                  style={styles.input}
                  value={log.rounds}
                  onChangeText={(v) => updateLog('rounds', v)}
                  placeholder="e.g. 5"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
              <View style={styles.logField}>
                <Text style={styles.label}>TIME</Text>
                <TextInput
                  style={styles.input}
                  value={log.time}
                  onChangeText={(v) => updateLog('time', v)}
                  placeholder="e.g. 9:42"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            </View>

            <Text style={styles.label}>KETTLEBELL SIZE</Text>
            <TextInput
              style={styles.input}
              value={log.kettlebell}
              onChangeText={(v) => updateLog('kettlebell', v)}
              placeholder="e.g. 35lb"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={styles.label}>NOTES</Text>
            <TextInput
              style={[styles.input, styles.notesInput]}
              value={log.notes}
              onChangeText={(v) => updateLog('notes', v)}
              placeholder="How did it feel?"
              placeholderTextColor={colors.textMuted}
              multiline
            />

            <View style={styles.buttonRow}>
              <Pressable style={styles.saveButton} onPress={handleSave}>
                <Text style={styles.saveButtonText}>{savedFlash ? 'SAVED ✓' : 'SAVE'}</Text>
              </Pressable>
              <Pressable style={styles.postButton} onPress={handlePostToCommunity}>
                <Text style={styles.postButtonText}>POST TO COMMUNITY</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  tagline: {
    color: colors.highlight,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    letterSpacing: 1,
    marginBottom: 20,
    textTransform: 'uppercase',
  },
  videoPlaceholder: {
    backgroundColor: colors.locked,
    borderRadius: 12,
    paddingVertical: 28,
    alignItems: 'center',
    marginBottom: 16,
  },
  playCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.highlight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  videoLabel: {
    color: colors.textMuted,
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    letterSpacing: 1,
  },
  lockedCard: {
    backgroundColor: colors.backgroundLight,
    borderRadius: 12,
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
    backgroundColor: colors.backgroundLight,
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  cardLabel: {
    color: colors.accent,
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    letterSpacing: 1,
  },
  cardHeadline: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 32,
    letterSpacing: 1,
    marginTop: 2,
  },
  completeCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: colors.locked,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  completeCircleDone: {
    backgroundColor: '#4CAF7D',
    borderColor: '#4CAF7D',
  },
  divider: {
    height: 1,
    backgroundColor: colors.locked,
    marginVertical: 14,
  },
  wodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  bullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.highlight,
    marginRight: 10,
  },
  wodRowText: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 18,
  },
  logCard: {
    backgroundColor: colors.backgroundLight,
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
  },
  logTitle: {
    color: colors.accent,
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    letterSpacing: 2,
    marginBottom: 16,
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
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    marginBottom: 14,
  },
  notesInput: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  saveButton: {
    flex: 1,
    backgroundColor: colors.locked,
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
  },
  saveButtonText: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    letterSpacing: 1,
  },
  postButton: {
    flex: 1.6,
    backgroundColor: colors.highlight,
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
  },
  postButtonText: {
    color: colors.background,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    letterSpacing: 1,
  },
});
