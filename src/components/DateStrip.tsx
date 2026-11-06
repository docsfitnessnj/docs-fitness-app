import React, { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dayHasContent, WeekDay } from '../data/content';
import { useTour } from '../context/TourContext';
import { colors, fonts } from '../theme';

// cellFixedWidth (54) + its marginHorizontal (2 each side) — the scrollable
// strip's per-cell footprint, used to scroll a non-adjacent selection (e.g.
// a Full Schedule calendar tap) into view instead of leaving it off-screen.
const SCROLLABLE_ITEM_WIDTH = 58;

type Props = {
  week: WeekDay[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  isUnlocked: (index: number) => boolean;
  isCompleted: (index: number) => boolean;
  // Round 46: true for Wednesday only when a real released scheduled week
  // covers this strip's week — that cell shows "COW" instead of a numeric
  // fraction or "REST," and the fraction's own denominator (below) counts
  // only real WOD-bearing days, so a 4-WOD covered week correctly reads
  // 1/4..4/4 instead of 1/5..5/5. Omitted entirely by every caller that
  // isn't a Mon-Sun week (the booking strip), where it's simply never true.
  isCowDayAt?: (index: number) => boolean;
  // Fixed-width, horizontally scrollable cells for a rolling multi-week range
  // (the booking strip) instead of the default 7-cell Mon-Sun row that fills
  // the screen width edge to edge.
  scrollable?: boolean;
  // Optional fixed element pinned to the left of the scrollable strip (the
  // story ring on Community), outside the horizontal scroll so it stays put.
  leading?: React.ReactNode;
};

export function DateStrip({
  week,
  selectedIndex,
  onSelect,
  isUnlocked,
  isCompleted,
  isCowDayAt,
  scrollable = false,
  leading,
}: Props) {
  const { registerTarget } = useTour();
  const scrollRef = useRef<ScrollView>(null);

  // A selection can land outside the visible window (e.g. tapping a day two
  // weeks out on the Full Schedule calendar) — bring it on-screen with a
  // couple of prior days still visible for context, same as scrolling there
  // by hand would leave it.
  useEffect(() => {
    if (!scrollable) return;
    const targetOffset = Math.max(0, (selectedIndex - 2) * SCROLLABLE_ITEM_WIDTH);
    scrollRef.current?.scrollTo({ x: targetOffset, animated: true });
  }, [scrollable, selectedIndex]);

  const cells = week.map((day, index) => {
    const selected = index === selectedIndex;
    const cowDay = isCowDayAt?.(index) ?? false;
    const hasContent = dayHasContent(day) || cowDay;
    const locked = hasContent && !cowDay && !isUnlocked(index);
    const completed = hasContent && !cowDay && isCompleted(index);

    return (
      <Pressable
        key={index}
        onPress={() => onSelect(index)}
        testID={`date-strip-cell-${index}`}
        style={[
          styles.cell,
          scrollable && styles.cellFixedWidth,
          day.isToday && !selected && styles.cellToday,
          selected && styles.cellSelected,
          !hasContent && styles.cellRest,
        ]}
      >
        <Text style={[styles.dayLabel, selected && styles.textSelected, !hasContent && !selected && styles.textDim]}>
          {day.label}
        </Text>
        <Text style={[styles.dateNumber, selected && styles.textSelected, !hasContent && !selected && styles.textDim]}>
          {day.dateNumber}
        </Text>
        {locked ? (
          <Ionicons name="lock-closed" size={11} color={selected ? colors.white : colors.textMuted} />
        ) : completed ? (
          <Ionicons name="checkmark" size={13} color={selected ? colors.white : colors.gold} />
        ) : cowDay ? (
          <Text style={[styles.cowLabel, selected && styles.textSelected]}>COW</Text>
        ) : (
          <Text style={[styles.fractionLabel, selected && styles.textSelected, !hasContent && !selected && styles.textDim]}>
            {!hasContent ? 'REST' : day.weekendKind ? '' : weekdayFraction(day, index, week, isCowDayAt)}
          </Text>
        )}
      </Pressable>
    );
  });

  if (scrollable) {
    return (
      <View style={styles.scrollWrap} ref={registerTarget('date-strip')} testID="date-strip-scroll-wrap">
        {leading && (
          <>
            <View style={styles.leadingSlot}>{leading}</View>
            <View style={styles.leadingDivider} />
          </>
        )}
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.scrollRow}
          contentContainerStyle={styles.scrollRowContent}
        >
          {cells}
        </ScrollView>
      </View>
    );
  }

  return <View style={styles.row}>{cells}</View>;
}

function mondayStartOf(date: Date): number {
  const d = new Date(date);
  const jsDay = d.getDay();
  d.setDate(d.getDate() + (jsDay === 0 ? -6 : 1 - jsDay));
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// "N/5" (legacy) or "N/4" (a real Round 46 scheduled week, Wednesday
// excluded as COW day) — scoped to THIS day's own Monday-Sunday week, never
// the full `week` array, since the booking strip's own `week` can span
// several calendar weeks back to back (a flat position within the whole
// array would read "6/9" instead of resetting to "1/4" at the next Monday).
function weekdayFraction(day: WeekDay, index: number, week: WeekDay[], isCowDayAt?: (i: number) => boolean): string {
  const monday = mondayStartOf(day.date);
  const sameWeekWodDays = week.filter(
    (d, i) => !!d.wod && mondayStartOf(d.date) === monday && !(isCowDayAt?.(i) ?? false)
  );
  const position = sameWeekWodDays.indexOf(day) + 1;
  return `${position}/${sameWeekWodDays.length}`;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: 6,
    marginBottom: 16,
  },
  scrollWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.hairline,
    marginBottom: 16,
  },
  leadingSlot: {
    paddingLeft: 6,
    justifyContent: 'center',
  },
  leadingDivider: {
    width: 1,
    alignSelf: 'stretch',
    marginVertical: 8,
    backgroundColor: colors.hairline,
  },
  scrollRow: {
    flex: 1,
  },
  scrollRowContent: {
    padding: 6,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    marginHorizontal: 2,
    borderRadius: 8,
  },
  cellFixedWidth: {
    flex: undefined,
    width: 54,
  },
  cellToday: {
    borderWidth: 1,
    borderColor: colors.green,
  },
  cellSelected: {
    backgroundColor: colors.green,
  },
  cellRest: {
    opacity: 0.7,
  },
  dayLabel: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  dateNumber: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    marginVertical: 2,
  },
  textSelected: {
    color: colors.white,
  },
  textDim: {
    color: colors.textMuted,
  },
  fractionLabel: {
    color: colors.green,
    fontFamily: fonts.labelSemiBold,
    fontSize: 10,
  },
  cowLabel: {
    color: colors.gold,
    fontFamily: fonts.labelBold,
    fontSize: 10,
    letterSpacing: 0.3,
  },
});
