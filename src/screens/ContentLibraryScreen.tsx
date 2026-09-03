import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ModalHeader } from '../components/ModalHeader';
import {
  ContentWorkout,
  ContentWorkoutStatus,
  ContentWorkoutType,
  WEEKLY_COW_TARGET,
  WEEKLY_WOD_TARGET,
  WeekGroup,
  groupWorkoutsByMonth,
  monthLabel,
  useContentLibrary,
  weekLabel,
} from '../context/ContentLibraryContext';
import { getWeekStart } from '../data/content';
import { showAlert } from '../lib/alert';
import { ContentBulkImportScreen } from './ContentBulkImportScreen';
import { ContentWorkoutForm } from './ContentWorkoutForm';
import { colors, fonts } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

type LibraryView = { kind: 'list' } | { kind: 'form'; workout: ContentWorkout | null } | { kind: 'bulk' };

function upcomingWeekStart(): number {
  // "The following week" — the Monday-Sunday week after the one containing
  // today, which is exactly the week the Sunday-6pm-ET auto-release (once
  // real) would be publishing.
  return getWeekStart(new Date()).getTime() + 7 * 24 * 60 * 60 * 1000;
}

function weekGapSummary(group: Pick<WeekGroup, 'wodCount' | 'cowCount'>): string | null {
  const missing: string[] = [];
  if (group.wodCount < WEEKLY_WOD_TARGET) missing.push(`${WEEKLY_WOD_TARGET - group.wodCount} WOD${WEEKLY_WOD_TARGET - group.wodCount === 1 ? '' : 's'}`);
  if (group.cowCount < WEEKLY_COW_TARGET) missing.push('Challenge of the Week');
  if (missing.length === 0) return null;
  return `Missing ${missing.join(' · ')}`;
}

function TypePill({ type }: { type: ContentWorkoutType }) {
  return (
    <View style={[styles.typePill, type === 'cow' && styles.typePillCow]}>
      <Text style={[styles.typePillText, type === 'cow' && styles.typePillTextCow]}>
        {type === 'wod' ? "DOC'S WOD" : 'CHALLENGE'}
      </Text>
    </View>
  );
}

function StatusPill({ status }: { status: ContentWorkoutStatus }) {
  return (
    <View style={[styles.statusPill, statusPillStyle(status)]}>
      <Text style={[styles.statusPillText, statusPillTextStyle(status)]}>{status.toUpperCase()}</Text>
    </View>
  );
}

function statusPillStyle(status: ContentWorkoutStatus) {
  if (status === 'released') return styles.statusPillReleased;
  if (status === 'scheduled') return styles.statusPillScheduled;
  return styles.statusPillDraft;
}
function statusPillTextStyle(status: ContentWorkoutStatus) {
  if (status === 'released') return styles.statusPillTextReleased;
  if (status === 'scheduled') return styles.statusPillTextScheduled;
  return undefined;
}

