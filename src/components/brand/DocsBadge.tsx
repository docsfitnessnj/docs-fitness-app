import React from 'react';
import { Image, StyleSheet } from 'react-native';

type Props = {
  // white = white fill / black line art (for light surfaces).
  // black = black fill / white line art (for green or other dark surfaces).
  // light = transparent with white line art only (logo alone on green).
  variant: 'white' | 'black' | 'light';
  size?: number;
};

const SOURCES = {
  white: require('../../../assets/brand/badge-white.png'),
  black: require('../../../assets/brand/badge-black.png'),
  light: require('../../../assets/brand/badge-outline-light.png'),
};

// The real circular badge lockup ("DOC'S FITNESS" / "NEW JERSEY" arched
// around the kettlebell-wave mark). Both source PNGs are already transparent
// outside the ring; the borderRadius + overflow:hidden below is just a belt-
// and-suspenders mask so nothing square ever shows behind it.
export function DocsBadge({ variant, size = 96 }: Props) {
  return (
    <Image
      source={SOURCES[variant]}
      resizeMode="contain"
      style={[styles.badge, { width: size, height: size, borderRadius: size / 2 }]}
    />
  );
}

const styles = StyleSheet.create({
  badge: {
    overflow: 'hidden',
  },
});
