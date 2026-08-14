import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { openFullSchedule } from '../lib/scheduleModal';
import { colors, fonts } from '../theme';

export function ScheduleStrip() {
  return (
    <View style={styles.wrap}>
      <View style={styles.lineOneRow}>
        <Ionicons name="arrow-up" size={13} color={colors.gold} />
        <Text style={styles.lineOne}>CLASS SIGN UP ABOVE + TODAY'S WOD</Text>
      </View>
      <Pressable onPress={openFullSchedule} hitSlop={8} testID="see-full-schedule">
        <Text style={styles.lineTwo}>SEE FULL SCHEDULE</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    marginBottom: 18,
  },
  lineOneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  lineOne: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 15,
    letterSpacing: 0.5,
  },
  lineTwo: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 11,
    letterSpacing: 1,
    textDecorationLine: 'underline',
  },
});
