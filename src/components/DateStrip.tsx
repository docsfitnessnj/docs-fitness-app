import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WeekDay } from '../data/content';
import { colors, fonts } from '../theme';

type Props = {
  week: WeekDay[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  isUnlocked: (index: number) => boolean;
  isCompleted: (index: number) => boolean;
};

export function DateStrip({ week, selectedIndex, onSelect, isUnlocked, isCompleted }: Props) {
  return (
    <View style={styles.row}>
      {week.map((day, index) => {
        const selected = index === selectedIndex;
        const locked = !day.isRestDay && !isUnlocked(index);
        const completed = !day.isRestDay && isCompleted(index);

        return (
          <Pressable
            key={day.label}
            onPress={() => onSelect(index)}
            style={[
              styles.cell,
              selected && styles.cellSelected,
              day.isToday && !selected && styles.cellToday,
            ]}
          >
            <Text style={[styles.dayLabel, selected && styles.dayLabelSelected]}>{day.label}</Text>
            <Text style={[styles.dateNumber, selected && styles.dayLabelSelected]}>{day.dateNumber}</Text>
            {locked ? (
              <Ionicons name="lock-closed" size={12} color={selected ? colors.background : colors.textMuted} />
            ) : completed ? (
              <View style={styles.completedDot}>
                <Ionicons name="checkmark" size={10} color={colors.background} />
              </View>
            ) : (
              <Text style={[styles.fractionLabel, selected && styles.dayLabelSelected]}>
                {day.isRestDay ? 'REST' : `${weekdayNumber(day)}/5`}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

function weekdayNumber(day: WeekDay): number {
  return ['MON', 'TUE', 'WED', 'THU', 'FRI'].indexOf(day.label) + 1;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    marginHorizontal: 2,
    borderRadius: 10,
    backgroundColor: colors.backgroundLight,
  },
  cellToday: {
    borderWidth: 1,
    borderColor: colors.highlight,
  },
  cellSelected: {
    backgroundColor: colors.highlight,
  },
  dayLabel: {
    color: colors.textMuted,
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  dateNumber: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    marginVertical: 2,
  },
  dayLabelSelected: {
    color: colors.background,
  },
  fractionLabel: {
    color: colors.accent,
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
  },
  completedDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#4CAF7D',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
