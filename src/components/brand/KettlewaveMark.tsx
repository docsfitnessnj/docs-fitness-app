import React from 'react';
import { Image } from 'react-native';

const SOURCE = require('../../../assets/brand/kettlewave-green.png');

// The real committed ink's own aspect ratio (kettlewave-green.png is cropped
// tight to its bounding box: 219x311) — used to size the width from a given
// height without distorting the mark.
const ASPECT_RATIO = 219 / 311;

type Props = {
  height?: number;
};

// The kettlebell-and-wave mark ALONE, no text ring, mechanically recolored
// to Augusta green from the real committed decal (DECAL 1: KETTLE-WAVE.png)
// — not the full circular badge DocsBadge renders. Deliberately a separate
// component rather than a DocsBadge variant: only the top bar and the story
// ring avatar use this; every other badge placement (hamburger drawer,
// welcome/sign-in, About, deck card backs, share images) keeps the full
// circular badge via DocsBadge untouched.
export function KettlewaveMark({ height = 32 }: Props) {
  return <Image source={SOURCE} resizeMode="contain" style={{ width: height * ASPECT_RATIO, height }} />;
}