function formatReleaseAt(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }) + ' · ' + new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// Admin-only workout planning calendar — draft, schedule, and (once a
// backend exists) publish Doc's WODs and the Challenge of the Week ahead of
// time. Everything here reads/writes ContentLibraryContext, which is local-
// only for now (see that file's storage-key comment); nothing in this
// screen is visible to members regardless of status.
export function ContentLibraryScreen({ visible, onClose }: Props) {
  const { workouts, addWorkout, updateWorkout, deleteWorkout, importWorkouts, releaseWeek } = useContentLibrary();
  const [view, setView] = useState<LibraryView>({ kind: 'list' });
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(() => new Set());

  const months = useMemo(() => groupWorkoutsByMonth(workouts), [workouts]);

  // First render: open the month closest to today so the screen never lands
  // on a wall of collapsed rows with nothing to look at.
  const [initialized, setInitialized] = useState(false);
  if (!initialized && months.length > 0) {
    const todayMonth = new Date();
    const closest = months.reduce((best, m) => {
      const [y, mo] = m.monthKey.split('-').map(Number);
      const diff = Math.abs(y * 12 + mo - (todayMonth.getFullYear() * 12 + todayMonth.getMonth()));
      const [by, bmo] = best.monthKey.split('-').map(Number);
      const bestDiff = Math.abs(by * 12 + bmo - (todayMonth.getFullYear() * 12 + todayMonth.getMonth()));
      return diff < bestDiff ? m : best;
    }, months[0]);
    setExpandedMonths(new Set([closest.monthKey]));
    setInitialized(true);
  }

  if (!visible) return null;

  const toggleMonth = (key: string) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (view.kind === 'form') {
    return (
      <ContentWorkoutForm
        workout={view.workout}
        onBack={() => setView({ kind: 'list' })}
        onSave={(input) => {
          if (view.workout) updateWorkout(view.workout.id, input);
          else addWorkout(input);
          setView({ kind: 'list' });
        }}
        onDelete={
          view.workout
            ? () => {
                deleteWorkout(view.workout!.id);
                setView({ kind: 'list' });
              }
            : undefined
        }
      />
    );
  }

  if (view.kind === 'bulk') {
    return (
      <ContentBulkImportScreen
        onBack={() => setView({ kind: 'list' })}
        onImport={(inputs) => {
          importWorkouts(inputs);
          setView({ kind: 'list' });
        }}
      />
    );
  }

  const weekStart = upcomingWeekStart();
  const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000;
  const upcoming = workouts
    .filter((w) => w.releaseAt >= weekStart && w.releaseAt < weekEnd)
    .sort((a, b) => a.releaseAt - b.releaseAt);
  const upcomingWodCount = upcoming.filter((w) => w.type === 'wod').length;
  const upcomingCowCount = upcoming.filter((w) => w.type === 'cow').length;
  // This week's Sunday at 6:00 PM (the app has no timezone-conversion
  // machinery anywhere else, so — like every other date in this codebase —
  // "local time" is treated as ET, which is what the device driving a
  // Ventnor City, NJ gym will be set to in practice).
  const autoReleaseSunday = new Date(getWeekStart(new Date()).getTime() + 6 * 24 * 60 * 60 * 1000);
  autoReleaseSunday.setHours(18, 0, 0, 0);
  const autoReleaseAt = autoReleaseSunday.getTime();

  const handlePublishWeek = () => {
    if (upcoming.length === 0) return;
    showAlert(
      `Publish ${upcoming.length} workout${upcoming.length === 1 ? '' : 's'}?`,
      `${weekLabel(weekStart)} will be marked RELEASED. This is local-only until the backend is connected — nothing goes live to members yet.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Publish', onPress: () => releaseWeek(weekStart) },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <ModalHeader title="CONTENT LIBRARY" onBack={onClose} backTestID="close-content-library" />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.localBanner} testID="content-local-only-banner">
          <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
          <Text style={styles.localBannerText}>
            Drafts are stored locally on this device until the backend is connected. Nothing here is live to members
            yet, regardless of status.
          </Text>
        </View>

        <View style={styles.actionRow}>
          <Pressable
            style={styles.actionButton}
            onPress={() => setView({ kind: 'form', workout: null })}
            testID="content-new-workout"
          >
            <Ionicons name="add-circle-outline" size={16} color={colors.white} />
            <Text style={styles.actionButtonText}>NEW WORKOUT</Text>
          </Pressable>
          <Pressable
            style={styles.actionButtonOutline}
            onPress={() => setView({ kind: 'bulk' })}
            testID="content-bulk-import-open"
          >
            <Ionicons name="clipboard-outline" size={16} color={colors.green} />
            <Text style={styles.actionButtonOutlineText}>BULK PASTE IMPORT</Text>
          </Pressable>
        </View>

        <View style={styles.releaseCard} testID="content-release-this-week">
          <Text style={styles.releaseHeading}>RELEASE THIS WEEK</Text>
          <Text style={styles.releaseWeekLabel}>{weekLabel(weekStart)}</Text>
          <Text style={styles.releaseCounts}>
            {upcomingWodCount}/{WEEKLY_WOD_TARGET} DOC'S WODS · {upcomingCowCount}/{WEEKLY_COW_TARGET} CHALLENGE OF
            THE WEEK
          </Text>

          {upcoming.length === 0 ? (
            <Text style={styles.releaseEmptyText}>Nothing scheduled for this week yet.</Text>
          ) : (
            upcoming.map((w) => (
              <View key={w.id} style={styles.releaseRow}>
                <TypePill type={w.type} />
                <Text style={styles.releaseRowName} numberOfLines={1}>
                  {w.name}
                </Text>
                <StatusPill status={w.status} />
              </View>
            ))
          )}

          <Pressable
            style={[styles.publishButton, upcoming.length === 0 && styles.publishButtonDisabled]}
            disabled={upcoming.length === 0}
            onPress={handlePublishWeek}
            testID="content-release-week-button"
          >
            <Text style={styles.publishButtonText}>REVIEW &amp; PUBLISH THIS WEEK</Text>
          </Pressable>

          <Text style={styles.autoReleaseText}>
            Auto-releases every Sunday at 6:00 PM ET for the following week — next: {formatReleaseAt(autoReleaseAt)}.
          </Text>
        </View>

        <Text style={styles.sectionHeading}>ALL WORKOUTS</Text>
        {months.length === 0 ? (
          <Text style={styles.emptyText}>
            Nothing drafted yet. Add a workout above, or bulk-paste a batch to get started.
          </Text>
        ) : (
          months.map((month) => {
            const isOpen = expandedMonths.has(month.monthKey);
            const totalWorkouts = month.weeks.reduce((sum, w) => sum + w.workouts.length, 0);
            const gapWeeks = month.weeks.filter((w) => !w.isComplete).length;
            return (
              <View key={month.monthKey} style={styles.monthCard}>
                <Pressable
                  style={styles.monthHeader}
                  onPress={() => toggleMonth(month.monthKey)}
                  testID={`content-month-${month.monthKey}`}
                >
                  <Ionicons name={isOpen ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.text} />
                  <Text style={styles.monthTitle}>{monthLabel(month.monthKey)}</Text>
                  <Text style={styles.monthMeta}>
                    {totalWorkouts} workout{totalWorkouts === 1 ? '' : 's'}
                    {gapWeeks > 0 ? ` · ${gapWeeks} week${gapWeeks === 1 ? '' : 's'} with gaps` : ' · complete'}
                  </Text>
                </Pressable>

                {isOpen && (
                  <View style={styles.weekList}>
                    {month.weeks.map((week) => {
                      const gapSummary = weekGapSummary(week);
                      return (
                        <View key={week.weekStart} style={styles.weekCard} testID={`content-week-${week.weekStart}`}>
                          <View style={styles.weekHeader}>
                            <Text style={styles.weekLabel}>{weekLabel(week.weekStart)}</Text>
                            <View style={[styles.weekBadge, week.isComplete ? styles.weekBadgeComplete : styles.weekBadgeGap]}>
                              <Text
                                style={[
                                  styles.weekBadgeText,
                                  week.isComplete ? styles.weekBadgeTextComplete : styles.weekBadgeTextGap,
                                ]}
                              >
                                {week.isComplete ? 'COMPLETE' : 'GAPS'}
                              </Text>
                            </View>
                          </View>
                          {gapSummary && <Text style={styles.weekGapText}>{gapSummary}</Text>}

                          {week.workouts.map((w) => (
                            <Pressable
                              key={w.id}
                              style={styles.workoutRow}
                              onPress={() => setView({ kind: 'form', workout: w })}
                              testID={`content-workout-${w.id}`}
                            >
                              <View style={{ flex: 1 }}>
                                <Text style={styles.workoutName} numberOfLines={1}>
                                  {w.name}
                                </Text>
                                <View style={styles.workoutMetaRow}>
                                  <TypePill type={w.type} />
                                  <Text style={styles.workoutDate}>{formatReleaseAt(w.releaseAt)}</Text>
                                </View>
                              </View>
                              <StatusPill status={w.status} />
                              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                            </Pressable>
                          ))}
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 60,
  },
  body: {
    paddingHorizontal: 20,
    paddingBottom: 48,
  },
  localBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  localBannerText: {
    flex: 1,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 17,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.green,
    borderRadius: 10,
    paddingVertical: 13,
  },
  actionButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 12,
    letterSpacing: 0.5,
  },
  actionButtonOutline: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: colors.green,
    borderRadius: 10,
    paddingVertical: 13,
  },
  actionButtonOutlineText: {
    color: colors.green,
    fontFamily: fonts.labelBold,
    fontSize: 12,
    letterSpacing: 0.5,
  },
  releaseCard: {
    backgroundColor: colors.greenDeep,
    borderRadius: 14,
    padding: 18,
    marginBottom: 28,
  },
  releaseHeading: {
    color: colors.goldBright,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 1.5,
  },
  releaseWeekLabel: {
    color: colors.white,
    fontFamily: fonts.headline,
    fontSize: 26,
    letterSpacing: 0.5,
    marginTop: 4,
  },
  releaseCounts: {
    color: 'rgba(255,255,255,0.8)',
    fontFamily: fonts.labelSemiBold,
    fontSize: 12,
    letterSpacing: 0.5,
    marginTop: 4,
    marginBottom: 14,
  },
  releaseEmptyText: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: fonts.body,
    fontSize: 13,
    marginBottom: 14,
  },
  releaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.15)',
  },
  releaseRowName: {
    flex: 1,
    color: colors.white,
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
  },
  publishButton: {
    backgroundColor: colors.goldBright,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 14,
  },
  publishButtonDisabled: {
    opacity: 0.4,
  },
  publishButtonText: {
    color: colors.greenDeep,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 1,
  },
  autoReleaseText: {
    color: 'rgba(255,255,255,0.65)',
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 10,
  },
  sectionHeading: {
    color: colors.green,
    fontFamily: fonts.headline,
    fontSize: 20,
    letterSpacing: 1,
    marginBottom: 12,
  },
  emptyText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13,
  },
  monthCard: {
    marginBottom: 12,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  monthTitle: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 18,
    letterSpacing: 0.5,
  },
  monthMeta: {
    marginLeft: 'auto',
    color: colors.textMuted,
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 0.3,
  },
  weekList: {
    marginTop: 8,
    gap: 8,
  },
  weekCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 12,
    padding: 14,
  },
  weekHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  weekLabel: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
  },
  weekBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  weekBadgeComplete: {
    backgroundColor: 'rgba(7,102,82,0.12)',
  },
  weekBadgeGap: {
    backgroundColor: 'rgba(229,184,11,0.18)',
  },
  weekBadgeText: {
    fontFamily: fonts.labelBold,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  weekBadgeTextComplete: {
    color: colors.green,
  },
  weekBadgeTextGap: {
    color: '#8A6A00',
  },
  weekGapText: {
    color: '#8A6A00',
    fontFamily: fonts.body,
    fontSize: 12,
    marginTop: 4,
  },
  workoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 12,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.background,
  },
  workoutName: {
    color: colors.text,
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
  },
  workoutMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  workoutDate: {
    color: colors.textMuted,
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 0.3,
  },
  typePill: {
    borderWidth: 1,
    borderColor: colors.green,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  typePillCow: {
    borderColor: colors.gold,
  },
  typePillText: {
    color: colors.green,
    fontFamily: fonts.labelBold,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  typePillTextCow: {
    color: '#8A6A00',
  },
  statusPill: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  statusPillDraft: {
    backgroundColor: colors.hairline,
  },
  statusPillScheduled: {
    // Opaque (not a tint) so this reads clearly whether it's sitting on a
    // white list row or the dark green "release this week" card — a
    // translucent green tint nearly disappears against that dark green.
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.green,
  },
  statusPillReleased: {
    backgroundColor: colors.green,
  },
  statusPillText: {
    color: colors.textMuted,
    fontFamily: fonts.labelBold,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  statusPillTextReleased: {
    color: colors.white,
  },
  statusPillTextScheduled: {
    color: colors.green,
  },
});
