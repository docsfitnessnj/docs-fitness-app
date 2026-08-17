import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { colors } from '../theme';

type Props = {
  size?: 'large' | 'small';
};

const CARD_BACK_IMAGE = require('../../assets/brand/deck-card-back.jpg');

// The real card back art: black background, white line-art badge baked in.
// Thin gold border around the edge — this is the back of all 54 Deck of
// WODs cards, in both shuffle mode and browse mode.
export function CardBack({ size = 'small' }: Props) {
  const isLarge = size === 'large';

  return (
    <View style={[styles.card, isLarge ? styles.cardLarge : styles.cardSmall]}>
      <Image source={CARD_BACK_IMAGE} resizeMode="cover" style={styles.image} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#000000',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.gold,
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
  image: {
    width: '100%',
    height: '100%',
  },
});
