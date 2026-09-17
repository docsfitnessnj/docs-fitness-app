import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ModalHeader } from '../components/ModalHeader';
import {
  ContentWorkout,
  ContentWorkoutStatus,
  ContentWorkoutType,
  SCORING_TYPE_LABELS,
  monthLabel,
  useContentLibrary,
  weekMonthKey,
} from '../context/ContentLibraryContext';
import { getNextSunday, getWeekStart } from '../data/content';
import { defaultQuoteIndexForSunday, SUNDAY_QUOTES } from '../data/sundayQuotes';
import { showAlert } from '../lib/alert';
import { ContentBulkImportScreen } from './ContentBulkImportScreen';
import { ContentWorkoutForm } from './ContentWorkoutForm';
import { colors, fonts } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

type LibraryView =
  | { kind: 'list' }
  | { kind: 'form'; workout: ContentWorkout | null; defaultType?: ContentWorkoutType }
  | { kind: 'bulk' };

type LibraryTab = 'wod' | 'cow' | 'weekend' | 'schedule';
type WeekendSubTab = 'saturday' | 'sunday';

const DAY_MS = 24 * 60 * 60 * 1000;
const DOW_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

function StatusPill({ status }: { status: ContentWorkoutStatus }) {
  return (
    <View style={[styles.statusPill, statusPillStyle(status)]}>
      <Text style={[styles.statusPillText, statusPillTextStyle(status)]}>{status.toUpperCase()}</Text>
    </View>
  );
}

function statusPillStyle(status: ContentWorkoutStatus) {
  if (status === 'published') return styles.statusPillPublished;
  if (status === 'scheduled') return styles.statusPillScheduled;
  return styles.statusPillDraft;
}
function statusPillTextStyle(status: ContentWorkoutStatus) {
  if (status === 'published') return styles.statusPillTextPublished;
  if (status === 'scheduled') return styles.statusPillTextScheduled;
  return undefined;
}

// USED = this entry already occupies a real day in the SCHEDULE tab
// (`scheduled: true`); UNUSED = it's still sitting in the inventory list
// unplaced, whether freshly added or bulk-imported.
function UsedBadge({ used }: { used: boolean }) {
  return (
    <View style={[styles.usedBadge, used ? styles.usedBadgeUsed : styles.usedBadgeUnused]}>
      <Text style={[styles.usedBadgeText, used ? styles.usedBadgeTextUsed : styles.usedBadgeTextUnused]}>
        {used ? 'USED' : 'UNUSED'}
      </Text>
    </View>
  );
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

type ScheduleDayRow = {
  date: Date;
  slotType: ContentWorkoutType;
  workout: ContentWorkout | null;
};

// Mon/Tue/Thu/Fri are Doc's WOD slots, Wed is the Challenge of the Week slot
// (Part 4's weekly pattern) — Sat/Sun are rest days and never shown. A slot
// with no matching *scheduled* workout for that exact calendar day renders
// as "(unassigned)" rather than being skipped, so a week missing its
// Challenge (every week but the first, right now) is visible as a gap
// instead of silently disappearing.
function scheduleRowsForWeek(weekStart: number, scheduledWorkouts: ContentWorkout[]): ScheduleDayRow[] {
  const monday = new Date(weekStart);
  const rows: ScheduleDayRow[] = [];
  for (let offset = 0; offset < 5; offset++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + offset);
    const slotType: ContentWorkoutType = offset === 2 ? 'cow' : 'wod';
    const workout =
      scheduledWorkouts.find((w) => w.type === slotType && isSameCalendarDay(new Date(w.releaseAt), date)) ?? null;
    rows.push({ date, slotType, workout });
  }
  return rows;
}

function scheduleDayLabel(date: Date): string {
  const dow = DOW_NAMES[date.getDay()];
  const month = date.toLocaleDateString('en-US', { month: 'long' }).toUpperCase();
  return `${dow}, ${month} ${date.getDate()}`;
}

type ScheduleWeekStatus = 'draft' | 'published' | 'mixed';

