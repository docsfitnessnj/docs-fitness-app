import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ModalHeader } from '../components/ModalHeader';
import { useProfile } from '../context/ProfileContext';
import { dayHasContent, formatDateKey, getTwoWeekCalendar, WeekDay } from '../data/content';
import { ClassRow, LOCATION_CITY, LOCATION_NAME, rowsForDate } from '../data/schedule';
import { openLocationMaps } from '../lib/links';
import { useClassBooking } from '../lib/useClassBooking';
import { navigateToTab } from '../lib/navigationRef';
import { colors, fonts } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// Only today and days after it have anywhere to land — the Community date
// strip this hands off to has never scrolled backward before today, and
// that stays true here too (see the module comment below).
function isPast(day: WeekDay): boolean {
  return day.date.getTime() < new Date(new Date().setHours(0, 0, 0, 0)).getTime();
}

type DayCellProps = {
  day: WeekDay;
  onOpenDay: (day: WeekDay) => void;
  // Online members get a real signup popup right on this grid instead of
  // just a class name — everyone else's tap behavior (the whole cell hands
  // off to the Community day view) is untouched. See onBookClass below.
  isOnlineMember: boolean;
  onBookClass: (row: ClassRow, day: WeekDay) => void;
};

function DayCell({ day, onOpenDay, isOnlineMember, onBookClass }: DayCellProps) {
  const rows = rowsForDate(day.date);
  const hasWorkout = dayHasContent(day);
  const past = isPast(day);

  return (
    <Pressable
      style={styles.cell}
      onPress={() => !past && onOpenDay(day)}
      disabled={past}
      testID={`calendar-cell-${day.date.toISOString().slice(0, 10)}`}
    >
      <View style={[styles.dateBadge, day.isToday && styles.dateBadgeToday]}>
        <Text style={[styles.dateNumber, day.isToday && styles.dateNumberToday, past && styles.pastText]}>
          {day.date.getDate()}
        </Text>
      </View>

      <View style={styles.cellBody}>
        {rows.map((row) =>
          isOnlineMember && !past ? (
            <Pressable
              key={row.id}
              onPress={(e) => {
                // Books right here instead of falling through to the outer
                // cell's onPress, which would just hand off to the
                // Community day view — a dead end for online members,
                // since that view never lists classes for them.
                e.stopPropagation();
                onBookClass(row, day);
              }}
              hitSlop={3}
              testID={`calendar-class-${row.id}-${day.date.toISOString().slice(0, 10)}`}
            >
              <Text style={styles.classChip} numberOfLines={1}>
                {row.className} {row.time}
              </Text>
            </Pressable>
          ) : (
            <Text key={row.id} style={[styles.classChip, past && styles.pastText]} numberOfLines={1}>
              {row.className} {row.time}
            </Text>
          )
        )}
      </View>

      {hasWorkout && <View style={[styles.workoutDot, past && styles.workoutDotPast]} />}
    </Pressable>
  );
}

// A real Mon-Sun-by-Mon-Sun calendar grid — this week and next week only,
// so it fits a phone screen without cramming. Tapping a day (today or
// later) hands off to the Community tab's own date strip and day view,
// exactly as tapping that strip directly does — this screen never shows
// its own copy of a day's classes/workout, just the two-week overview.
// The one exception: an online member tapping a specific class books it
// right here (see DayCell/onBookClass) instead of handing off, since
// Community's day view never lists classes for online members (that's
// the quiet TRAINING NEAR VENTNOR line's whole reason for existing) — this
// screen was previously the dead end.
export function FullScheduleScreen({ visible, onClose }: Props) {
  const { howTrain } = useProfile();
  const { handleSignUp } = useClassBooking();
  const isOnlineMember = howTrain === 'online';

  if (!visible) return null;

  const days = getTwoWeekCalendar();
  const thisWeek = days.slice(0, 7);
  const nextWeek = days.slice(7, 14);

  const openDay = (day: WeekDay) => {
    onClose();
    navigateToTab('Community', { jumpToDate: day.date.getTime() });
  };

  const bookClass = (row: ClassRow, day: WeekDay) => {
    const dateKey = formatDateKey(day.date);
    const weekdayName = day.date.toLocaleDateString('en-US', { weekday: 'long' });
    handleSignUp(row, dateKey, weekdayName);
  };

  return (
    <View style={styles.container}>
      <ModalHeader title="BOATHOUSE SCHEDULE" onBack={onClose} backTestID="close-full-schedule" />

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.headerRow}>
          {WEEKDAY_INITIALS.map((initial, i) => (
            <Text key={i} style={styles.headerCell}>
              {initial}
            </Text>
          ))}
        </View>

        <View style={styles.weekRow}>
          {thisWeek.map((day) => (
            <DayCell
              key={day.date.toISOString()}
              day={day}
              onOpenDay={openDay}
              isOnlineMember={isOnlineMember}
              onBookClass={bookClass}
            />
          ))}
        </View>
        <View style={styles.weekRow}>
          {nextWeek.map((day) => (
            <DayCell
              key={day.date.toISOString()}
              day={day}
              onOpenDay={openDay}
              isOnlineMember={isOnlineMember}
              onBookClass={bookClass}
            />
          ))}
        </View>

        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={styles.workoutDot} />
            <Text style={styles.legendText}>WOD / WEEKEND DAY</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.dateBadge, styles.dateBadgeToday, styles.legendBadge]}>
              <Text style={[styles.dateNumber, styles.dateNumberToday]}>·</Text>
            </View>
            <Text style={styles.legendText}>TODAY</Text>
          </View>
        </View>

        <Pressable style={styles.locationCard} onPress={openLocationMaps} testID="full-schedule-location">
          <Ionicons name="location-outline" size={20} color={colors.gold} />
          <View style={{ flex: 1 }}>
            <Text style={styles.locationName}>{LOCATION_NAME}</Text>
            <Text style={styles.locationCity}>{LOCATION_CITY} · Get directions</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.6)" />
        </Pressable>
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
    paddingHorizontal: 12,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: 'row',
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  headerCell: {
    flex: 1,
    textAlign: 'center',
    color: colors.textMuted,
    fontFamily: fonts.labelBold,
    fontSize: 12,
    letterSpacing: 0.5,
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  cell: {
    flex: 1,
    minHeight: 92,
    marginHorizontal: 1.5,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 3,
    alignItems: 'center',
  },
  dateBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  dateBadgeToday: {
    backgroundColor: colors.gold,
  },
  dateNumber: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
  },
  dateNumberToday: {
    color: colors.greenDeep,
  },
  pastText: {
    opacity: 0.4,
  },
  cellBody: {
    flex: 1,
    width: '100%',
    gap: 2,
  },
  classChip: {
    color: colors.green,
    fontFamily: fonts.labelSemiBold,
    fontSize: 7,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  workoutDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.gold,
    marginTop: 4,
  },
  workoutDotPast: {
    opacity: 0.4,
  },
  legendRow: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 4,
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendBadge: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  legendText: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.greenDeep,
    borderRadius: 12,
    padding: 16,
    marginTop: 4,
  },
  locationName: {
    color: colors.white,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
  },
  locationCity: {
    color: 'rgba(255,255,255,0.75)',
    fontFamily: fonts.body,
    fontSize: 13,
    marginTop: 2,
  },
});
