import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../theme';

type Props = {
  size?: 'large' | 'small';
};

const PATTERN_POSITIONS = [
  { top: '12%', left: '15%' },
  { top: '12%', left: '55%' },
  { top: '38%', left: '35%' },
  { top: '62%', left: '15%' },
  { top: '62%', left: '55%' },
  { top: '85%', left: '35%' },
];

// Deep-green card back, white border, brand mark pattern, dead center wordmark.
export function CardBack({ size = 'small' }: Props) {
  const isLarge = size === 'large';

  return (
    <View style={[styles.card, isLarge ? styles.cardLarge : styles.cardSmall]}>
      {isLarge &&
        PATTERN_POSITIONS.map((pos, index) => (
          <Ionicons
            key={index}
            name="fitness"
            size={14}
            color="rgba(255,255,255,0.14)"
            style={[styles.patternIcon, pos as any]}
          />
        ))}
      <View style={[styles.innerBorder, isLarge ? styles.innerBorderLarge : styles.innerBorderSmall]}>
        <Ionicons name="fitness" size={isLarge ? 30 : 16} color={colors.gold} />
        {isLarge && <Text style={styles.wordmark}>DOC'S{'\n'}FITNESS</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.greenDeep,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cardLarge: {
    width: 180,
    aspectRatio: 0.7,
  },
  cardSmall: {
    width: '100%',
    height: '100%',
  },
  patternIcon: {
    position: 'absolute',
  },
  innerBorder: {
    borderWidth: 1,
    borderColor: 'rgba(255,213,32,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerBorderLarge: {
    width: '78%',
    height: '55%',
    borderRadius: 8,
  },
  innerBorderSmall: {
    width: '70%',
    height: '70%',
    borderRadius: 6,
  },
  wordmark: {
    color: colors.white,
    fontFamily: fonts.headline,
    fontSize: 15,
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 16,
  },
});
