import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { openFullSchedule } from '../lib/scheduleModal';
import { colors, fonts } from '../theme';

export function ScheduleStrip() {
  return (
    <View style={styles.wrap}>
      <Pressable onPress={openFullSchedule} hitSlop={8} style={styles.linkRow} testID="see-full-schedule">
        <Ionicons name="calendar-outline" size={13} color={colors.textMuted} />
        <Text style={styles.lineTwo}>SEE FULL WEEKLY SCHEDULE</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    marginBottom: 18,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  lineTwo: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 11,
    letterSpacing: 1,
    textDecorationLine: 'underline',
  },
});
