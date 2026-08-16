import React from 'react';
import { StyleSheet, View } from 'react-native';
import { DocsBadgeLogo } from './brand/DocsBadgeLogo';
import { colors } from '../theme';

type Props = {
  size?: 'large' | 'small';
};

// Black card back, thin gold border, the white circular badge centered.
export function CardBack({ size = 'small' }: Props) {
  const isLarge = size === 'large';

  return (
    <View style={[styles.card, isLarge ? styles.cardLarge : styles.cardSmall]}>
      <DocsBadgeLogo color={colors.white} size={isLarge ? 108 : 40} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#000000',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.gold,
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
});
