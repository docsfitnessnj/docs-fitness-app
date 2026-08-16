import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { KettlebellWaveMark } from './KettlebellWaveMark';
import { fonts } from '../../theme';

type Props = {
  color: string;
  size?: number;
};

// Kettlebell-wave mark + divider + "DOC'S / FITNESS NJ" wordmark, matching
// the app's own headline type — used in footers (Welcome, Pricing).
export function DocsHorizontalLockup({ color, size = 22 }: Props) {
  return (
    <View style={styles.row}>
      <KettlebellWaveMark color={color} size={size} strokeWidth={9} />
      <View style={[styles.divider, { backgroundColor: color, height: size }]} />
      <Text style={[styles.wordmark, { color, fontSize: size * 0.62, lineHeight: size * 0.62 }]}>
        DOC'S{'\n'}FITNESS NJ
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  divider: {
    width: 2,
    marginHorizontal: 10,
  },
  wordmark: {
    fontFamily: fonts.headline,
    letterSpacing: 0.5,
  },
});
