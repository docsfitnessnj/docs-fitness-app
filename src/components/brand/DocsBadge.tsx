import React from 'react';
import { Image, View, StyleSheet } from 'react-native';

type Props = {
  // white = transparent background, black ink (for light surfaces).
  // black = transparent background, white ink (for green or other dark
  // surfaces) — same real artwork, mechanically recolored.
  variant: 'white' | 'black';
  size?: number;
};

const SOURCES = {
  white: require('../../../assets/brand/badge-white.png'),
  black: require('../../../assets/brand/badge-black.png'),
};

// The artwork itself is cropped tight to its own ink (zero margin), so
// rendering it at the component's full `size` inside a circular mask leaves
// no tolerance at all — any real-world anti-aliasing/rounding clips the
// outermost ring or lettering right at the mask's edge, most visible at the
// small sizes used inside the story-ring avatar. Rendering it a bit smaller
// than the circular frame gives it breathing room everywhere this badge is
// used, since it's always masked to a circle.
const INSET_RATIO = 0.88;

// The real circular badge lockup ("DOC'S FITNESS" / "NEW JERSEY" arched
// around the kettlebell-wave mark).
export function DocsBadge({ variant, size = 96 }: Props) {
  const artSize = size * INSET_RATIO;
  return (
    <View style={[styles.frame, { width: size, height: size, borderRadius: size / 2 }]}>
      <Image source={SOURCES[variant]} resizeMode="contain" style={{ width: artSize, height: artSize }} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
