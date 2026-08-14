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
              day.isToday && !selected && styles.cellToday,
              selected && styles.cellSelected,
              day.isRestDay && styles.cellRest,
            ]}
          >
            <Text style={[styles.dayLabel, selected && styles.textSelected, day.isRestDay && !selected && styles.textDim]}>
              {day.label}
            </Text>
            <Text style={[styles.dateNumber, selected && styles.textSelected, day.isRestDay && !selected && styles.textDim]}>
              {day.dateNumber}
            </Text>
            {locked ? (
              <Ionicons name="lock-closed" size={11} color={selected ? colors.white : colors.textMuted} />
            ) : completed ? (
              <Ionicons name="checkmark" size={13} color={selected ? colors.white : colors.gold} />
            ) : (
              <Text style={[styles.fractionLabel, selected && styles.textSelected, day.isRestDay && !selected && styles.textDim]}>
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
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: 6,
    marginBottom: 16,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    marginHorizontal: 2,
    borderRadius: 8,
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
});