function weekStatusOf(rows: ScheduleDayRow[]): ScheduleWeekStatus {
  const statuses = rows.map((r) => r.workout?.status).filter((s): s is ContentWorkoutStatus => !!s);
  if (statuses.length === 0) return 'draft';
  const allPublished = statuses.every((s) => s === 'published');
  const allDraftish = statuses.every((s) => s !== 'published');
  if (allPublished) return 'published';
  if (allDraftish) return 'draft';
  return 'mixed';
}

function scheduleWeekLabel(weekStart: number): string {
  const monday = new Date(weekStart);
  const friday = new Date(weekStart + 4 * DAY_MS);
  const startStr = monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endStr =
    monday.getMonth() === friday.getMonth()
      ? friday.toLocaleDateString('en-US', { day: 'numeric' })
      : friday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${startStr}–${endStr}`.toUpperCase();
}

function formatReleaseAt(ms: number): string {
  return (
    new Date(ms).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }) +
    ' · ' +
    new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  );
}

// Admin-only workout planning calendar — draft, schedule, and publish Doc's
// WODs and the Challenge of the Week ahead of time. Everything here
// reads/writes ContentLibraryContext, which is local-only for now (see that
// file's storage-key comment); nothing in this screen is visible to members
// unless its status is PUBLISHED.
export function ContentLibraryScreen({ visible, onClose }: Props) {
  const {
    workouts,
    addWorkout,
    updateWorkout,
    deleteWorkout,
    importWorkouts,
    publishWeek,
    unpublishWeek,
    publishDay,
    unpublishDay,
    resetToSeed,
    quoteCycleAnchor,
    restartQuoteCycle,
  } = useContentLibrary();
  const [view, setView] = useState<LibraryView>({ kind: 'list' });
  // Kept in this same component instance (not reset by switching to the
  // form/bulk-import sub-views and back) so the tab choice persists while
  // navigating within the library — it only resets if the whole screen is
  // closed and reopened.
  const [activeTab, setActiveTab] = useState<LibraryTab>('wod');
  const [weekendSubTab, setWeekendSubTab] = useState<WeekendSubTab>('saturday');
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(() => new Set());

  // DOC'S WODS / DOC'S COWS: a plain numbered inventory, in the order each
  // entry was added (import order for the seeded 125, append order for
  // anything added since) — not by release date, since most of the
  // inventory hasn't been placed on the calendar at all yet.
  const wodList = useMemo(
    () => workouts.filter((w) => w.type === 'wod').sort((a, b) => a.createdAt - b.createdAt),
    [workouts]
  );
  const cowList = useMemo(
    () => workouts.filter((w) => w.type === 'cow').sort((a, b) => a.createdAt - b.createdAt),
    [workouts]
  );
  const steadyStateList = useMemo(
    () => workouts.filter((w) => w.type === 'steady_state').sort((a, b) => a.releaseAt - b.releaseAt),
    [workouts]
  );
  const sundaySetupList = useMemo(
    () => workouts.filter((w) => w.type === 'sunday_setup').sort((a, b) => a.releaseAt - b.releaseAt),
    [workouts]
  );

  const upcomingSunday = useMemo(() => getNextSunday(), []);
  const upcomingSundayEntry = sundaySetupList.find((w) => isSameCalendarDay(new Date(w.releaseAt), upcomingSunday) && w.status === 'published');
  const upcomingSundayQuoteIndex =
    upcomingSundayEntry?.quoteOverrideIndex ?? defaultQuoteIndexForSunday(upcomingSunday, new Date(quoteCycleAnchor));

  // SCHEDULE: every week that has at least one *scheduled* workout in it,
  // grouped by month — each week expands into its 5 weekday slots via
  // scheduleRowsForWeek, so a week with 4 WODs but no Challenge yet still
  // shows Wednesday as an explicit gap rather than vanishing.
  const scheduledWorkouts = useMemo(() => workouts.filter((w) => w.scheduled), [workouts]);
  const scheduleWeekStarts = useMemo(() => {
    const set = new Set<number>();
    for (const w of scheduledWorkouts) set.add(getWeekStart(new Date(w.releaseAt)).getTime());
    return Array.from(set).sort((a, b) => a - b);
  }, [scheduledWorkouts]);
  const scheduleMonths = useMemo(() => {
    const byMonth = new Map<string, number[]>();
    for (const weekStart of scheduleWeekStarts) {
      const key = weekMonthKey(weekStart);
      const list = byMonth.get(key);
      if (list) list.push(weekStart);
      else byMonth.set(key, [weekStart]);
    }
    return Array.from(byMonth.entries())
      .map(([monthKey, weekStarts]) => ({ monthKey, weekStarts }))
      .sort((a, b) => (a.monthKey > b.monthKey ? 1 : -1));
  }, [scheduleWeekStarts]);

  // First render: open the SCHEDULE month closest to today, so the tab
  // never lands on a wall of collapsed rows.
  const [initialized, setInitialized] = useState(false);
  if (!initialized && scheduleMonths.length > 0) {
    const today = new Date();
    const todayScore = today.getFullYear() * 12 + today.getMonth();
    const closest = scheduleMonths.reduce((best, m) => {
      const [y, mo] = m.monthKey.split('-').map(Number);
      const diff = Math.abs(y * 12 + mo - todayScore);
      const [by, bmo] = best.monthKey.split('-').map(Number);
      const bestDiff = Math.abs(by * 12 + bmo - todayScore);
      return diff < bestDiff ? m : best;
    }, scheduleMonths[0]);
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
        defaultType={view.defaultType}
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

  const handleResetToSeed = () => {
    showAlert(
      'Reset to imported library?',
      'This clears every local draft, edit, and manually-added entry on this device and reloads the full imported library exactly as shipped. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset', style: 'destructive', onPress: resetToSeed },
      ]
    );
  };

  const handlePublishWeek = (weekStart: number, rows: ScheduleDayRow[]) => {
    const count = rows.filter((r) => r.workout).length;
    if (count === 0) return;
    showAlert(
      `Publish ${scheduleWeekLabel(weekStart)}?`,
      `All ${count} entr${count === 1 ? 'y' : 'ies'} this week will go PUBLISHED. This is local-only until the backend is connected — nothing goes live to members yet.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Publish', onPress: () => publishWeek(weekStart) },
      ]
    );
  };

  const handleUnpublishWeek = (weekStart: number) => {
    showAlert('Return this week to DRAFT?', 'Members would stop seeing this week\'s entries.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Return to Draft', onPress: () => unpublishWeek(weekStart) },
    ]);
  };

  const renderInventoryList = (list: ContentWorkout[], type: ContentWorkoutType) => (
    <>
      <View style={styles.actionRow}>
        <Pressable
          style={styles.actionButton}
          onPress={() => setView({ kind: 'form', workout: null, defaultType: type })}
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

      {list.length === 0 ? (
        <Text style={styles.emptyText}>Nothing here yet. Add a workout above, or bulk-paste a batch.</Text>
      ) : (
        list.map((w, i) => (
          <Pressable
            key={w.id}
            style={styles.inventoryRow}
            onPress={() => setView({ kind: 'form', workout: w })}
            testID={`content-workout-${w.id}`}
          >
            <Text style={styles.inventoryIndex}>{i + 1}.</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.workoutName} numberOfLines={1}>
                {w.name}
              </Text>
              <View style={styles.workoutMetaRow}>
                <Text style={styles.workoutDate}>{formatReleaseAt(w.releaseAt)}</Text>
                {w.type === 'cow' && w.scoringType && (
                  <Text style={styles.workoutScoring}>{SCORING_TYPE_LABELS[w.scoringType]}</Text>
                )}
              </View>
            </View>
            <UsedBadge used={!!w.scheduled} />
            <StatusPill status={w.status} />
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Pressable>
        ))
      )}
    </>
  );

  const handleRestartQuoteCycle = () => {
    showAlert(
      'Restart quotes from the top?',
      `The upcoming Sunday (${scheduleDayLabel(upcomingSunday)}) will use quote #1, and every Sunday after it will count forward from there. This doesn't change any week's quote you've already overridden by hand.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Restart', onPress: restartQuoteCycle },
      ]
    );
  };

  const renderWeekend = () => (
    <>
      <View style={styles.weekendSubTabRow}>
        <Pressable
          style={[styles.weekendSubTab, weekendSubTab === 'saturday' && styles.weekendSubTabActive]}
          onPress={() => setWeekendSubTab('saturday')}
          testID="content-weekend-sub-saturday"
        >
          <Text style={[styles.weekendSubTabText, weekendSubTab === 'saturday' && styles.weekendSubTabTextActive]}>
            STEADY STATE SATURDAY
          </Text>
        </Pressable>
        <Pressable
          style={[styles.weekendSubTab, weekendSubTab === 'sunday' && styles.weekendSubTabActive]}
          onPress={() => setWeekendSubTab('sunday')}
          testID="content-weekend-sub-sunday"
        >
          <Text style={[styles.weekendSubTabText, weekendSubTab === 'sunday' && styles.weekendSubTabTextActive]}>
            SUNDAY SETUP
          </Text>
        </Pressable>
      </View>

      {weekendSubTab === 'sunday' && (
        <View style={styles.quoteLibraryCard} testID="content-quote-library">
          <Text style={styles.quoteLibraryTitle}>SUNDAY QUOTE LIBRARY</Text>
          <Text style={styles.quoteLibraryUpcoming}>
            Upcoming Sunday ({scheduleDayLabel(upcomingSunday)}) uses quote #{upcomingSundayQuoteIndex + 1}
            {upcomingSundayEntry?.quoteOverrideIndex != null ? ' — overridden for this week' : ' — from the cycle'}.
          </Text>
          {SUNDAY_QUOTES.map((q, i) => (
            <View
              key={i}
              style={[styles.quoteLibraryRow, i === upcomingSundayQuoteIndex && styles.quoteLibraryRowUpcoming]}
            >
              <Text style={styles.quoteLibraryNumber}>{i + 1}.</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.quoteLibraryText}>"{q.text}"</Text>
                <Text style={styles.quoteLibraryAttribution}>{q.attribution}</Text>
              </View>
            </View>
          ))}
          <Pressable style={styles.restartButton} onPress={handleRestartQuoteCycle} testID="content-restart-quotes">
            <Ionicons name="refresh-outline" size={14} color={colors.white} />
            <Text style={styles.restartButtonText}>RESTART QUOTES FROM THE TOP</Text>
          </Pressable>
        </View>
      )}

      {weekendSubTab === 'saturday'
        ? renderInventoryList(steadyStateList, 'steady_state')
        : renderInventoryList(sundaySetupList, 'sunday_setup')}
    </>
  );

  const renderSchedule = () => (
    <>
      {scheduleMonths.length === 0 ? (
        <Text style={styles.emptyText}>Nothing scheduled yet.</Text>
      ) : (
        scheduleMonths.map((month) => {
          const isOpen = expandedMonths.has(month.monthKey);
          return (
            <View key={month.monthKey} style={styles.monthCard}>
              <Pressable
                style={styles.monthHeader}
                onPress={() => toggleMonth(month.monthKey)}
                testID={`content-month-${month.monthKey}`}
              >
                <Ionicons name={isOpen ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.text} />
                <Text style={styles.monthTitle}>{monthLabel(month.monthKey)}</Text>
              </Pressable>

              {isOpen && (
                <View style={styles.weekList}>
                  {month.weekStarts.map((weekStart) => {
                    const rows = scheduleRowsForWeek(weekStart, scheduledWorkouts);
                    const status = weekStatusOf(rows);
                    return (
                      <View key={weekStart} style={styles.weekCard} testID={`content-schedule-week-${weekStart}`}>
                        <View style={styles.weekHeader}>
                          <Text style={styles.weekLabel}>{scheduleWeekLabel(weekStart)}</Text>
                          <View
                            style={[
                              styles.weekStatusBadge,
                              status === 'published' && styles.weekStatusBadgePublished,
                              status === 'mixed' && styles.weekStatusBadgeMixed,
                            ]}
                          >
                            <Text
                              style={[
                                styles.weekStatusBadgeText,
                                status === 'published' && styles.weekStatusBadgeTextPublished,
                              ]}
                            >
                              {status === 'published' ? 'PUBLISHED' : status === 'mixed' ? 'MIXED' : 'DRAFT'}
                            </Text>
                          </View>
                        </View>

                        {rows.map((row) => (
                          <View key={row.date.toISOString()} style={styles.dayRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.dayRowText}>
                                {scheduleDayLabel(row.date)}
                                {' — '}
                                {row.slotType === 'cow' && "DOC'S COW — "}
                                {row.workout ? row.workout.name : '(unassigned)'}
                              </Text>
                            </View>
                            {row.workout && (
                              <>
                                <StatusPill status={row.workout.status} />
                                <Pressable
                                  style={styles.dayToggleButton}
                                  onPress={() =>
                                    row.workout!.status === 'published'
                                      ? unpublishDay(row.workout!.id)
                                      : publishDay(row.workout!.id)
                                  }
                                  testID={`content-day-toggle-${row.workout.id}`}
                                >
                                  <Text style={styles.dayToggleButtonText}>
                                    {row.workout.status === 'published' ? 'DRAFT' : 'PUBLISH'}
                                  </Text>
                                </Pressable>
                              </>
                            )}
                          </View>
                        ))}

                        <View style={styles.weekButtonRow}>
                          <Pressable
                            style={[styles.weekPublishButton, status === 'published' && styles.weekButtonDisabled]}
                            disabled={status === 'published'}
                            onPress={() => handlePublishWeek(weekStart, rows)}
                            testID={`content-publish-week-${weekStart}`}
                          >
                            <Text style={styles.weekPublishButtonText}>PUBLISH THIS WEEK</Text>
                          </Pressable>
                          <Pressable
                            style={[styles.weekUnpublishButton, status === 'draft' && styles.weekButtonDisabled]}
                            disabled={status === 'draft'}
                            onPress={() => handleUnpublishWeek(weekStart)}
                            testID={`content-unpublish-week-${weekStart}`}
                          >
                            <Text style={styles.weekUnpublishButtonText}>UNPUBLISH / RETURN TO DRAFT</Text>
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })
      )}
    </>
  );

  return (
    <View style={styles.container}>
      <ModalHeader title="CONTENT LIBRARY" onBack={onClose} backTestID="close-content-library" />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.localBanner} testID="content-local-only-banner">
          <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
          <Text style={styles.localBannerText}>
            Drafts are stored locally on this device until the backend is connected. Members never see anything
            that isn't PUBLISHED.
          </Text>
        </View>

        <Pressable style={styles.resetToSeedButton} onPress={handleResetToSeed} testID="content-reset-to-seed">
          <Ionicons name="refresh-outline" size={13} color={colors.textMuted} />
          <Text style={styles.resetToSeedButtonText}>RESET TO SEED LIBRARY</Text>
        </Pressable>

        <View style={styles.tabRow}>
          <Pressable
            style={[styles.tab, activeTab === 'wod' && styles.tabActive]}
            onPress={() => setActiveTab('wod')}
            testID="content-tab-wod"
          >
            <Text style={[styles.tabText, activeTab === 'wod' && styles.tabTextActive]}>DOC'S WODS</Text>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === 'cow' && styles.tabActive]}
            onPress={() => setActiveTab('cow')}
            testID="content-tab-cow"
          >
            <Text style={[styles.tabText, activeTab === 'cow' && styles.tabTextActive]}>DOC'S COWS</Text>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === 'weekend' && styles.tabActive]}
            onPress={() => setActiveTab('weekend')}
            testID="content-tab-weekend"
          >
            <Text style={[styles.tabText, activeTab === 'weekend' && styles.tabTextActive]}>WEEKEND</Text>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === 'schedule' && styles.tabActive]}
            onPress={() => setActiveTab('schedule')}
            testID="content-tab-schedule"
          >
            <Text style={[styles.tabText, activeTab === 'schedule' && styles.tabTextActive]}>SCHEDULE</Text>
          </Pressable>
        </View>

        {activeTab === 'wod' && renderInventoryList(wodList, 'wod')}
        {activeTab === 'cow' && renderInventoryList(cowList, 'cow')}
        {activeTab === 'weekend' && renderWeekend()}
        {activeTab === 'schedule' && renderSchedule()}
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
  resetToSeedButton: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: 5,
    marginBottom: 16,
  },
  resetToSeedButtonText: {
    color: colors.textMuted,
    fontFamily: fonts.labelBold,
    fontSize: 10,
    letterSpacing: 0.5,
    textDecorationLine: 'underline',
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.hairline,
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 9,
  },
  tabActive: {
    backgroundColor: colors.green,
  },
  tabText: {
    color: colors.textMuted,
    fontFamily: fonts.labelBold,
    fontSize: 12,
    letterSpacing: 0.5,
  },
  tabTextActive: {
    color: colors.white,
  },
  emptyText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13,
  },
  inventoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  inventoryIndex: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 13,
    width: 28,
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
  workoutScoring: {
    color: colors.gold,
    fontFamily: fonts.labelBold,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  usedBadge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  usedBadgeUsed: {
    backgroundColor: 'rgba(7,102,82,0.12)',
  },
  usedBadgeUnused: {
    backgroundColor: colors.hairline,
  },
  usedBadgeText: {
    fontFamily: fonts.labelBold,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  usedBadgeTextUsed: {
    color: colors.green,
  },
  usedBadgeTextUnused: {
    color: colors.textMuted,
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
    // Opaque (not a tint) so this reads clearly on either a white list row
    // or a dark card — a translucent green tint nearly disappears on dark.
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.green,
  },
  statusPillPublished: {
    backgroundColor: colors.green,
  },
  statusPillText: {
    color: colors.textMuted,
    fontFamily: fonts.labelBold,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  statusPillTextPublished: {
    color: colors.white,
  },
  statusPillTextScheduled: {
    color: colors.green,
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
  weekList: {
    marginTop: 8,
    gap: 10,
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
    marginBottom: 8,
  },
  weekLabel: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
  },
  weekStatusBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: colors.hairline,
  },
  weekStatusBadgePublished: {
    backgroundColor: 'rgba(7,102,82,0.12)',
  },
  weekStatusBadgeMixed: {
    backgroundColor: 'rgba(229,184,11,0.18)',
  },
  weekStatusBadgeText: {
    fontFamily: fonts.labelBold,
    fontSize: 10,
    letterSpacing: 0.5,
    color: colors.textMuted,
  },
  weekStatusBadgeTextPublished: {
    color: colors.green,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.background,
  },
  dayRowText: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
  },
  dayToggleButton: {
    borderWidth: 1,
    borderColor: colors.green,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dayToggleButtonText: {
    color: colors.green,
    fontFamily: fonts.labelBold,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  weekButtonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  weekPublishButton: {
    flex: 1,
    backgroundColor: colors.green,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  weekPublishButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  weekUnpublishButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  weekUnpublishButtonText: {
    color: colors.textMuted,
    fontFamily: fonts.labelBold,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  weekButtonDisabled: {
    opacity: 0.4,
  },
  weekendSubTabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  weekendSubTab: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: colors.card,
  },
  weekendSubTabActive: {
    backgroundColor: colors.green,
    borderColor: colors.green,
  },
  weekendSubTabText: {
    color: colors.textMuted,
    fontFamily: fonts.labelBold,
    fontSize: 10,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  weekendSubTabTextActive: {
    color: colors.white,
  },
  quoteLibraryCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  quoteLibraryTitle: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 16,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  quoteLibraryUpcoming: {
    color: colors.green,
    fontFamily: fonts.labelSemiBold,
    fontSize: 11,
    letterSpacing: 0.3,
    lineHeight: 15,
    marginBottom: 12,
  },
  quoteLibraryRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.background,
  },
  quoteLibraryRowUpcoming: {
    backgroundColor: 'rgba(229,184,11,0.12)',
    borderRadius: 8,
    paddingHorizontal: 6,
  },
  quoteLibraryNumber: {
    color: colors.textMuted,
    fontFamily: fonts.labelBold,
    fontSize: 12,
    width: 20,
  },
  quoteLibraryText: {
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 16,
  },
  quoteLibraryAttribution: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 10,
    letterSpacing: 0.3,
    marginTop: 3,
  },
  restartButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.green,
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 14,
  },
  restartButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 11,
    letterSpacing: 0.5,
  },
});
